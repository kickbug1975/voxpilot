import { Client } from 'pg';
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

    const sql = `
      INSERT INTO customer_locations (organization_id, customer_id, name, location_type, address, is_primary, is_active)
      SELECT 
        c.organization_id,
        c.id AS customer_id,
        'Siège social / Livraison' AS name,
        'delivery' AS location_type,
        c.shipping_address AS address,
        true AS is_primary,
        true AS is_active
      FROM customers c
      WHERE c.shipping_address IS NOT NULL 
        AND c.shipping_address != '{}'::jsonb
        AND NOT EXISTS (
          SELECT 1 FROM customer_locations cl 
          WHERE cl.customer_id = c.id
        );
    `;

    console.log('Migrating shipping_address values to customer_locations...');
    const res = await client.query(sql);
    console.log(`Migration completed successfully! Migrated ${res.rowCount} records.`);
  } catch (err) {
    console.error('Error running data migration:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
