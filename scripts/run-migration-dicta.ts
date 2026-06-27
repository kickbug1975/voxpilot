import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const dbUrl = process.env.DATABASE_URL;

async function run() {
  if (!dbUrl) {
    console.error('Error: DATABASE_URL not set in .env');
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    console.log('Connected to database.');

    const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260624000001_dicta_magic_integration.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Applying migration 20260624000001_dicta_magic_integration.sql...');
    await client.query(sql);
    console.log('Migration applied successfully!');
  } catch (err) {
    console.error('Error running migration:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
