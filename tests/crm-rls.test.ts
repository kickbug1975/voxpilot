import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const dbUrl = process.env.DATABASE_URL;

describe('CRM Row Level Security (RLS) & Portfolio Isolation Tests', () => {
  let client: Client | null = null;

  beforeAll(async () => {
    if (!dbUrl) {
      console.warn('⚠️ DATABASE_URL not set. Skipping CRM RLS integration tests.');
      return;
    }
    client = new Client({ connectionString: dbUrl });
    await client.connect();
  });

  afterAll(async () => {
    if (client) {
      await client.end();
    }
  });

  test('RLS and Composite FK enforcement for CRM entities', async () => {
    if (!dbUrl || !client) {
      expect(true).toBe(true);
      return;
    }

    // Start transaction to rollback all test modifications
    await client.query('BEGIN;');

    try {
      // 1. Setup mock auth users
      const userAId = 'a1111111-1111-1111-1111-111111111111'; // Owner of Org A
      const userBId = 'b2222222-2222-2222-2222-222222222222'; // Owner of Org B
      const salesA1Id = 'c3333333-3333-3333-3333-333333333333'; // Sales 1 in Org A
      const salesA2Id = 'd4444444-4444-4444-4444-444444444444'; // Sales 2 in Org A

      await client.query(`
        INSERT INTO auth.users (id, email) VALUES 
        ('${userAId}', 'owner-a@example.com'),
        ('${userBId}', 'owner-b@example.com'),
        ('${salesA1Id}', 'sales-a1@example.com'),
        ('${salesA2Id}', 'sales-a2@example.com')
        ON CONFLICT DO NOTHING;
      `);

      // 2. Setup organizations
      const orgAId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const orgBId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

      await client.query(`
        INSERT INTO organizations (id, name, slug, crm_visibility_mode) VALUES 
        ('${orgAId}', 'Organisation A', 'org-a', 'all_customers'),
        ('${orgBId}', 'Organisation B', 'org-b', 'all_customers');
      `);

      // 3. Setup memberships
      await client.query(`
        INSERT INTO organization_memberships (organization_id, user_id, role, status) VALUES 
        ('${orgAId}', '${userAId}', 'owner', 'active'),
        ('${orgBId}', '${userBId}', 'owner', 'active'),
        ('${orgAId}', '${salesA1Id}', 'sales', 'active'),
        ('${orgAId}', '${salesA2Id}', 'sales', 'active');
      `);

      // 4. Create customers
      const customerA1Id = 'ca1ca1ca-1111-1111-1111-111111111111'; // Owned by Sales A1
      const customerA2Id = 'ca2ca2ca-2222-2222-2222-222222222222'; // Owned by Sales A2
      const customerBId = 'cb1cb1cb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';  // Org B customer

      await client.query(`
        INSERT INTO customers (id, organization_id, legal_name, owner_user_id) VALUES 
        ('${customerA1Id}', '${orgAId}', 'Client A1', '${salesA1Id}'),
        ('${customerA2Id}', '${orgAId}', 'Client A2', '${salesA2Id}'),
        ('${customerBId}', '${orgBId}', 'Client B', '${userBId}');
      `);

      // 5. Create customer_locations and contacts in Org A
      const locA1Id = 'ea1ea1ea-1111-1111-1111-111111111111';
      const contactA1Id = 'c01c01c0-1111-1111-1111-111111111111';

      await client.query(`
        INSERT INTO customer_locations (id, organization_id, customer_id, name, is_primary) VALUES 
        ('${locA1Id}', '${orgAId}', '${customerA1Id}', 'Siege A1', true);

        INSERT INTO contacts (id, organization_id, customer_id, location_id, first_name, last_name, is_primary) VALUES 
        ('${contactA1Id}', '${orgAId}', '${customerA1Id}', '${locA1Id}', 'Jean', 'Dupont', true);
      `);

      // 6. Test Cross-Tenant isolation (User B tries to read loc/contact of Org A)
      await client.query('SET ROLE authenticated;');
      await client.query(`
        SET LOCAL request.jwt.claim.sub = '${userBId}';
        SET LOCAL request.jwt.claim.role = 'authenticated';
      `);

      const resLocsB = await client.query(`SELECT * FROM customer_locations WHERE id = '${locA1Id}';`);
      expect(resLocsB.rows.length).toBe(0);

      const resContactsB = await client.query(`SELECT * FROM contacts WHERE id = '${contactA1Id}';`);
      expect(resContactsB.rows.length).toBe(0);

      // 7. Test composite key constraint violation
      // Org B tries to associate Org A contact with Org B quote
      await client.query('RESET ROLE;');
      const quoteBId = 'ab1ab1ab-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
      await client.query(`
        INSERT INTO quotes (id, organization_id, quote_number, title, customer_id, status, issue_date) VALUES 
        ('${quoteBId}', '${orgBId}', 'QB-2026-00001', 'Offre B', '${customerBId}', 'draft', '2026-06-24');
      `);

      await client.query('SAVEPOINT tc_fk_sp;');
      try {
        // Jean Dupont is contactA1Id in Org A, trying to associate with Org B quote
        await client.query(`
          UPDATE quotes 
          SET contact_id = '${contactA1Id}' 
          WHERE id = '${quoteBId}';
        `);
        throw new Error('Expected foreign key composite constraint violation but query succeeded');
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT tc_fk_sp;');
        expect((e as Error).message).toContain('violates foreign key constraint');
      }

      // 8. Test visibility mode 'assigned_customers'
      // Switch Org A to portfolio visibility
      await client.query(`
        UPDATE organizations 
        SET crm_visibility_mode = 'assigned_customers' 
        WHERE id = '${orgAId}';
      `);

      // Switch to Sales A1 user
      await client.query('SET ROLE authenticated;');
      await client.query(`
        SET LOCAL request.jwt.claim.sub = '${salesA1Id}';
        SET LOCAL request.jwt.claim.role = 'authenticated';
      `);

      // Sales A1 should see Client A1 but not Client A2
      const resCustA1 = await client.query(`SELECT * FROM customers WHERE id = '${customerA1Id}';`);
      expect(resCustA1.rows.length).toBe(1);

      const resCustA2 = await client.query(`SELECT * FROM customers WHERE id = '${customerA2Id}';`);
      expect(resCustA2.rows.length).toBe(0);

      // 9. Test fallback to offer sales_owner_id
      // Even if Client A2 belongs to Sales A2, if Sales A1 is the sales_owner of a quote for Client A2, A1 gets read access
      await client.query('RESET ROLE;');
      const quoteA2Id = 'aa2aa2aa-2222-2222-2222-222222222222';
      await client.query(`
        INSERT INTO quotes (id, organization_id, quote_number, title, customer_id, status, issue_date, sales_owner_id) VALUES 
        ('${quoteA2Id}', '${orgAId}', 'QA-2026-00001', 'Offre A2', '${customerA2Id}', 'draft', '2026-06-24', '${salesA1Id}');
      `);

      // Switch back to Sales A1
      await client.query('SET ROLE authenticated;');
      await client.query(`
        SET LOCAL request.jwt.claim.sub = '${salesA1Id}';
        SET LOCAL request.jwt.claim.role = 'authenticated';
      `);

      // Now Sales A1 should see Client A2 through the quote association
      const resCustA2WithQuote = await client.query(`SELECT * FROM customers WHERE id = '${customerA2Id}';`);
      expect(resCustA2WithQuote.rows.length).toBe(1);

      // 10. Test unique primary active contact per customer
      await client.query('RESET ROLE;');
      const contactA1SecondId = 'c02c02c0-2222-2222-2222-222222222222';
      await client.query('SAVEPOINT tc_primary_sp;');
      try {
        await client.query(`
          INSERT INTO contacts (id, organization_id, customer_id, first_name, last_name, is_primary) VALUES 
          ('${contactA1SecondId}', '${orgAId}', '${customerA1Id}', 'Sophie', 'Martin', true);
        `);
        throw new Error('Expected unique constraint violation for duplicate primary contact but query succeeded');
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT tc_primary_sp;');
        expect((e as Error).message).toContain('duplicate key value violates unique constraint');
      }

      // 11. Test activities timeline view cost security
      await client.query(`
        UPDATE organizations 
        SET sales_can_view_costs = false 
        WHERE id = '${orgAId}';
      `);

      const quoteEventId = 'ae1ae1ae-1111-1111-1111-111111111111';
      await client.query(`
        INSERT INTO quote_events (id, organization_id, quote_id, event_type, actor_type, metadata) VALUES 
        ('${quoteEventId}', '${orgAId}', '${quoteA2Id}', 'sent', 'user', '{"subtotal": 100.50, "tax_total": 6.03, "grand_total": 106.53, "other": "test"}');
      `);

      // Switch back to Sales A1
      await client.query('SET ROLE authenticated;');
      await client.query(`
        SET LOCAL request.jwt.claim.sub = '${salesA1Id}';
        SET LOCAL request.jwt.claim.role = 'authenticated';
      `);

      // Fetch timeline through get_customer_timeline
      const resTimeline = await client.query(`
        SELECT * FROM get_customer_timeline('${customerA2Id}', 10);
      `);

      expect(resTimeline.rows.length).toBe(1);
      const metadata = resTimeline.rows[0].metadata;
      // Financial details should be stripped for Sales A1 when sales_can_view_costs is false
      expect(metadata.subtotal).toBeUndefined();
      expect(metadata.grand_total).toBeUndefined();
      expect(metadata.other).toBe('test'); // Non-financial keys are preserved

      // Reset to superuser but with Owner A's JWT sub to bypass cost hiding
      await client.query('RESET ROLE;');
      await client.query('SET ROLE authenticated;');
      await client.query(`
        SET LOCAL request.jwt.claim.sub = '${userAId}';
        SET LOCAL request.jwt.claim.role = 'authenticated';
      `);
      const resTimelineSuper = await client.query(`
        SELECT * FROM get_customer_timeline('${customerA2Id}', 10);
      `);
      expect(resTimelineSuper.rows.length).toBe(1);
      
      // pg might return jsonb as a string depending on client parser configuration, let's parse if it's a string
      const superMetadata = typeof resTimelineSuper.rows[0].metadata === 'string'
        ? JSON.parse(resTimelineSuper.rows[0].metadata)
        : resTimelineSuper.rows[0].metadata;

      expect(parseFloat(superMetadata.subtotal)).toBe(100.50);

    } finally {
      // Rollback transaction to leave database clean
      await client.query('ROLLBACK;');
    }
  });
});
