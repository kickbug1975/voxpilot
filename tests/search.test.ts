/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, vi, beforeEach } from 'vitest';

// Setup Mock variables on globalThis for vitest hoisting safety
(globalThis as any).mockDataByTable = {};
(globalThis as any).mockErrorsByTable = {};

class MockQueryBuilder {
  private tableName: string;
  private filters: Record<string, any> = {};
  private orClause: string = '';
  private limitVal: number = 0;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select() { return this; }

  eq(col: string, val: any) {
    this.filters[col] = val;
    return this;
  }

  or(clause: string) {
    this.orClause = clause;
    return this;
  }

  limit(val: number) {
    this.limitVal = val;
    return this;
  }

  private getData() {
    const mockDataByTable = (globalThis as any).mockDataByTable;
    const mocked = mockDataByTable[this.tableName];
    if (typeof mocked === 'function') {
      return mocked(this.filters, this.orClause, this.limitVal);
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
};

// Mock the Supabase client creator
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => {
    return (globalThis as any).mockSupabaseClient;
  }),
}));

// Import search server action
import { globalSearch } from '../src/actions/search';

describe('Global Search Server Action', () => {
  beforeEach(() => {
    (globalThis as any).mockDataByTable = {};
    (globalThis as any).mockErrorsByTable = {};
    vi.clearAllMocks();
  });

  test('Retourne des résultats vides immédiatement pour les requêtes < 2 caractères', async () => {
    // S'assurer que supabase n'est pas appelé
    const res = await globalSearch('my-org', 'a');
    expect(res.data).toEqual({
      products: [],
      customers: [],
      suppliers: [],
      quotes: [],
    });
  });

  test('Gère les erreurs si l\'organisation n\'existe pas', async () => {
    (globalThis as any).mockErrorsByTable['organizations'] = new Error('Not found');

    const res = await globalSearch('non-existent-org', 'Saumon');
    expect(res.error).toBe('Organisation introuvable ou accès non autorisé.');
  });

  test('Exécute des requêtes de recherche multi-entités filtrées par tenant', async () => {
    // 1. Mock de l'organisation
    (globalThis as any).mockDataByTable['organizations'] = { id: 'org-123', slug: 'my-org' };

    // 2. Mocks pour chaque entité
    (globalThis as any).mockDataByTable['products'] = (filters: any, orClause: string, limitVal: number) => {
      expect(filters.organization_id).toBe('org-123');
      expect(filters.is_active).toBe(true);
      expect(orClause).toBe('name.ilike."%Saumon%",internal_sku.ilike."%Saumon%"');
      expect(limitVal).toBe(5);
      return [
        { id: 'p-1', name: 'Saumon Atlantique', internal_sku: 'SAU-ATL' }
      ];
    };

    (globalThis as any).mockDataByTable['customers'] = (filters: any, orClause: string, limitVal: number) => {
      expect(filters.organization_id).toBe('org-123');
      expect(filters.is_active).toBe(true);
      expect(orClause).toBe('legal_name.ilike."%Saumon%",code.ilike."%Saumon%"');
      expect(limitVal).toBe(5);
      return [
        { id: 'c-1', legal_name: 'Poissonerie Saumon d\'Or', code: 'CUST-SAU' }
      ];
    };

    (globalThis as any).mockDataByTable['suppliers'] = (filters: any, orClause: string, limitVal: number) => {
      expect(filters.organization_id).toBe('org-123');
      expect(filters.is_active).toBe(true);
      expect(orClause).toBe('name.ilike."%Saumon%",code.ilike."%Saumon%"');
      expect(limitVal).toBe(5);
      return [];
    };

    (globalThis as any).mockDataByTable['quotes'] = (filters: any, orClause: string, limitVal: number) => {
      expect(filters.organization_id).toBe('org-123');
      expect(orClause).toBe('quote_number.ilike."%Saumon%",title.ilike."%Saumon%"');
      expect(limitVal).toBe(5);
      return [
        { id: 'q-1', quote_number: 'DEV-2026-001', title: 'Devis Saumon Frais' }
      ];
    };

    const res = await globalSearch('my-org', 'Saumon');
    expect(res.error).toBeUndefined();
    expect(res.data).toBeDefined();

    expect(res.data?.products).toEqual([
      { id: 'p-1', title: 'Saumon Atlantique', subtitle: 'SKU: SAU-ATL', url: '/my-org/products/p-1' }
    ]);
    expect(res.data?.customers).toEqual([
      { id: 'c-1', title: 'Poissonerie Saumon d\'Or', subtitle: 'Code: CUST-SAU', url: '/my-org/customers/c-1' }
    ]);
    expect(res.data?.suppliers).toEqual([]);
    expect(res.data?.quotes).toEqual([
      { id: 'q-1', title: 'DEV-2026-001', subtitle: 'Devis Saumon Frais', url: '/my-org/quotes/q-1' }
    ]);
  });

  test('Respecte la limite de tenant et l\'isolation des données', async () => {
    // Appel pour l'organisation A
    (globalThis as any).mockDataByTable['organizations'] = { id: 'org-A', slug: 'org-a' };
    (globalThis as any).mockDataByTable['products'] = (filters: any) => {
      expect(filters.organization_id).toBe('org-A');
      return [];
    };
    (globalThis as any).mockDataByTable['customers'] = () => [];
    (globalThis as any).mockDataByTable['suppliers'] = () => [];
    (globalThis as any).mockDataByTable['quotes'] = () => [];

    await globalSearch('org-a', 'TestQuery');

    // Appel pour l'organisation B
    (globalThis as any).mockDataByTable['organizations'] = { id: 'org-B', slug: 'org-b' };
    (globalThis as any).mockDataByTable['products'] = (filters: any) => {
      expect(filters.organization_id).toBe('org-B');
      return [];
    };

    await globalSearch('org-b', 'TestQuery');
  });
});
