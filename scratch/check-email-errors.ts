import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env
dotenv.config({ path: path.join(__dirname, '../.env') });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is not set in .env');
  process.exit(1);
}

async function run() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database.');

    const res = await client.query(`
      SELECT id, subject, status, provider, error_message, sent_at
      FROM email_messages
      ORDER BY sent_at DESC
      LIMIT 10
    `);

    console.log('Last 10 emails:');
    console.table(res.rows);

    const failedRes = await client.query(`
      SELECT id, subject, status, provider, error_message, sent_at
      FROM email_messages
      WHERE status = 'failed'
      ORDER BY sent_at DESC
      LIMIT 10
    `);

    console.log('\nLast 10 failed emails:');
    console.table(failedRes.rows);

    const smtpConfig = await client.query(`
      SELECT user_id, smtp_host, smtp_port, smtp_user, sender_name, created_at
      FROM user_email_configs
    `);
    console.log('\nSMTP User Configurations:');
    console.table(smtpConfig.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

run();
