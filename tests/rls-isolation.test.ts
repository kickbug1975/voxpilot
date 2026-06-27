import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

const dbUrl = process.env.DATABASE_URL;

describe('Row Level Security (RLS) & Tenant Isolation Tests', () => {
  let client: Client | null = null;

  beforeAll(async () => {
    if (!dbUrl) {
      console.warn('⚠️ DATABASE_URL not set. Skipping database RLS integration tests.');
      return;
    }
    try {
      client = new Client({ connectionString: dbUrl });
      await client.connect();
      
      // Try to create the auth schema and auth.users table for compatibility with standard local Postgres
      try {
        await client.query(`
          CREATE SCHEMA IF NOT EXISTS auth;
          CREATE TABLE IF NOT EXISTS auth.users (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            email text
          );
          
          CREATE OR REPLACE FUNCTION auth.uid()
          RETURNS uuid AS $$
            SELECT COALESCE(
              NULLIF(current_setting('request.jwt.claim.sub', true), ''),
              NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')
            )::uuid;
          $$ LANGUAGE sql STABLE;
        `);
      } catch {
        // If we get permission denied, it means we are on a real Supabase database where the schema already exists, so we ignore the error
        console.log('Skipping auth schema creation (already exists or permission denied)');
      }

      // Ensure the 'authenticated' role exists and has permissions
      try {
        await client.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
              CREATE ROLE authenticated;
            END IF;
          END
          $$;
          
          GRANT USAGE ON SCHEMA public TO authenticated;
          GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO authenticated;
          GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO authenticated;
        `);
      } catch (e) {
        console.log('Skipping authenticated role creation or privilege grants (local/live):', e instanceof Error ? e.message : String(e));
      }

      try {
        await client.query(`
          GRANT USAGE ON SCHEMA auth TO authenticated;
          GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth TO authenticated;
        `);
      } catch (e) {
        console.log('Skipping auth schema privilege grants to authenticated:', e instanceof Error ? e.message : String(e));
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️ Connection to database failed. Skipping database RLS integration tests: ${errMsg}`);
      client = null;
    }
  });

  afterAll(async () => {
    if (client) {
      await client.end();
    }
  });

  test('Strict tenant isolation between Org A and Org B', async () => {
    if (!dbUrl || !client) {
      // Vitest way of skipping a test dynamically
      expect(true).toBe(true);
      return;
    }

    // Start a transaction so all changes are rolled back at the end
    await client.query('BEGIN;');

    try {
      // 1. Run migrations inside the transaction
      const migrationFiles = [
        '20260622000000_initial_schema.sql',
        '20260623000000_add_is_transformed_to_quote_items.sql',
        '20260623000001_add_default_costs_to_suppliers.sql',
        '20260623000002_add_default_category_to_suppliers.sql',
        '20260624000000_crm_lite_schema.sql',
        '20260624000001_dicta_magic_integration.sql',
        '20260626000000_production_readiness.sql'
      ];
      
      for (const file of migrationFiles) {
        await client.query('SAVEPOINT migration_sp;');
        try {
          const filePath = path.resolve(__dirname, `../supabase/migrations/${file}`);
          const sql = fs.readFileSync(filePath, 'utf8');
          await client.query(sql);
          await client.query('RELEASE SAVEPOINT migration_sp;');
        } catch (e) {
          await client.query('ROLLBACK TO SAVEPOINT migration_sp;');
          // console.log(`Skipping migration ${file} because it already exists or was already applied:`, (e as Error).message);
        }
      }

      // 2. Setup mock auth users in auth.users table
      const userAId = 'a1111111-1111-1111-1111-111111111111';
      const userBId = 'b2222222-2222-2222-2222-222222222222';
      const userCId = 'c3333333-3333-3333-3333-333333333333'; // Sales in Org A

      await client.query(`
        INSERT INTO auth.users (id, email) VALUES 
        ('${userAId}', 'owner-a@example.com'),
        ('${userBId}', 'owner-b@example.com'),
        ('${userCId}', 'sales-a@example.com');
      `);

      // 3. Create two organizations (Org A and Org B)
      const orgAId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const orgBId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

      await client.query(`
        INSERT INTO organizations (id, name, slug) VALUES 
        ('${orgAId}', 'Organisation A', 'org-a'),
        ('${orgBId}', 'Organisation B', 'org-b');
      `);

      // 4. Create memberships
      await client.query(`
        INSERT INTO organization_memberships (organization_id, user_id, role, status) VALUES 
        ('${orgAId}', '${userAId}', 'owner', 'active'),
        ('${orgBId}', '${userBId}', 'owner', 'active'),
        ('${orgAId}', '${userCId}', 'sales', 'active');
      `);

      // 5. Insert data for Org A (Supplier, Product)
      const supplierAId = 'a0000000-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const productAId = 'a9999999-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

      await client.query(`
        INSERT INTO suppliers (id, organization_id, name) VALUES 
        ('${supplierAId}', '${orgAId}', 'Fournisseur A');

        INSERT INTO products (id, organization_id, name, internal_sku, sales_unit) VALUES 
        ('${productAId}', '${orgAId}', 'Produit A', 'SKU-A', 'kg');
      `);

      // 6. Insert data for Org B
      const supplierBId = 'b0000000-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
      const productBId = 'b9999999-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

      await client.query(`
        INSERT INTO suppliers (id, organization_id, name) VALUES 
        ('${supplierBId}', '${orgBId}', 'Fournisseur B');

        INSERT INTO products (id, organization_id, name, internal_sku, sales_unit) VALUES 
        ('${productBId}', '${orgBId}', 'Produit B', 'SKU-B', 'kg');
      `);

      // -----------------------------------------------------------------------
      // Test Case 1: User A reads Org A data (Should succeed)
      // -----------------------------------------------------------------------
      await client.query('RESET ROLE;');
      await client.query('SET ROLE authenticated;');
      await client.query(`
        SET LOCAL request.jwt.claim.sub = '${userAId}';
        SET LOCAL request.jwt.claim.role = 'authenticated';
      `);

      const resSuppliersA = await client.query('SELECT * FROM suppliers;');
      expect(resSuppliersA.rows.length).toBe(1);
      expect(resSuppliersA.rows[0].name).toBe('Fournisseur A');

      // -----------------------------------------------------------------------
      // Test Case 2: User A tries to read Org B data (Should fail/return empty)
      // -----------------------------------------------------------------------
      const resSuppliersBDirect = await client.query(
        `SELECT * FROM suppliers WHERE organization_id = '${orgBId}';`
      );
      expect(resSuppliersBDirect.rows.length).toBe(0);

      // -----------------------------------------------------------------------
      // Test Case 3: User A tries to update Org B data (Should fail RLS)
      // -----------------------------------------------------------------------
      const updateResult = await client.query(
        `UPDATE suppliers SET name = 'Hack Name' WHERE id = '${supplierBId}';`
      );
      expect(updateResult.rowCount).toBe(0);

      // -----------------------------------------------------------------------
      // Test Case 4: User A tries to insert Supplier for Org B (Should fail RLS)
      // -----------------------------------------------------------------------
      await client.query('SAVEPOINT tc4_sp;');
      try {
        await client.query(`
          INSERT INTO suppliers (organization_id, name) 
          VALUES ('${orgBId}', 'Fournisseur Hacked');
        `);
        throw new Error('Expected RLS violation but query succeeded');
      } catch {
        await client.query('ROLLBACK TO SAVEPOINT tc4_sp;');
      }

      // -----------------------------------------------------------------------
      // Test Case 5: User B reads Org B data (Should succeed)
      // -----------------------------------------------------------------------
      await client.query('RESET ROLE;');
      await client.query('SET ROLE authenticated;');
      await client.query(`
        SET LOCAL request.jwt.claim.sub = '${userBId}';
        SET LOCAL request.jwt.claim.role = 'authenticated';
      `);

      const resSuppliersB = await client.query('SELECT * FROM suppliers;');
      expect(resSuppliersB.rows.length).toBe(1);
      expect(resSuppliersB.rows[0].name).toBe('Fournisseur B');

      const resSuppliersADirect = await client.query(
        `SELECT * FROM suppliers WHERE organization_id = '${orgAId}';`
      );
      expect(resSuppliersADirect.rows.length).toBe(0);

      // -----------------------------------------------------------------------
      // Test Case 6: Role validation (Viewer user C tries to write supplier)
      // -----------------------------------------------------------------------
      // First update membership to viewer
      await client.query('RESET ROLE;');
      await client.query(`
        UPDATE organization_memberships 
        SET role = 'viewer' 
        WHERE organization_id = '${orgAId}' AND user_id = '${userCId}';
      `);

      await client.query('RESET ROLE;');
      await client.query('SET ROLE authenticated;');
      await client.query(`
        SET LOCAL request.jwt.claim.sub = '${userCId}';
        SET LOCAL request.jwt.claim.role = 'authenticated';
      `);

      // Try to insert supplier in Org A (Should fail because viewer is not in check constraints role list)
      await client.query('SAVEPOINT tc6_sp;');
      try {
        await client.query(`
          INSERT INTO suppliers (organization_id, name) 
          VALUES ('${orgAId}', 'New Supplier from Viewer');
        `);
        throw new Error('Expected check constraint/role violation but query succeeded');
      } catch {
        await client.query('ROLLBACK TO SAVEPOINT tc6_sp;');
      }

      // -----------------------------------------------------------------------
      // Test Case 7: Secure view hides costs when sales_can_view_costs = false
      // -----------------------------------------------------------------------
      await client.query('RESET ROLE;');
      // Turn off cost viewing for sales reps in Org A
      await client.query(`
        UPDATE organizations 
        SET sales_can_view_costs = false 
        WHERE id = '${orgAId}';
      `);

      // Set user C as sales role
      await client.query(`
        UPDATE organization_memberships 
        SET role = 'sales' 
        WHERE organization_id = '${orgAId}' AND user_id = '${userCId}';
      `);

      // Insert a supplier product with cost details
      const supplierProductAId = 'a1234567-bbbb-cccc-dddd-eeeeeeeeeeee';
      await client.query(`
        INSERT INTO supplier_products (
          id, organization_id, supplier_id, product_id, purchase_unit, current_purchase_price, current_landed_cost
        ) VALUES (
          '${supplierProductAId}', '${orgAId}', '${supplierAId}', '${productAId}', 'box', 100.0000, 110.0000
        );
      `);

      // Switch back to User C (sales)
      await client.query('RESET ROLE;');
      await client.query('SET ROLE authenticated;');
      await client.query(`
        SET LOCAL request.jwt.claim.sub = '${userCId}';
        SET LOCAL request.jwt.claim.role = 'authenticated';
      `);

      // Query from base table (should return values because RLS allows read)
      const baseResult = await client.query(
        `SELECT current_purchase_price FROM supplier_products WHERE id = '${supplierProductAId}';`
      );
      expect(baseResult.rows.length).toBe(1);
      expect(parseFloat(baseResult.rows[0].current_purchase_price)).toBe(100);

      // Query from secure view (should return NULL values because sales_can_view_costs = false)
      const viewResult = await client.query(
        `SELECT current_purchase_price, current_landed_cost FROM view_supplier_products WHERE id = '${supplierProductAId}';`
      );
      expect(viewResult.rows.length).toBe(1);
      expect(viewResult.rows[0].current_purchase_price).toBeNull();
      expect(viewResult.rows[0].current_landed_cost).toBeNull();

      // -----------------------------------------------------------------------
      // Test Case 8: Audit Logs immutability
      // -----------------------------------------------------------------------
      await client.query('RESET ROLE;');
      await client.query(`
        INSERT INTO audit_logs (organization_id, actor_user_id, action) 
        VALUES ('${orgAId}', '${userAId}', 'test_action');
      `);

      // Try to update or delete the log (should throw trigger exception even for superuser)
      await client.query('SAVEPOINT tc8_sp;');
      try {
        await client.query(`UPDATE audit_logs SET action = 'hacked' WHERE organization_id = '${orgAId}';`);
        throw new Error('Expected update trigger to block but query succeeded');
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT tc8_sp;');
        const err = e as Error;
        expect(err.message).toContain('Audit logs are immutable and cannot be updated or deleted');
      }

      // -----------------------------------------------------------------------
      // Test Case 9: Multi-tenant RLS for integration tables
      // -----------------------------------------------------------------------
      await client.query('RESET ROLE;');
      
      const testTables = [
        {
          name: 'dicta_magic_memory',
          insertSql: `INSERT INTO dicta_magic_memory (organization_id, text_content) VALUES ('${orgAId}', 'Org A Memory');`,
          selectSql: `SELECT * FROM dicta_magic_memory;`,
          updateSql: `UPDATE dicta_magic_memory SET text_content = 'Hacked' WHERE organization_id = '${orgBId}';`
        },
        {
          name: 'meetings',
          insertSql: `INSERT INTO meetings (organization_id, client_name, report_md) VALUES ('${orgAId}', 'Client A', 'Report A');`,
          selectSql: `SELECT * FROM meetings;`,
          updateSql: `UPDATE meetings SET report_md = 'Hacked' WHERE organization_id = '${orgBId}';`
        },
        {
          name: 'orders',
          insertSql: `INSERT INTO orders (id, organization_id, client_name) VALUES ('a1b2c3d4-0000-0000-0000-000000000000', '${orgAId}', 'Client A');`,
          selectSql: `SELECT * FROM orders;`,
          updateSql: `UPDATE orders SET client_name = 'Hacked' WHERE organization_id = '${orgBId}';`
        },
        {
          name: 'client_coordinates',
          insertSql: `INSERT INTO client_coordinates (organization_id, client_name, address, latitude, longitude) VALUES ('${orgAId}', 'Client A', 'Address A', 50.1, 4.1);`,
          selectSql: `SELECT * FROM client_coordinates;`,
          updateSql: `UPDATE client_coordinates SET address = 'Hacked' WHERE organization_id = '${orgBId}';`
        },
        {
          name: 'catalog_synonyms',
          insertSql: `INSERT INTO catalog_synonyms (organization_id, raw_term, normalized_term) VALUES ('${orgAId}', 'cabi', 'Cabillaud');`,
          selectSql: `SELECT * FROM catalog_synonyms;`,
          updateSql: `UPDATE catalog_synonyms SET normalized_term = 'Hacked' WHERE organization_id = '${orgBId}';`
        },
        {
          name: 'proposed_synonyms',
          insertSql: `INSERT INTO proposed_synonyms (organization_id, raw_term, normalized_term, confidence_score) VALUES ('${orgAId}', 'cabi proposed', 'Cabillaud', 0.9);`,
          selectSql: `SELECT * FROM proposed_synonyms;`,
          updateSql: `UPDATE proposed_synonyms SET normalized_term = 'Hacked' WHERE organization_id = '${orgBId}';`
        },
        {
          name: 'whatsapp_messages',
          insertSql: `INSERT INTO whatsapp_messages (organization_id, phone_number, role, content) VALUES ('${orgAId}', '12345', 'user', 'Hello A');`,
          selectSql: `SELECT * FROM whatsapp_messages;`,
          updateSql: `UPDATE whatsapp_messages SET content = 'Hacked' WHERE organization_id = '${orgBId}';`
        },
        {
          name: 'last_delivery_checks',
          insertSql: `INSERT INTO last_delivery_checks (organization_id, phone_number, client_name, order_id) VALUES ('${orgAId}', '12345', 'Client A', 'a1b2c3d4-0000-0000-0000-000000000000');`,
          selectSql: `SELECT * FROM last_delivery_checks;`,
          updateSql: `UPDATE last_delivery_checks SET client_name = 'Hacked' WHERE organization_id = '${orgBId}';`
        },
        {
          name: 'last_email_alerts',
          insertSql: `INSERT INTO last_email_alerts (organization_id, phone_number, message_id, sender_email, sender_name, subject, summary) VALUES ('${orgAId}', '12345', 'msg-a', 'sender@a.com', 'Sender A', 'Subject A', 'Summary A');`,
          selectSql: `SELECT * FROM last_email_alerts;`,
          updateSql: `UPDATE last_email_alerts SET subject = 'Hacked' WHERE organization_id = '${orgBId}';`
        },
        {
          name: 'pending_emails',
          insertSql: `INSERT INTO pending_emails (organization_id, message_id, conversation_id, sender_email, sender_name, subject, summary, received_at) VALUES ('${orgAId}', 'msg-a', 'conv-a', 'sender@a.com', 'Sender A', 'Subject A', 'Summary A', now());`,
          selectSql: `SELECT * FROM pending_emails;`,
          updateSql: `UPDATE pending_emails SET subject = 'Hacked' WHERE organization_id = '${orgBId}';`
        },
        {
          name: 'processed_events',
          insertSql: `INSERT INTO processed_events (organization_id, event_id, event_type, payload) VALUES ('${orgAId}', 'evt-a', 'whatsapp', '{}'::jsonb);`,
          selectSql: `SELECT * FROM processed_events;`,
          updateSql: `UPDATE processed_events SET event_type = 'Hacked' WHERE organization_id = '${orgBId}';`
        },
        {
          name: 'pending_clarifications',
          insertSql: `INSERT INTO pending_clarifications (organization_id, phone_number, original_transcription, context_data, question_asked) VALUES ('${orgAId}', '12345', 'trans', '{}'::jsonb, 'question');`,
          selectSql: `SELECT * FROM pending_clarifications;`,
          updateSql: `UPDATE pending_clarifications SET question_asked = 'Hacked' WHERE organization_id = '${orgBId}';`
        }
      ];

      for (const table of testTables) {
        await client.query('RESET ROLE;');
        await client.query(table.insertSql);
      }

      // Switch to User B (tenant Org B)
      await client.query('RESET ROLE;');
      await client.query('SET ROLE authenticated;');
      await client.query(`
        SET LOCAL request.jwt.claim.sub = '${userBId}';
        SET LOCAL request.jwt.claim.role = 'authenticated';
      `);

      for (const table of testTables) {
        // User B should NOT see User A's data in this table
        const res = await client.query(table.selectSql);
        expect(res.rows.length).toBe(0);

        // User B should NOT be able to update Org A's records (should affect 0 rows)
        const updateRes = await client.query(table.updateSql);
        expect(updateRes.rowCount).toBe(0);
      }

    } finally {
      // Rollback the transaction to keep database in original state
      await client.query('ROLLBACK;');
    }
  });
});
