'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { logAuditEvent } from './audit';
import crypto from 'crypto';

// Helper to hash token
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Helper to truncate IP address (anonymize slightly but keep block)
function truncateIp(ip: string | null): string {
  if (!ip || ip === 'Unknown') return 'Unknown';
  
  // Clean IPv6 prefixing in IPv4 (ex: ::ffff:192.168.1.1)
  let cleanIp = ip.trim();
  if (cleanIp.includes('::ffff:')) {
    cleanIp = cleanIp.replace('::ffff:', '');
  }

  // If it's an IPv4
  if (cleanIp.includes('.')) {
    const parts = cleanIp.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    }
  }
  
  // If it's an IPv6
  if (cleanIp.includes(':')) {
    const parts = cleanIp.split(':');
    return `${parts.slice(0, 4).join(':')}:0000:0000:0000:0000`;
  }
  
  return 'Truncated';
}

// Helper to simplify user-agent for logging
function simplifyUserAgent(ua: string | null): string {
  if (!ua) return 'Unknown';
  
  let os = 'Unknown OS';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Macintosh') || ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('Linux')) os = 'Linux';

  let browser = 'Unknown Browser';
  if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edge')) browser = 'Edge';

  return `${browser} on ${os}`;
}

export async function getPublicQuote(token: string) {
  try {
    if (!token || token.trim() === '') {
      throw new Error('Jeton de consultation manquant.');
    }

    const tokenHash = hashToken(token);
    const admin = createAdminClient();

    // 1. Fetch quote by token hash
    const { data: quote, error: qError } = await admin
      .from('quotes')
      .select('*, customers(legal_name, primary_email)')
      .eq('public_token_hash', tokenHash)
      .single();

    if (qError || !quote) {
      return { error: 'Ce lien de devis est invalide ou expiré.' };
    }

    // 2. Check if quote is cancelled
    if (quote.status === 'cancelled') {
      return { error: 'Ce devis a été annulé par le vendeur et n\'est plus disponible.' };
    }

    // 3. Check expiration
    if (quote.public_token_expires_at && new Date(quote.public_token_expires_at) < new Date()) {
      return { error: 'Ce lien de devis a expiré.' };
    }

    // 4. Fetch quote items (excluding cost snapshot or internal rule details for security)
    const { data: items, error: iError } = await admin
      .from('quote_items')
      .select('id, position, product_snapshot, description, sales_unit, quantity, unit_price, discount_rate, net_unit_price, tax_rate, line_subtotal')
      .eq('quote_id', quote.id)
      .order('position', { ascending: true });

    if (iError) throw iError;

    // 5. Fetch organization info for branding
    const { data: org, error: orgError } = await admin
      .from('organizations')
      .select('name, logo_path, phone, commercial_email, address')
      .eq('id', quote.organization_id)
      .single();

    if (orgError) throw orgError;

    // 6. Update status to 'viewed' if it was 'sent'
    if (quote.status === 'sent') {
      const now = new Date().toISOString();
      const { error: updateError } = await admin
        .from('quotes')
        .update({ status: 'viewed', viewed_at: now })
        .eq('id', quote.id);

      if (!updateError) {
        quote.status = 'viewed';
        quote.viewed_at = now;

        // Log quote event
        await admin.from('quote_events').insert({
          organization_id: quote.organization_id,
          quote_id: quote.id,
          event_type: 'viewed',
          actor_type: 'customer',
          actor_name: 'Client (Lien Public)',
        });

        // Trigger quote_viewed alert
        await admin.from('alerts').insert({
          organization_id: quote.organization_id,
          type: 'quote_viewed',
          priority: 'medium',
          status: 'unread',
          title: `Devis consulté : ${quote.quote_number}`,
          message: `Le client a ouvert le devis public pour la première fois.`,
          entity_type: 'quotes',
          entity_id: quote.id,
          metadata: { quote_number: quote.quote_number },
        });
      }
    }

    return { 
      data: {
        quote,
        items,
        organization: org
      } 
    };
  } catch (err) {
    console.error('Error fetching public quote:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de charger le devis.' };
  }
}

