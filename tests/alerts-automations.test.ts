/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// Setup Mock variables on globalThis for vitest hoisting safety
(globalThis as any).mockDataByTable = {};
(globalThis as any).mockErrorsByTable = {};
(globalThis as any).inserts = {};
(globalThis as any).updates = {};

class MockQueryBuilder {
  private tableName: string;
  private isInsert = false;
  private insertedData: any = null;
  private filters: Record<string, any> = {};
  private inFilters: Record<string, any[]> = {};
  private isNullFilters: Record<string, boolean> = {};

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select() { return this; }
  eq(col: string, val: any) {
    this.filters[col] = val;
    return this;
  }
  in(col: string, val: any[]) {
    this.inFilters[col] = val;
    return this;
  }
  is(col: string, val: any) {
    if (val === null) {
      this.isNullFilters[col] = true;
    } else {
      this.filters[col] = val;
    }
    return this;
  }
  order() { return this; }
  limit() { return this; }

  insert(val: any) {
    this.isInsert = true;
    this.insertedData = val;
    const inserts = (globalThis as any).inserts;
    if (!inserts[this.tableName]) inserts[this.tableName] = [];
    inserts[this.tableName].push(val);
    return this;
  }

  update(val: any) {
    const updates = (globalThis as any).updates;
    if (!updates[this.tableName]) updates[this.tableName] = [];
    updates[this.tableName].push(val);
    return this;
  }

  delete() { return this; }

  private getData() {
    if (this.isInsert) {
      return { id: 'inserted-id', ...this.insertedData };
    }
    const mockDataByTable = (globalThis as any).mockDataByTable;
    const mocked = mockDataByTable[this.tableName];
    if (typeof mocked === 'function') {
      return mocked(this.filters, this.inFilters, this.isNullFilters);
    }
    if (mocked && typeof mocked === 'object' && !Array.isArray(mocked)) {
      if (this.filters.public_token_hash && mocked[this.filters.public_token_hash] !== undefined) {
        return mocked[this.filters.public_token_hash];
      }
      if (this.filters.id && mocked[this.filters.id] !== undefined) {
        return mocked[this.filters.id];
      }
      if (this.filters.product_id && mocked[this.filters.product_id] !== undefined) {
        return mocked[this.filters.product_id];
      }
    }
    return mocked;
  }

  single() {
    const data = this.getData();
    const mockErrorsByTable = (globalThis as any).mockErrorsByTable;
    const error = mockErrorsByTable[this.tableName];
    const singleData = Array.isArray(data) ? data[0] : data;
    return Promise.resolve({ data: singleData || null, error: error || null });
  }

  maybeSingle() {
    return this.single();
  }

  then(onfulfilled?: (value: { data: any; count?: number; error: any }) => any) {
    const data = this.getData();
    const mockErrorsByTable = (globalThis as any).mockErrorsByTable;
    const error = mockErrorsByTable[this.tableName];
    const count = Array.isArray(data) ? data.length : (data ? 1 : 0);
    const res = Promise.resolve({ data: data || null, count, error: error || null });
    return res.then(onfulfilled);
  }
}

(globalThis as any).mockSupabaseClient = {
  from: (tableName: string) => new MockQueryBuilder(tableName),
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
  }
};

// Mock Supabase admin & server
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockImplementation(() => {
    return (globalThis as any).mockSupabaseClient;
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => {
    return (globalThis as any).mockSupabaseClient;
  }),
}));

// Mock audit log
vi.mock('../src/actions/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(true),
}));

// Mock next/cache
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Mock next/headers
vi.mock('next/headers', () => ({
  headers: vi.fn().mockImplementation(async () => {
    return {
      get: (key: string) => {
        if (key === 'user-agent') return 'Mozilla/5.0';
        if (key === 'x-forwarded-for') return '192.168.1.100';
        return null;
      }
    };
  }),
}));

import { getPublicQuote } from '../src/actions/publicQuotes';
import { confirmImport } from '../src/actions/imports';

