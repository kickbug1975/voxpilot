import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env first
dotenv.config({ path: path.join(__dirname, '../.env') });

import { encrypt } from '../src/lib/encryption';
import { sendEmail } from '../src/lib/emailSender';
import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL;
const newPass = 'vdtqbexaqqgstkoy';

async function run() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database.');

    const encryptedPassword = encrypt(newPass);
    const userId = 'd1c13c27-d209-47b3-9e78-3d852c2a246d';

    console.log(`Updating SMTP password in database for user ${userId}...`);
    
    const updateRes = await client.query(`
      UPDATE user_email_configs
      SET smtp_pass = $1, updated_at = NOW()
      WHERE user_id = $2
      RETURNING user_id, smtp_user
    `, [encryptedPassword, userId]);

    if (updateRes.rows.length === 0) {
      console.error('User SMTP config not found in database to update.');
      process.exit(1);
    }

    console.log('SMTP password updated successfully in database.');

    // Fetch user and organization to trigger sendEmail
    const memberRes = await client.query(`
      SELECT user_id, organization_id
      FROM organization_memberships
      WHERE user_id = $1
      LIMIT 1
    `, [userId]);

    if (memberRes.rows.length === 0) {
      console.error('No membership found for the user.');
      process.exit(1);
    }

    const { organization_id: organizationId } = memberRes.rows[0];

    console.log(`Sending test email to dimitri.puche@outlook.com...`);
    const result = await sendEmail({
      userId,
      organizationId,
      to: ['dimitri.puche@outlook.com'],
      subject: 'Test Envoi BlueMargin - Réussi',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e293b;">Connexion Outlook Réussie ! 🎉</h2>
          <p>Bonjour Dimitri,</p>
          <p>Ce mail de test confirme que votre boîte Outlook est désormais correctement configurée et connectée à votre CRM <strong>BlueMargin</strong>.</p>
          <p>Vous pouvez à présent envoyer des offres et correspondre directement avec vos clients depuis le CRM.</p>
          <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 20px 0;">
          <p style="font-size: 12px; color: #64748b;">Envoyé automatiquement par le système d'authentification BlueMargin.</p>
        </div>
      `
    });

    console.log('Email send result:', result);

  } catch (err) {
    console.error('Error running script:', err);
  } finally {
    await client.end();
  }
}

run();
