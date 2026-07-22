import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env first
dotenv.config({ path: path.join(__dirname, '../.env') });

import { sendEmail } from '../src/lib/emailSender';
import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL;

async function run() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    // Fetch user and organization
    const memberRes = await client.query(`
      SELECT user_id, organization_id
      FROM organization_memberships
      WHERE user_id = 'd1c13c27-d209-47b3-9e78-3d852c2a246d'
      LIMIT 1
    `);

    if (memberRes.rows.length === 0) {
      console.error('No membership found for the user.');
      process.exit(1);
    }

    const { user_id: userId, organization_id: organizationId } = memberRes.rows[0];

    console.log(`Using User ID: ${userId}, Organization ID: ${organizationId}`);

    console.log('Sending test email via sendEmail()...');
    const result = await sendEmail({
      userId,
      organizationId,
      to: ['dimitri.puche@outlook.com'],
      subject: 'Test Envoi BlueMargin',
      html: '<p>Ceci est un email de test envoyé depuis le CRM BlueMargin pour valider votre configuration Outlook.</p>'
    });

    console.log('Result:', result);

  } catch (err) {
    console.error('Test script error:', err);
  } finally {
    await client.end();
  }
}

run();
