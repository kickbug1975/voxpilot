/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, vi, beforeEach } from 'vitest';

// Setup Mock variables on globalThis for vitest hoisting safety
(globalThis as any).mockDataByTable = {};
(globalThis as any).mockErrorsByTable = {};
(globalThis as any).mockCountsByTable = {};
(globalThis as any).inserts = {};
(globalThis as any).updates = {};
(globalThis as any).deletes = {};
(globalThis as any).mockUser = { id: 'user-123', email: 'test@example.com' };

class MockQueryBuilder {
  private tableName: string;
  private filters: Record<string, any> = {};
  private countOptions?: { count: string; head?: boolean };
  private isDelete = false;
  private isUpdate = false;
  private updateVal: any = null;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(_columns: string = '*', options?: { count: string; head?: boolean }) {
    this.countOptions = options;
    return this;
  }

  eq(col: string, val: any) {
    this.filters[col] = val;
    return this;
  }

  single() {
    const mockDataByTable = (globalThis as any).mockDataByTable;
    const data = mockDataByTable[this.tableName];
    const mockErrorsByTable = (globalThis as any).mockErrorsByTable;
    const error = mockErrorsByTable[this.tableName];
    const singleData = Array.isArray(data) ? data[0] : data;
    return Promise.resolve({ data: singleData || null, error: error || null });
  }

  update(val: any) {
    this.isUpdate = true;
    this.updateVal = val;
    return this;
  }

  delete() {
    this.isDelete = true;
    return this;
  }

  insert(val: any) {
    const inserts = (globalThis as any).inserts;
    if (!inserts[this.tableName]) inserts[this.tableName] = [];
    inserts[this.tableName].push(val);
    return Promise.resolve({ error: null });
  }

  then(onfulfilled?: (value: { data: any; error: any; count?: number }) => any) {
    const mockErrorsByTable = (globalThis as any).mockErrorsByTable;
    const error = mockErrorsByTable[this.tableName];
    let data = null;
    let count = undefined;

    if (this.isUpdate) {
      const updates = (globalThis as any).updates;
      if (!updates[this.tableName]) updates[this.tableName] = [];
      updates[this.tableName].push({ filters: { ...this.filters }, val: this.updateVal });
    }

    if (this.isDelete) {
      const deletes = (globalThis as any).deletes;
      if (!deletes[this.tableName]) deletes[this.tableName] = [];
      deletes[this.tableName].push({ filters: { ...this.filters } });
    }

    if (this.countOptions?.count === 'exact') {
      const mockCountsByTable = (globalThis as any).mockCountsByTable;
      count = mockCountsByTable[this.tableName] ?? 0;
    } else if (!this.isDelete && !this.isUpdate) {
      const mockDataByTable = (globalThis as any).mockDataByTable;
      data = mockDataByTable[this.tableName] || null;
    }

    const res = Promise.resolve({ data, error: error || null, count });
    return res.then(onfulfilled);
  }
}

