/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, vi, beforeEach } from 'vitest';

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
  private rangeStart = 0;
  private rangeEnd = 19;

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
  order() { return this; }
  range(start: number, end: number) {
    this.rangeStart = start;
    this.rangeEnd = end;
    return this;
  }

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
    updates[this.tableName].push({ payload: val, filters: this.filters, inFilters: this.inFilters });
    return this;
  }

  private getData() {
    if (this.isInsert) {
      return { id: 'inserted-id', ...this.insertedData };
    }
    const mockDataByTable = (globalThis as any).mockDataByTable;
    const mocked = mockDataByTable[this.tableName];
    if (typeof mocked === 'function') {
      return mocked(this.filters, this.inFilters, this.rangeStart, this.rangeEnd);
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

  then(onfulfilled?: (value: { data: any; count: number; error: any }) => any) {
    const data = this.getData();
    const mockErrorsByTable = (globalThis as any).mockErrorsByTable;
    const error = mockErrorsByTable[this.tableName];
    
    // Simulate count if it is an array
    const count = Array.isArray(data) ? data.length : (data ? 1 : 0);
    
    const res = Promise.resolve({ data: data || null, count, error: error || null });
    return res.then(onfulfilled);
  }
}

(globalThis as any).mockSupabaseClient = {
  from: (tableName: string) => new MockQueryBuilder(tableName),
};

// Mock the Supabase client creator
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => {
    return (globalThis as any).mockSupabaseClient;
  }),
}));

// Mock next/cache revalidatePath
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Import alerts server actions
import { getAlerts, updateAlertStatus, bulkUpdateAlertStatus } from '../src/actions/alerts';

describe('Alerts Server Actions', () => {
  beforeEach(() => {
    (globalThis as any).mockDataByTable = {};
    (globalThis as any).mockErrorsByTable = {};
    (globalThis as any).inserts = {};
    (globalThis as any).updates = {};
    vi.clearAllMocks();
  });

  describe('getAlerts', () => {
    test('Récupère les alertes pour une organisation avec les filtres par défaut', async () => {
      // Mock organization lookup
      (globalThis as any).mockDataByTable['organizations'] = { id: 'org-123', slug: 'my-org' };

      // Mock alerts list
      const mockAlerts = [
        { id: 'a1', title: 'Alerte 1', priority: 'critical', status: 'unread' },
        { id: 'a2', title: 'Alerte 2', priority: 'high', status: 'read' },
      ];
      (globalThis as any).mockDataByTable['alerts'] = (filters: any, inFilters: any) => {
        expect(filters.organization_id).toBe('org-123');
        expect(inFilters.status).toContain('unread');
        expect(inFilters.status).toContain('read');
        return mockAlerts;
      };

      const res = await getAlerts('my-org');
      expect(res.error).toBeUndefined();
      expect(res.data).toHaveLength(2);
      expect(res.count).toBe(2);
    });

    test('Applique le filtrage par priorité et type', async () => {
      (globalThis as any).mockDataByTable['organizations'] = { id: 'org-123', slug: 'my-org' };

      (globalThis as any).mockDataByTable['alerts'] = (filters: any) => {
        expect(filters.organization_id).toBe('org-123');
        expect(filters.priority).toBe('critical');
        expect(filters.type).toBe('cost_increase');
        return [{ id: 'a1', title: 'Hausse coût critique', priority: 'critical', type: 'cost_increase' }];
      };

      const res = await getAlerts('my-org', { priority: 'critical', type: 'cost_increase', status: 'all' });
      expect(res.data).toHaveLength(1);
      expect(res.data?.[0].id).toBe('a1');
    });

    test('Calcule la pagination correctement', async () => {
      (globalThis as any).mockDataByTable['organizations'] = { id: 'org-123', slug: 'my-org' };

      (globalThis as any).mockDataByTable['alerts'] = (filters: any, inFilters: any, start: number, end: number) => {
        expect(start).toBe(20);
        expect(end).toBe(39);
        return Array.from({ length: 15 }, (_, i) => ({ id: `alert-${i + 20}` }));
      };

      const res = await getAlerts('my-org', { page: 2, limit: 20 });
      expect(res.page).toBe(2);
      expect(res.limit).toBe(20);
    });
  });

  describe('updateAlertStatus', () => {
    test('Met à jour le statut d\'une alerte individuelle et enregistre la date de lecture', async () => {
      (globalThis as any).mockDataByTable['organizations'] = { id: 'org-123', slug: 'my-org' };

      const res = await updateAlertStatus('my-org', 'alert-abc', 'read');
      expect(res.success).toBe(true);

      const updates = (globalThis as any).updates['alerts'];
      expect(updates).toBeDefined();
      expect(updates[0].filters.id).toBe('alert-abc');
      expect(updates[0].filters.organization_id).toBe('org-123');
      expect(updates[0].payload.status).toBe('read');
      expect(updates[0].payload.read_at).toBeDefined();
    });

    test('Met à jour le statut d\'une alerte individuelle à résolue', async () => {
      (globalThis as any).mockDataByTable['organizations'] = { id: 'org-123', slug: 'my-org' };

      const res = await updateAlertStatus('my-org', 'alert-abc', 'resolved');
      expect(res.success).toBe(true);

      const updates = (globalThis as any).updates['alerts'];
      expect(updates).toBeDefined();
      expect(updates[0].payload.status).toBe('resolved');
      expect(updates[0].payload.resolved_at).toBeDefined();
    });
  });

  describe('bulkUpdateAlertStatus', () => {
    test('Met à jour plusieurs alertes en lot', async () => {
      (globalThis as any).mockDataByTable['organizations'] = { id: 'org-123', slug: 'my-org' };

      const alertIds = ['a1', 'a2', 'a3'];
      const res = await bulkUpdateAlertStatus('my-org', alertIds, 'resolved');
      expect(res.success).toBe(true);

      const updates = (globalThis as any).updates['alerts'];
      expect(updates).toBeDefined();
      expect(updates[0].inFilters.id).toEqual(alertIds);
      expect(updates[0].payload.status).toBe('resolved');
      expect(updates[0].payload.resolved_at).toBeDefined();
    });
  });
});
