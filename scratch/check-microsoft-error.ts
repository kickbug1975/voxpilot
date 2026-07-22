import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env first
dotenv.config({ path: path.join(__dirname, '../.env') });

import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL;

async function run() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    // Fetch user token
    const tokenRes = await client.query(`
      SELECT *
      FROM user_microsoft_tokens
      WHERE user_id = 'd1c13c27-d209-47b3-9e78-3d852c2a246d'
      LIMIT 1
    `);

    if (tokenRes.rows.length === 0) {
      console.error('No Microsoft token found in database.');
      return;
    }

    const { access_token, email, expires_at } = tokenRes.rows[0];
    console.log('Token Email:', email);
    console.log('Expires At:', expires_at);

    // Make a test Microsoft Graph API call to sendMail
    const payload = {
      message: {
        subject: 'Test Diagnostic Microsoft Graph',
        body: {
          contentType: 'HTML',
          content: '<p>Test de diagnostic</p>'
        },
        toRecipients: [
          { emailAddress: { address: 'dimitri.puche@outlook.com' } }
        ]
      },
      saveToSentItems: 'true'
    };

    const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${access_token}`
      },
      body: JSON.stringify(payload)
    });

    console.log('Response Status:', res.status, res.statusText);
    const text = await res.text();
    console.log('Response Body:', text);

  } catch (err) {
    console.error('Error running check script:', err);
  } finally {
    await client.end();
  }
}

run();