export async function submitPublicDecision(
  token: string,
  decision: 'accepted' | 'rejected',
  clientName: string,
  clientRole: string,
  comment: string
) {
  try {
    if (!token || token.trim() === '') {
      throw new Error('Jeton de consultation manquant.');
    }
    if (!clientName || clientName.trim() === '') {
      throw new Error('Le nom complet est obligatoire pour enregistrer votre décision.');
    }
    if (decision === 'rejected' && (!comment || comment.trim() === '')) {
      throw new Error('Le motif de refus est obligatoire pour enregistrer votre décision.');
    }

    const tokenHash = hashToken(token);
    const admin = createAdminClient();

    // 1. Fetch quote by token hash
    const { data: quote, error: qError } = await admin
      .from('quotes')
      .select('id, organization_id, status, public_token_expires_at')
      .eq('public_token_hash', tokenHash)
      .single();

    if (qError || !quote) {
      throw new Error('Devis introuvable ou lien expiré.');
    }

    // 2. Check if already finalised
    if (quote.status === 'accepted' || quote.status === 'rejected') {
      throw new Error(`Ce devis a déjà été ${quote.status === 'accepted' ? 'accepté' : 'refusé'}.`);
    }

    if (quote.status === 'cancelled') {
      throw new Error('Ce devis a été annulé par le vendeur.');
    }

    // 3. Check expiration
    if (quote.public_token_expires_at && new Date(quote.public_token_expires_at) < new Date()) {
      throw new Error('Ce lien de devis a expiré.');
    }

    // 4. Extract headers for logging (IP and User-Agent)
    const headersList = await headers();
    const rawIp = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'Unknown';
    const ip = rawIp.split(',')[0].trim();
    const userAgent = headersList.get('user-agent') || 'Unknown';

    const truncatedIp = truncateIp(ip);
    const simplifiedUA = simplifyUserAgent(userAgent);

    const now = new Date().toISOString();

    // 5. Update quote status
    const updatePayload: Record<string, unknown> = {
      status: decision,
      updated_at: now,
    };

    if (decision === 'accepted') {
      updatePayload.accepted_at = now;
    } else {
      updatePayload.rejected_at = now;
    }

    const { error: updateError } = await admin
      .from('quotes')
      .update(updatePayload)
      .eq('id', quote.id);

    if (updateError) throw updateError;

    // Auto-complete or cancel follow-up tasks of this quote on decision
    await admin
      .from('tasks')
      .update({
        status: decision === 'accepted' ? 'completed' : 'cancelled',
        outcome: decision === 'accepted' ? 'Devis accepté par le client.' : 'Devis refusé par le client.',
        completed_at: now,
        completed_by: null, // client decision
        updated_at: now,
      })
      .eq('organization_id', quote.organization_id)
      .eq('quote_id', quote.id)
      .in('status', ['open', 'in_progress']);

    // 6. Log quote event with decision metadata
    await admin.from('quote_events').insert({
      organization_id: quote.organization_id,
      quote_id: quote.id,
      event_type: decision,
      actor_type: 'customer',
      actor_name: clientName,
      metadata: {
        role: clientRole || null,
        comment: comment || null,
        ip: truncatedIp,
        userAgent: simplifiedUA,
      },
    });

    // Log to audit logs
    await logAuditEvent(
      quote.organization_id,
      null, // Anonymous client action
      decision === 'accepted' ? 'quote_accepted' : 'quote_rejected',
      'quotes',
      quote.id,
      {
        clientName,
        clientRole: clientRole || null,
        comment: comment || null,
      }
    );

    // 7. Generate interior notification / alert for the commercial owner
    await admin.from('alerts').insert({
      organization_id: quote.organization_id,
      type: decision === 'accepted' ? 'quote_accepted' : 'quote_rejected',
      priority: decision === 'accepted' ? 'high' : 'critical',
      status: 'unread',
      title: decision === 'accepted' ? `Devis accepté : ${clientName}` : `Devis refusé : ${clientName}`,
      message: decision === 'accepted' 
        ? `Le client a accepté l'offre. Signataire : ${clientName} (${clientRole || 'non précisé'}).`
        : `Le client a refusé l'offre. Motif : "${comment}".`,
      entity_type: 'quotes',
      entity_id: quote.id,
      metadata: {
        clientName,
        clientRole,
        comment,
      }
    });

    return { success: true };
  } catch (err) {
    console.error('Error submitting public decision:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de valider votre décision.' };
  }
}
