import nodemailer from 'nodemailer';
import { createAdminClient } from '@/lib/supabase/admin';
import { encrypt, decrypt } from './encryption';
import { env } from './env';

interface SendEmailParams {
  userId: string;
  organizationId: string;
  to: string[];
  subject: string;
  html: string;
  quoteId?: string; // Optional reference to link in email_messages
  customMessageId?: string; // Optional custom message ID for console simulation/testing
}

async function refreshMicrosoftTokens(userId: string, encryptedRefreshToken: string) {
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

export async function sendEmailDirect({ userId, organizationId, to, subject, html, quoteId, customMessageId }: SendEmailParams) {
  const admin = createAdminClient();

  try {
    // 0. Fetch user's Microsoft OAuth tokens
    const { data: msToken } = await admin
      .from('user_microsoft_tokens')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (msToken) {
      console.log(`[EMAIL] Envoi de l'e-mail via Microsoft Graph pour l'utilisateur ${userId} (${msToken.email})`);
      let accessToken = decrypt(msToken.access_token);
      const isExpired = new Date(msToken.expires_at).getTime() < Date.now() + 60 * 1000; // Expired or expiring within 60s

      if (isExpired) {
        console.log(`[EMAIL] Jeton Microsoft expiré, rafraîchissement...`);
        accessToken = await refreshMicrosoftTokens(userId, msToken.refresh_token);
      }

      // Format Microsoft Graph API payload
      const recipients = to.map(email => ({
        emailAddress: { address: email.trim() }
      }));

      const payload = {
        message: {
          subject: subject,
          body: {
            contentType: 'HTML',
            content: html
          },
          toRecipients: recipients
        },
        saveToSentItems: 'true'
      };

      const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
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

      // Insert message record
      await admin.from('email_messages').insert({
        organization_id: organizationId,
        quote_id: quoteId || null,
        to_emails: to,
        subject: subject,
        status: 'sent',
        provider: 'microsoft',
        provider_message_id: 'ms_' + Math.random().toString(36).substring(7),
        sent_by: userId,
        sent_at: new Date().toISOString()
      });

      return { success: true, provider: 'microsoft' };
    }

    // 1. Fetch user's SMTP config
    const { data: smtpConfig } = await admin
      .from('user_email_configs')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (smtpConfig) {
      console.log(`[EMAIL] Envoi de l'e-mail via SMTP pour l'utilisateur ${userId} (${smtpConfig.smtp_user})`);
      const decryptedPassword = decrypt(smtpConfig.smtp_pass);

      const transporter = nodemailer.createTransport({
        host: smtpConfig.smtp_host,
        port: smtpConfig.smtp_port,
        secure: smtpConfig.smtp_port === 465, // SSL for 465, TLS/STARTTLS for others
        auth: {
          user: smtpConfig.smtp_user,
          pass: decryptedPassword
        },
        tls: {
          rejectUnauthorized: false // Avoid self-signed certificate errors
        }
      });

      const info = await transporter.sendMail({
        from: `"${smtpConfig.sender_name}" <${smtpConfig.smtp_user}>`,
        to: to.join(', '),
        subject: subject,
        html: html
      });

      // Insert message record with status 'sent'
      await admin.from('email_messages').insert({
        organization_id: organizationId,
        quote_id: quoteId || null,
        to_emails: to,
        subject: subject,
        status: 'sent',
        provider: 'smtp',
        provider_message_id: info.messageId,
        sent_by: userId,
        sent_at: new Date().toISOString()
      });

      return { success: true, provider: 'smtp', messageId: info.messageId };
    }

    // 2. Fallback to Resend if EMAIL_MODE is resend and RESEND_API_KEY is configured
    if (env.EMAIL_MODE === 'resend' && env.RESEND_API_KEY) {
      console.log(`[EMAIL] Aucun SMTP utilisateur trouvé. Envoi via Resend pour ${to.join(', ')}`);
      const from = process.env.EMAIL_FROM || 'VoxPilot <offres@example.com>';

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from,
          to,
          subject,
          html
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Resend API returned status ${res.status}: ${errText}`);
      }

      const data = await res.json();

      await admin.from('email_messages').insert({
        organization_id: organizationId,
        quote_id: quoteId || null,
        to_emails: to,
        subject: subject,
        status: 'sent',
        provider: 'resend',
        provider_message_id: data.id,
        sent_by: userId,
        sent_at: new Date().toISOString()
      });

      return { success: true, provider: 'resend', messageId: data.id };
    }

    // 3. Log/Simulation mode if no other sender is available
    console.log(`[SIMULATION EMAIL] Aucun SMTP configuré pour ${userId}. Log de l'e-mail.`);
    const simulatedMsgId = customMessageId || ('simulated_' + Math.random().toString(36).substring(7));

    await admin.from('email_messages').insert({
      organization_id: organizationId,
      quote_id: quoteId || null,
      to_emails: to,
      subject: subject,
      status: 'logged',
      provider: 'console',
      provider_message_id: simulatedMsgId,
      sent_by: userId,
      sent_at: new Date().toISOString()
    });

    return { success: true, provider: 'console', messageId: simulatedMsgId };

  } catch (err) {
    console.error(`[EMAIL] Échec de l'envoi de l'e-mail :`, err);

    // Save error in database log
    let failedProvider = 'smtp';
    if (err instanceof Error && err.message.includes('Microsoft Graph')) {
      failedProvider = 'microsoft';
    }

    try {
      await admin.from('email_messages').insert({
        organization_id: organizationId,
        quote_id: quoteId || null,
        to_emails: to,
        subject: subject,
        status: 'failed',
        provider: failedProvider,
        error_message: err instanceof Error ? err.message : String(err),
        sent_by: userId,
        sent_at: new Date().toISOString()
      });
    } catch (dbErr) {
      console.error('[EMAIL] Erreur lors de l\'enregistrement de l\'échec en base :', dbErr);
    }

    // Renvoyer un message d'erreur sécurisé et convivial à l'utilisateur
    let friendlyMessage = "Une erreur est survenue lors de l'envoi de l'e-mail.";
    if (err instanceof Error && err.message.includes('Microsoft Graph')) {
      friendlyMessage = `Une erreur est survenue lors de l'envoi via Microsoft Graph (Outlook) : ${err.message}`;
    } else {
      friendlyMessage = "Une erreur est survenue lors de l'envoi de l'e-mail via votre serveur SMTP.";
      if (err instanceof Error && err.message.includes('Authentication unsuccessful')) {
        friendlyMessage = "Échec d'authentification avec votre serveur SMTP. Si vous utilisez Outlook, assurez-vous d'utiliser un Mot de passe d'application valide.";
      }
    }

    return { 
      error: friendlyMessage
    };
  }
}

export async function sendEmail(params: SendEmailParams) {
  try {
    const { emailQueue } = await import('./queue');
    if (emailQueue) {
      console.log(`[EMAIL] Ajout de l'e-mail pour ${params.to.join(', ')} à la file d'attente BullMQ.`);
      await emailQueue.add('send-email', params);
      return { success: true, queued: true };
    }
  } catch (queueErr) {
    console.warn('[EMAIL] La file d\'attente BullMQ n\'est pas disponible, envoi direct.', queueErr);
  }

  // Graceful fallback
  return sendEmailDirect(params);
}
