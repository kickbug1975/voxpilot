'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { decrypt, encrypt } from '@/lib/encryption';
import { env } from '@/lib/env';
import { findClosestCustomer } from '@/lib/voiceQueryLookup';
import { revalidatePath } from 'next/cache';

async function refreshMicrosoftTokens(userId: string, encryptedRefreshToken: string): Promise<string> {
  const admin = createAdminClient();
  const clientId = env.MICROSOFT_CLIENT_ID;
  const tenantId = env.MICROSOFT_TENANT_ID || 'common';
  const clientSecret = env.MICROSOFT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Configuration Microsoft OAuth manquante (Client ID ou Client Secret dans .env)');
  }

  const decryptedRefreshToken = decrypt(encryptedRefreshToken);

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: decryptedRefreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Échec du rafraîchissement du jeton Microsoft : ${text}`);
  }

  const data = await response.json();
  const { access_token, refresh_token: newRefreshToken, expires_in } = data;
  
  const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

  const updateData: any = {
    access_token: encrypt(access_token),
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  };

  if (newRefreshToken) {
    updateData.refresh_token = encrypt(newRefreshToken);
  }

  await admin
    .from('user_microsoft_tokens')
    .update(updateData)
    .eq('user_id', userId);

  return access_token;
}

export async function scheduleVoiceMeeting(
  orgSlug: string,
  data: {
    customerName: string | null;
    title: string;
    dueDate: string | null;
    description: string | null;
    taskType: string;
  }
): Promise<{ success?: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    
    // 1. Get organization ID
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', orgSlug)
      .single();

    if (orgError || !org) {
      throw new Error('Organisation introuvable ou accès non autorisé.');
    }
    const orgId = org.id;

    // 2. Get connected user ID
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Utilisateur non connecté.');
    }
    const userId = user.id;

    // 3. Perform a fuzzy match for the customer in the database
    let customerId: string | null = null;
    if (data.customerName) {
      const customer = await findClosestCustomer(supabase, orgId, data.customerName);
      if (customer) {
        customerId = customer.id;
      }
    }

    // 4. Insert task in tasks table
    const finalTaskType = (data.taskType === 'meeting' || data.taskType === 'visit') ? data.taskType : 'meeting';
    const dueAt = data.dueDate || new Date().toISOString();

    const { error: taskError } = await supabase
      .from('tasks')
      .insert({
        organization_id: orgId,
        customer_id: customerId,
        title: data.title,
        description: data.description,
        task_type: finalTaskType,
        priority: 'normal',
        status: 'open',
        due_at: dueAt,
        assigned_to: userId,
      });

    if (taskError) {
      throw new Error(`Erreur lors de la création de la tâche CRM : ${taskError.message}`);
    }

    // 5. Check Microsoft OAuth credentials
    const admin = createAdminClient();
    const { data: msToken } = await admin
      .from('user_microsoft_tokens')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (msToken) {
      console.log(`[MEETING] Jeton Microsoft trouvé pour l'utilisateur ${userId}. Planification de l'événement Outlook...`);
      let accessToken = decrypt(msToken.access_token);
      const isExpired = new Date(msToken.expires_at).getTime() < Date.now() + 60 * 1000;

      if (isExpired) {
        console.log('[MEETING] Jeton Microsoft expiré, rafraîchissement en cours...');
        accessToken = await refreshMicrosoftTokens(userId, msToken.refresh_token);
      }

      // Format dates for MS Graph
      const startDateTime = new Date(dueAt);
      const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000); // 1 hour duration

      // Convert to ISO string format in UTC
      const startStr = startDateTime.toISOString();
      const endStr = endDateTime.toISOString();

      const payload = {
        subject: data.title,
        body: {
          contentType: 'HTML',
          content: data.description || ''
        },
        start: {
          dateTime: startStr,
          timeZone: 'Europe/Brussels'
        },
        end: {
          dateTime: endStr,
          timeZone: 'Europe/Brussels'
        }
      };

      const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Microsoft Graph API a renvoyé l'erreur : ${errText}`);
      }
      console.log('[MEETING] Événement Microsoft Outlook planifié avec succès.');
    } else {
      console.log(`[MEETING] Pas de jeton Microsoft pour l'utilisateur ${userId}. Création de la tâche CRM uniquement.`);
    }

    revalidatePath(`/${orgSlug}/tasks`);
    return { success: true };

  } catch (err: any) {
    console.error('[MEETING ACTION] Error scheduling meeting:', err);
    return { error: err.message || 'Une erreur est survenue lors de la planification.' };
  }
}
