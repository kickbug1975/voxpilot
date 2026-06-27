/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, vi, beforeEach } from 'vitest';

// Setup Mock variables on globalThis for vitest hoisting safety
(globalThis as any).mockDataByTable = {};
(globalThis as any).mockErrorsByTable = {};
(globalThis as any).inserts = {};

class MockQueryBuilder {
  private tableName: string;
  private filters: Record<string, any> = {};
  private orders: any[] = [];

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select() { return this; }

  eq(col: string, val: any) {
    this.filters[col] = val;
    return this;
  }

  order(col: string, options?: any) {
    this.orders.push({ col, options });
    return this;
  }

  insert(val: any) {
    const inserts = (globalThis as any).inserts;
    if (!inserts[this.tableName]) inserts[this.tableName] = [];
    inserts[this.tableName].push(val);
    return Promise.resolve({ error: null });
  }

  private getData() {
    const mockDataByTable = (globalThis as any).mockDataByTable;
    const mocked = mockDataByTable[this.tableName];
    if (typeof mocked === 'function') {
      return mocked(this.filters, this.orders);
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

  then(onfulfilled?: (value: { data: any; error: any }) => any) {
    const data = this.getData();
    const mockErrorsByTable = (globalThis as any).mockErrorsByTable;
    const error = mockErrorsByTable[this.tableName];
    const res = Promise.resolve({ data: data || null, error: error || null });
    return res.then(onfulfilled);
  }
}

(globalThis as any).mockSupabaseClient = {
  from: (tableName: string) => new MockQueryBuilder(tableName),
  auth: {
    getUser: () => Promise.resolve({ data: { user: { id: 'user-123', email: 'test@example.com' } } }),
  },
};

// Mock next/headers
vi.mock('next/headers', () => ({
  headers: vi.fn().mockImplementation(async () => {
    const headersMap = new Map<string, string>();
    headersMap.set('x-forwarded-for', '192.168.1.120');
    headersMap.set('user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    return headersMap;
  }),
}));

// Mock Supabase servers
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

// Import actions
import { logAuditEvent, getAuditLogs } from '../src/actions/audit';

describe('Audit Logs Server Actions', () => {
  beforeEach(() => {
    (globalThis as any).mockDataByTable = {};
    (globalThis as any).mockErrorsByTable = {};
    (globalThis as any).inserts = {};
    vi.clearAllMocks();
  });

  test('logAuditEvent insère correctement un log d\'audit avec IP anonymisée et navigateur simplifié', async () => {
    await logAuditEvent('org-abc', 'user-123', 'confirm_import', 'price_imports', 'import-456', { rows: 25 });

    const inserts = (globalThis as any).inserts['audit_logs'];
    expect(inserts).toBeDefined();
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toEqual({
      organization_id: 'org-abc',
      actor_user_id: 'user-123',
      action: 'confirm_import',
      entity_type: 'price_imports',
      entity_id: 'import-456',
      metadata: { rows: 25 },
      ip_prefix: '192.168.1.0',
      user_agent_family: 'Chrome on Windows',
    });
  });

  test('getAuditLogs récupère correctement les logs si l\'utilisateur est owner/admin', async () => {
    // 1. Mock de l'organisation
    (globalThis as any).mockDataByTable['organizations'] = { id: 'org-abc', slug: 'my-org' };

    // 2. Mock du rôle utilisateur
    (globalThis as any).mockDataByTable['organization_memberships'] = { role: 'admin', status: 'active' };

    // 3. Mock des logs d'audit
    (globalThis as any).mockDataByTable['audit_logs'] = [
      { id: 'log-1', action: 'update_settings', created_at: '2026-06-22T12:00:00Z' },
    ];

    const res = await getAuditLogs('my-org');
    expect(res.error).toBeUndefined();
    expect(res.data).toHaveLength(1);
    expect(res.data?.[0].action).toBe('update_settings');
  });

  test('getAuditLogs bloque les utilisateurs qui ne sont ni owner ni admin', async () => {
    // 1. Mock de l'organisation
    (globalThis as any).mockDataByTable['organizations'] = { id: 'org-abc', slug: 'my-org' };

    // 2. Mock du rôle utilisateur (commercial / sales)
    (globalThis as any).mockDataByTable['organization_memberships'] = { role: 'sales', status: 'active' };

    const res = await getAuditLogs('my-org');
    expect(res.error).toBe('Non autorisé. Seuls les administrateurs et propriétaires peuvent voir les audits.');
    expect(res.data).toBeUndefined();
  });
});