describe('Alerts Automation - Public Quotes & Imports', () => {
  beforeEach(() => {
    (globalThis as any).mockDataByTable = {};
    (globalThis as any).mockErrorsByTable = {};
    (globalThis as any).inserts = {};
    (globalThis as any).updates = {};
    vi.clearAllMocks();
  });

  describe('FR-ALT-001: Automatic alert when public quote is viewed first time', () => {
    const token = 'secret-token-123';
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    test('Triggers quote_viewed alert and logs event when quote is first viewed by client', async () => {
      const mockQuote = {
        id: 'quote-abc',
        organization_id: 'org-abc',
        status: 'sent',
        quote_number: 'QT-2026-0001',
        public_token_hash: tokenHash,
        public_token_expires_at: new Date(Date.now() + 3600000).toISOString(),
        customers: { legal_name: 'Client Test', primary_email: 'client@test.com' }
      };

      (globalThis as any).mockDataByTable['quotes'] = {
        [tokenHash]: mockQuote
      };
      (globalThis as any).mockDataByTable['quote_items'] = [];
      (globalThis as any).mockDataByTable['organizations'] = {
        name: 'My Org',
        phone: '12345',
        commercial_email: 'sales@org.com'
      };

      const res = await getPublicQuote(token);
      expect(res.error).toBeUndefined();
      expect(res.data).toBeDefined();

      // Check quote status update
      const quoteUpdates = (globalThis as any).updates['quotes'];
      expect(quoteUpdates).toHaveLength(1);
      expect(quoteUpdates[0].status).toBe('viewed');

      // Check alert insert
      const alerts = (globalThis as any).inserts['alerts'];
      expect(alerts).toBeDefined();
      expect(alerts).toHaveLength(1);
      
      const alert = alerts[0];
      expect(alert.type).toBe('quote_viewed');
      expect(alert.priority).toBe('medium');
      expect(alert.status).toBe('unread');
      expect(alert.title).toBe('Devis consulté : QT-2026-0001');
      expect(alert.message).toBe('Le client a ouvert le devis public pour la première fois.');
      expect(alert.entity_type).toBe('quotes');
      expect(alert.entity_id).toBe('quote-abc');
      expect(alert.metadata).toEqual({ quote_number: 'QT-2026-0001' });
    });

    test('Does not trigger alert when quote is already viewed or accepted', async () => {
      const mockQuote = {
        id: 'quote-abc',
        organization_id: 'org-abc',
        status: 'viewed', // already viewed
        quote_number: 'QT-2026-0001',
        public_token_hash: tokenHash,
        public_token_expires_at: new Date(Date.now() + 3600000).toISOString(),
        customers: { legal_name: 'Client Test', primary_email: 'client@test.com' }
      };

      (globalThis as any).mockDataByTable['quotes'] = {
        [tokenHash]: mockQuote
      };
      (globalThis as any).mockDataByTable['quote_items'] = [];
      (globalThis as any).mockDataByTable['organizations'] = {
        name: 'My Org',
        phone: '12345',
        commercial_email: 'sales@org.com'
      };

      const res = await getPublicQuote(token);
      expect(res.error).toBeUndefined();

      // No quote updates or alerts
      expect((globalThis as any).updates['quotes']).toBeUndefined();
      expect((globalThis as any).inserts['alerts']).toBeUndefined();
    });
  });

  describe('FR-ALT-002: Automatic alert when margin drops below target on import confirmation', () => {
    beforeEach(() => {
      // Mock organization
      (globalThis as any).mockDataByTable['organizations'] = (filters: any) => {
        if (filters.slug === 'my-org-slug') {
          return { id: 'org-abc', slug: 'my-org-slug' };
        }
        return { id: 'org-abc', cost_increase_alert_rate: 0.05, default_margin_rate: 0.20 };
      };

      // Mock import details
      (globalThis as any).mockDataByTable['price_imports'] = {
        id: 'import-abc',
        organization_id: 'org-abc',
        supplier_id: 'sup-abc',
        suppliers: { name: 'Supplier Inc' }
      };

      // Mock active margin rules (empty by default, resolves to 20% default margin rate)
      (globalThis as any).mockDataByTable['margin_rules'] = [];

      // Mock product
      (globalThis as any).mockDataByTable['products'] = {
        name: 'Premium Salmon',
        category_id: 'cat-fish'
      };
    });

    test('Triggers high priority below_margin alert when currentMargin is below target but positive', async () => {
      // Landed cost is calculated based on:
      // purchasePrice: 7.5, conversion_factor: 1, yield: 1 -> landed cost = 7.5
      // Sales price = 9.0 (margin is (9 - 7.5) / 9 = 16.67% < 20% target)
      
      // Mock rows
      (globalThis as any).mockDataByTable['price_import_rows'] = [
        {
          id: 'row-1',
          row_number: 1,
          validation_status: 'valid',
          match_status: 'auto_matched',
          matched_product_id: 'prod-salmon',
          label: 'Premium Salmon',
          purchase_price: 7.5,
          conversion_factor: 1.0,
          yield_rate: 1.0,
          purchase_unit: 'kg'
        }
      ];

      // Mock product sales price
      (globalThis as any).mockDataByTable['product_sales_prices'] = {
        sales_price: '9.00'
      };

      // Mock existing supplier product (old landed cost 7.0)
      (globalThis as any).mockDataByTable['supplier_products'] = {
        id: 'sp-salmon',
        current_landed_cost: '7.00'
      };

      const res = await confirmImport('my-org-slug', 'import-abc');
      expect(res.success).toBe(true);

      // Check alerts
      const alerts = (globalThis as any).inserts['alerts'];
      expect(alerts).toBeDefined();
      // One cost_increase alert (7.5 vs 7.0 is > 5%), and one below_margin alert
      const belowMarginAlerts = alerts.filter((a: any) => a.type === 'below_margin');
      expect(belowMarginAlerts).toHaveLength(1);
      
      const alert = belowMarginAlerts[0];
      expect(alert.priority).toBe('high');
      expect(alert.title).toBe('Marge insuffisante : Premium Salmon');
      expect(alert.message).toContain('La marge brute actuelle (16.7%) est inférieure à la marge cible de 20.0%.');
      expect(alert.entity_type).toBe('products');
      expect(alert.entity_id).toBe('prod-salmon');
      expect(alert.metadata.currentMargin).toBeCloseTo(0.1667, 4);
      expect(alert.metadata.targetMargin).toBe(0.20);
      expect(alert.metadata.salesPrice).toBe(9.0);
      expect(alert.metadata.landedCost).toBe(7.5);
    });

    test('Triggers critical priority below_margin alert when currentMargin is negative', async () => {
      // Landed cost = 11.0, Sales price = 10.0 -> margin is (10 - 11) / 10 = -10% < 20% target
      
      // Mock rows
      (globalThis as any).mockDataByTable['price_import_rows'] = [
        {
          id: 'row-1',
          row_number: 1,
          validation_status: 'valid',
          match_status: 'auto_matched',
          matched_product_id: 'prod-salmon',
          label: 'Premium Salmon',
          purchase_price: 11.0,
          conversion_factor: 1.0,
          yield_rate: 1.0,
          purchase_unit: 'kg'
        }
      ];

      // Mock product sales price
      (globalThis as any).mockDataByTable['product_sales_prices'] = {
        sales_price: '10.00'
      };

      // Mock existing supplier product
      (globalThis as any).mockDataByTable['supplier_products'] = {
        id: 'sp-salmon',
        current_landed_cost: '10.50'
      };

      const res = await confirmImport('my-org-slug', 'import-abc');
      expect(res.success).toBe(true);

      const alerts = (globalThis as any).inserts['alerts'];
      expect(alerts).toBeDefined();
      const belowMarginAlerts = alerts.filter((a: any) => a.type === 'below_margin');
      expect(belowMarginAlerts).toHaveLength(1);
      
      const alert = belowMarginAlerts[0];
      expect(alert.priority).toBe('critical');
      expect(alert.message).toContain('La marge brute actuelle (-10.0%)');
    });

    test('Does not trigger alert when margin is above or equal target', async () => {
      // Landed cost = 8.0, Sales price = 10.0 -> margin is (10 - 8) / 10 = 20% == 20% target
      
      // Mock rows
      (globalThis as any).mockDataByTable['price_import_rows'] = [
        {
          id: 'row-1',
          row_number: 1,
          validation_status: 'valid',
          match_status: 'auto_matched',
          matched_product_id: 'prod-salmon',
          label: 'Premium Salmon',
          purchase_price: 8.0,
          conversion_factor: 1.0,
          yield_rate: 1.0,
          purchase_unit: 'kg'
        }
      ];

      // Mock product sales price
      (globalThis as any).mockDataByTable['product_sales_prices'] = {
        sales_price: '10.00'
      };

      // Mock existing supplier product
      (globalThis as any).mockDataByTable['supplier_products'] = {
        id: 'sp-salmon',
        current_landed_cost: '8.00'
      };

      const res = await confirmImport('my-org-slug', 'import-abc');
      expect(res.success).toBe(true);

      const alerts = (globalThis as any).inserts['alerts'];
      const belowMarginAlerts = alerts ? alerts.filter((a: any) => a.type === 'below_margin') : [];
      expect(belowMarginAlerts).toHaveLength(0);
    });
  });
});
