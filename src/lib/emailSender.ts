import nodemailer from 'nodemailer';
import { createAdminClient } from '@/lib/supabase/admin';
import { decrypt } from './encryption';
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

export async function sendEmail({ userId, organizationId, to, subject, html, quoteId, customMessageId }: SendEmailParams) {
  const admin = createAdminClient();

  try {
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
    try {
      await admin.from('email_messages').insert({
        organization_id: organizationId,
        quote_id: quoteId || null,
        to_emails: to,
        subject: subject,
        status: 'failed',
        provider: 'smtp',
        error_message: err instanceof Error ? err.message : String(err),
        sent_by: userId,
        sent_at: new Date().toISOString()
      });
    } catch (dbErr) {
      console.error('[EMAIL] Erreur lors de l\'enregistrement de l\'échec en base :', dbErr);
    }

    return { 
      error: err instanceof Error ? err.message : "Une erreur inconnue est survenue lors de l'envoi." 
    };
  }
}
