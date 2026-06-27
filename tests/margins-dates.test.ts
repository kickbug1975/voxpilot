/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { PricingEngine, MarginRule } from '../src/domain/PricingEngine';

// Setup Mock variables on globalThis for vitest hoisting safety
(globalThis as any).mockDataByTable = {};
(globalThis as any).mockErrorsByTable = {};
(globalThis as any).inserts = {};
(globalThis as any).updates = {};
(globalThis as any).mockUser = { id: 'user-admin', email: 'admin@example.com' };

class MockQueryBuilder {
  private tableName: string;
  private isInsert = false;
  private insertedData: any = null;
  private isUpdate = false;
  private updatePayload: any = null;
  private isDelete = false;
  private filters: Array<{ col: string; op: 'eq' | 'neq' | 'is' | 'in'; val: any }> = [];
  private isSingle = false;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select() { return this; }
  eq(col: string, val: any) {
    this.filters.push({ col, op: 'eq', val });
    return this;
  }
  neq(col: string, val: any) {
    this.filters.push({ col, op: 'neq', val });
    return this;
  }
  is(col: string, val: any) {
    this.filters.push({ col, op: 'is', val });
    return this;
  }
  in(col: string, val: any) {
    this.filters.push({ col, op: 'in', val });
    return this;
  }
  order() { return this; }
  limit() { return this; }
  single() {
    this.isSingle = true;
    return this;
  }

  insert(val: any) {
    this.isInsert = true;
    this.insertedData = val;
    return this;
  }

  update(val: any) {
    this.isUpdate = true;
    this.updatePayload = val;
    return this;
  }

  delete() {
    this.isDelete = true;
    return this;
  }

  private getData() {
    const mockDataByTable = (globalThis as any).mockDataByTable;

    if (this.isInsert) {
      const inserts = (globalThis as any).inserts;
      if (!inserts[this.tableName]) inserts[this.tableName] = [];
      inserts[this.tableName].push(this.insertedData);
      
      const newRecord = { id: 'new-id-' + Math.random(), ...this.insertedData };
      if (!mockDataByTable[this.tableName]) mockDataByTable[this.tableName] = [];
      if (Array.isArray(mockDataByTable[this.tableName])) {
        mockDataByTable[this.tableName].push(newRecord);
      }
      return newRecord;
    }

    let data = mockDataByTable[this.tableName] || [];

    if (Array.isArray(data)) {
      // Apply filters
      for (const f of this.filters) {
        data = data.filter((item: any) => {
          if (f.op === 'eq') {
            return item[f.col] === f.val;
          }
          if (f.op === 'neq') {
            return item[f.col] !== f.val;
          }
          if (f.op === 'is') {
            return item[f.col] === f.val;
          }
          if (f.op === 'in') {
            return Array.isArray(f.val) ? f.val.includes(item[f.col]) : false;
          }
          return true;
        });
      }
    }

    let result = data;

    if (this.isUpdate) {
      const updates = (globalThis as any).updates;
      if (!updates[this.tableName]) updates[this.tableName] = [];
      updates[this.tableName].push({ payload: this.updatePayload, filters: this.filters });

      // Apply the update to the matching items in the main mock table
      const mainData = mockDataByTable[this.tableName] || [];
      if (Array.isArray(mainData)) {
        for (const item of mainData) {
          let match = true;
          for (const f of this.filters) {
            if (f.op === 'eq' && item[f.col] !== f.val) match = false;
            if (f.op === 'neq' && item[f.col] === f.val) match = false;
            if (f.op === 'is' && item[f.col] !== f.val) match = false;
            if (f.op === 'in' && !(Array.isArray(f.val) ? f.val.includes(item[f.col]) : false)) match = false;
          }
          if (match) {
            Object.assign(item, this.updatePayload);
          }
        }
      }
      result = data.map((item: any) => ({ ...item, ...this.updatePayload }));
    }

    if (this.isDelete) {
      const updates = (globalThis as any).updates;
      if (!updates[this.tableName]) updates[this.tableName] = [];
      updates[this.tableName].push({ deleted: true, filters: this.filters });

      if (Array.isArray(mockDataByTable[this.tableName])) {
        mockDataByTable[this.tableName] = mockDataByTable[this.tableName].filter((item: any) => {
          let match = true;
          for (const f of this.filters) {
            if (f.op === 'eq' && item[f.col] !== f.val) match = false;
            if (f.op === 'neq' && item[f.col] === f.val) match = false;
            if (f.op === 'is' && item[f.col] !== f.val) match = false;
          }
          return !match;
        });
      }
      result = data;
    }

    if (this.isSingle) {
      return Array.isArray(result) ? (result.length > 0 ? result[0] : null) : result;
    }
    return result;
  }