(globalThis as any).mockSupabaseClient = {
  from: (tableName: string) => new MockQueryBuilder(tableName),
  auth: {
    getUser: vi.fn().mockImplementation(() => Promise.resolve({ data: { user: (globalThis as any).mockUser } })),
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

// Mock next/cache
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Import actions AFTER mocking
import { deleteSupplier } from '../src/actions/suppliers';
import { deleteProduct } from '../src/actions/products';

describe('Catalog Safe Delete / Archiving', () => {
  beforeEach(() => {
    (globalThis as any).mockDataByTable = {};
    (globalThis as any).mockErrorsByTable = {};
    (globalThis as any).mockCountsByTable = {};
    (globalThis as any).inserts = {};
    (globalThis as any).updates = {};
    (globalThis as any).deletes = {};
    (globalThis as any).mockUser = { id: 'user-123', email: 'test@example.com' };
    vi.clearAllMocks();
  });

  describe('Suppliers Archiving & Deletion', () => {
    test('Un fournisseur avec des imports est archivé (is_active = false) et un audit supplier_archived est créé', async () => {
      // 1. Mock de l'organisation
      (globalThis as any).mockDataByTable['organizations'] = { id: 'org-abc', slug: 'my-org' };

      // 2. Mock du fournisseur existant
      (globalThis as any).mockDataByTable['suppliers'] = { id: 'supplier-123', name: 'OceanNord Import' };

      // 3. Mock du nombre d'imports > 0
      (globalThis as any).mockCountsByTable['price_imports'] = 3;

      const result = await deleteSupplier('my-org', 'supplier-123');

      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);

      // Vérifier qu'une mise à jour a été effectuée pour mettre is_active à false
      const supplierUpdates = (globalThis as any).updates['suppliers'];
      expect(supplierUpdates).toBeDefined();
      expect(supplierUpdates).toHaveLength(1);
      expect(supplierUpdates[0].val).toEqual({ is_active: false });
      expect(supplierUpdates[0].filters.id).toBe('supplier-123');

      // Vérifier qu'aucune suppression physique n'a eu lieu
      const supplierDeletes = (globalThis as any).deletes['suppliers'];
      expect(supplierDeletes).toBeUndefined();

      // Vérifier le log d'audit
      const auditInserts = (globalThis as any).inserts['audit_logs'];
      expect(auditInserts).toBeDefined();
      expect(auditInserts).toHaveLength(1);
      expect(auditInserts[0].action).toBe('supplier_archived');
      expect(auditInserts[0].entity_type).toBe('suppliers');
      expect(auditInserts[0].entity_id).toBe('supplier-123');
      expect(auditInserts[0].metadata).toEqual({ name: 'OceanNord Import' });
    });

    test('Un fournisseur sans imports est supprimé physiquement et un audit supplier_deleted est créé', async () => {
      // 1. Mock de l'organisation
      (globalThis as any).mockDataByTable['organizations'] = { id: 'org-abc', slug: 'my-org' };

      // 2. Mock du fournisseur existant
      (globalThis as any).mockDataByTable['suppliers'] = { id: 'supplier-123', name: 'OceanNord Import' };

      // 3. Mock du nombre d'imports = 0
      (globalThis as any).mockCountsByTable['price_imports'] = 0;

      const result = await deleteSupplier('my-org', 'supplier-123');

      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);

      // Vérifier qu'aucune mise à jour n'a eu lieu
      const supplierUpdates = (globalThis as any).updates['suppliers'];
      expect(supplierUpdates).toBeUndefined();

      // Vérifier qu'une suppression physique a été exécutée
      const supplierDeletes = (globalThis as any).deletes['suppliers'];
      expect(supplierDeletes).toBeDefined();
      expect(supplierDeletes).toHaveLength(1);
      expect(supplierDeletes[0].filters.id).toBe('supplier-123');

      // Vérifier le log d'audit
      const auditInserts = (globalThis as any).inserts['audit_logs'];
      expect(auditInserts).toBeDefined();
      expect(auditInserts).toHaveLength(1);
      expect(auditInserts[0].action).toBe('supplier_deleted');
      expect(auditInserts[0].entity_type).toBe('suppliers');
      expect(auditInserts[0].entity_id).toBe('supplier-123');
      expect(auditInserts[0].metadata).toEqual({ name: 'OceanNord Import' });
    });
  });

  describe('Products Archiving & Deletion', () => {
    test('Un produit utilisé dans des devis est archivé (is_active = false) et un audit product_archived est créé', async () => {
      // 1. Mock de l'organisation
      (globalThis as any).mockDataByTable['organizations'] = { id: 'org-abc', slug: 'my-org' };

      // 2. Mock du produit existant
      (globalThis as any).mockDataByTable['products'] = { id: 'product-999', name: 'Saumon Atlantique Frais' };

      // 3. Mock du nombre de quote_items > 0
      (globalThis as any).mockCountsByTable['quote_items'] = 2;

      const result = await deleteProduct('my-org', 'product-999');

      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);

      // Vérifier qu'une mise à jour a été effectuée pour mettre is_active à false
      const productUpdates = (globalThis as any).updates['products'];
      expect(productUpdates).toBeDefined();
      expect(productUpdates).toHaveLength(1);
      expect(productUpdates[0].val).toEqual({ is_active: false });
      expect(productUpdates[0].filters.id).toBe('product-999');

      // Vérifier qu'aucune suppression physique n'a eu lieu
      const productDeletes = (globalThis as any).deletes['products'];
      expect(productDeletes).toBeUndefined();

      // Vérifier le log d'audit
      const auditInserts = (globalThis as any).inserts['audit_logs'];
      expect(auditInserts).toBeDefined();
      expect(auditInserts).toHaveLength(1);
      expect(auditInserts[0].action).toBe('product_archived');
      expect(auditInserts[0].entity_type).toBe('products');
      expect(auditInserts[0].entity_id).toBe('product-999');
      expect(auditInserts[0].metadata).toEqual({ name: 'Saumon Atlantique Frais' });
    });

    test('Un produit sans devis est supprimé physiquement et un audit product_deleted est créé', async () => {
      // 1. Mock de l'organisation
      (globalThis as any).mockDataByTable['organizations'] = { id: 'org-abc', slug: 'my-org' };

      // 2. Mock du produit existant
      (globalThis as any).mockDataByTable['products'] = { id: 'product-999', name: 'Saumon Atlantique Frais' };

      // 3. Mock du nombre de quote_items = 0
      (globalThis as any).mockCountsByTable['quote_items'] = 0;

      const result = await deleteProduct('my-org', 'product-999');

      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);

      // Vérifier qu'aucune mise à jour n'a eu lieu
      const productUpdates = (globalThis as any).updates['products'];
      expect(productUpdates).toBeUndefined();

      // Vérifier qu'une suppression physique a été exécutée
      const productDeletes = (globalThis as any).deletes['products'];
      expect(productDeletes).toBeDefined();
      expect(productDeletes).toHaveLength(1);
      expect(productDeletes[0].filters.id).toBe('product-999');

      // Vérifier le log d'audit
      const auditInserts = (globalThis as any).inserts['audit_logs'];
      expect(auditInserts).toBeDefined();
      expect(auditInserts).toHaveLength(1);
      expect(auditInserts[0].action).toBe('product_deleted');
      expect(auditInserts[0].entity_type).toBe('products');
      expect(auditInserts[0].entity_id).toBe('product-999');
      expect(auditInserts[0].metadata).toEqual({ name: 'Saumon Atlantique Frais' });
    });
  });
});