  then(onfulfilled?: (value: { data: any; error: any }) => any) {
    const data = this.getData();
    const error = (globalThis as any).mockErrorsByTable[this.tableName] || null;
    const res = Promise.resolve({ data: data || null, error });
    return res.then(onfulfilled);
  }
}

(globalThis as any).mockSupabaseClient = {
  from: (tableName: string) => new MockQueryBuilder(tableName),
  auth: {
    getUser: vi.fn().mockImplementation(() => Promise.resolve({ data: { user: (globalThis as any).mockUser } })),
  },
};

// Mock the Supabase client creators
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => {
    return (globalThis as any).mockSupabaseClient;
  }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockImplementation(() => {
    return (globalThis as any).mockSupabaseClient;
  }),
}));

// Mock next/cache revalidatePath
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Import margins server actions
import { createMarginRule, updateMarginRule } from '../src/actions/margins';

describe('Margin Rules validity dates and non-overlapping constraint', () => {
  beforeEach(() => {
    (globalThis as any).mockDataByTable = {
      organizations: [{ id: 'org-123', slug: 'my-org', default_margin_rate: 0.20 }],
      margin_rules: []
    };
    (globalThis as any).mockErrorsByTable = {};
    (globalThis as any).inserts = {};
    (globalThis as any).updates = {};
    vi.clearAllMocks();
  });

  describe('Server Actions - date validation', () => {
    test('createMarginRule saves valid date range', async () => {
      const formData = new FormData();
      formData.append('scope', 'customer');
      formData.append('targetMarginRate', '0.25');
      formData.append('customerId', 'cust-123');
      formData.append('priority', '10');
      formData.append('validFrom', '2026-06-01');
      formData.append('validTo', '2026-06-30');

      const res = await createMarginRule('my-org', formData);
      expect(res.success).toBe(true);
      expect(res.data.valid_from).toBe('2026-06-01');
      expect(res.data.valid_to).toBe('2026-06-30');
    });

    test('createMarginRule rejects invalid date format', async () => {
      const formData = new FormData();
      formData.append('scope', 'customer');
      formData.append('targetMarginRate', '0.25');
      formData.append('customerId', 'cust-123');
      formData.append('priority', '10');
      formData.append('validFrom', '01-06-2026'); // incorrect format

      const res = await createMarginRule('my-org', formData);
      expect(res.error).toContain('Le format de la date de début est incorrect');
    });

    test('createMarginRule rejects when validFrom > validTo', async () => {
      const formData = new FormData();
      formData.append('scope', 'customer');
      formData.append('targetMarginRate', '0.25');
      formData.append('customerId', 'cust-123');
      formData.append('priority', '10');
      formData.append('validFrom', '2026-06-15');
      formData.append('validTo', '2026-06-10'); // validFrom > validTo

      const res = await createMarginRule('my-org', formData);
      expect(res.error).toContain('La date de début doit être antérieure ou égale à la date de fin');
    });
  });

  describe('Server Actions - non-overlapping validation', () => {
    test('prevents creating overlapping rules for the same target', async () => {
      // 1. Create a rule from 2026-06-01 to 2026-06-30
      (globalThis as any).mockDataByTable.margin_rules = [
        {
          id: 'rule-existing',
          organization_id: 'org-123',
          scope: 'customer',
          customer_id: 'cust-123',
          category_id: null,
          product_id: null,
          target_margin_rate: 0.22,
          priority: 5,
          is_active: true,
          valid_from: '2026-06-01',
          valid_to: '2026-06-30'
        }
      ];

      // 2. Try to create overlapping rule (2026-06-15 to 2026-07-15)
      const formData = new FormData();
      formData.append('scope', 'customer');
      formData.append('targetMarginRate', '0.25');
      formData.append('customerId', 'cust-123');
      formData.append('priority', '10');
      formData.append('validFrom', '2026-06-15');
      formData.append('validTo', '2026-07-15');

      const res = await createMarginRule('my-org', formData);
      expect(res.error).toContain('Une règle de marge active existe déjà pour ce ciblage');
    });

    test('allows creating overlapping rules if one is inactive', async () => {
      // 1. Create an inactive rule from 2026-06-01 to 2026-06-30
      (globalThis as any).mockDataByTable.margin_rules = [
        {
          id: 'rule-existing',
          organization_id: 'org-123',
          scope: 'customer',
          customer_id: 'cust-123',
          category_id: null,
          product_id: null,
          target_margin_rate: 0.22,
          priority: 5,
          is_active: false, // INACTIVE
          valid_from: '2026-06-01',
          valid_to: '2026-06-30'
        }
      ];

      // 2. Try to create overlapping rule (2026-06-15 to 2026-07-15)
      const formData = new FormData();
      formData.append('scope', 'customer');
      formData.append('targetMarginRate', '0.25');
      formData.append('customerId', 'cust-123');
      formData.append('priority', '10');
      formData.append('validFrom', '2026-06-15');
      formData.append('validTo', '2026-07-15');

      const res = await createMarginRule('my-org', formData);
      expect(res.success).toBe(true);
    });

    test('updateMarginRule excludes rule own ID and checks overlap correctly', async () => {
      // 1. Setup two rules
      (globalThis as any).mockDataByTable.margin_rules = [
        {
          id: 'rule-A',
          organization_id: 'org-123',
          scope: 'customer',
          customer_id: 'cust-123',
          category_id: null,
          product_id: null,
          target_margin_rate: 0.22,
          priority: 5,
          is_active: true,
          valid_from: '2026-06-01',
          valid_to: '2026-06-10'
        },
        {
          id: 'rule-B',
          organization_id: 'org-123',
          scope: 'customer',
          customer_id: 'cust-123',
          category_id: null,
          product_id: null,
          target_margin_rate: 0.25,
          priority: 10,
          is_active: true,
          valid_from: '2026-06-15',
          valid_to: '2026-06-30'
        }
      ];

      // Update rule-A with no changes (should work since its own ID is excluded)
      const formDataSame = new FormData();
      formDataSame.append('targetMarginRate', '0.22');
      formDataSame.append('priority', '5');
      formDataSame.append('isActive', 'true');
      formDataSame.append('validFrom', '2026-06-01');
      formDataSame.append('validTo', '2026-06-10');

      const resSame = await updateMarginRule('my-org', 'rule-A', formDataSame);
      expect(resSame.success).toBe(true);

      // Update rule-A to overlap with rule-B (should fail)
      const formDataOverlap = new FormData();
      formDataOverlap.append('targetMarginRate', '0.22');
      formDataOverlap.append('priority', '5');
      formDataOverlap.append('isActive', 'true');
      formDataOverlap.append('validFrom', '2026-06-20'); // Overlaps with rule-B
      formDataOverlap.append('validTo', '2026-06-25');

      const resOverlap = await updateMarginRule('my-org', 'rule-A', formDataOverlap);
      expect(resOverlap.error).toContain('Une règle de marge active existe déjà pour ce ciblage');
    });
  });

  describe('PricingEngine date resolution', () => {
    const rules: MarginRule[] = [
      {
        id: 'rule-june',
        scope: 'customer',
        customer_id: 'cust-123',
        target_margin_rate: 0.25,
        valid_from: '2026-06-01',
        valid_to: '2026-06-30',
        is_active: true,
        priority: 10
      },
      {
        id: 'rule-july',
        scope: 'customer',
        customer_id: 'cust-123',
        target_margin_rate: 0.30,
        valid_from: '2026-07-01',
        valid_to: '2026-07-31',
        is_active: true,
        priority: 10
      }
    ];

    test('resolves June rule for June 15th reference date', () => {
      const res = PricingEngine.resolveMarginRule(
        {
          customerId: 'cust-123',
          referenceDate: '2026-06-15'
        },
        rules,
        0.20
      );
      expect(res.ruleId).toBe('rule-june');
      expect(res.targetMarginRate.toNumber()).toBe(0.25);
    });

    test('resolves July rule for July 15th reference date', () => {
      const res = PricingEngine.resolveMarginRule(
        {
          customerId: 'cust-123',
          referenceDate: '2026-07-15'
        },
        rules,
        0.20
      );
      expect(res.ruleId).toBe('rule-july');
      expect(res.targetMarginRate.toNumber()).toBe(0.30);
    });

    test('resolves fallback for August reference date', () => {
      const res = PricingEngine.resolveMarginRule(
        {
          customerId: 'cust-123',
          referenceDate: '2026-08-15'
        },
        rules,
        0.20
      );
      expect(res.source).toBe('organization');
      expect(res.targetMarginRate.toNumber()).toBe(0.20);
    });

    test('defaults to current local date if referenceDate is omitted', () => {
      // Mock system date to 2026-06-22
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-22T12:00:00'));

      const res = PricingEngine.resolveMarginRule(
        {
          customerId: 'cust-123'
        },
        rules,
        0.20
      );
      expect(res.ruleId).toBe('rule-june');
      expect(res.targetMarginRate.toNumber()).toBe(0.25);

      vi.useRealTimers();
    });
  });
});
