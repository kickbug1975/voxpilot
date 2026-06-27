/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { PricingEngine } from '../src/domain/PricingEngine';

// Setup Mock variables on globalThis for vitest hoisting safety
(globalThis as any).mockDataByTable = {};
(globalThis as any).mockErrorsByTable = {};
(globalThis as any).inserts = {};

class MockQueryBuilder {
  private tableName: string;
  private filters: Record<string, any> = {};

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select() { return this; }

  eq(col: string, val: any) {
    this.filters[col] = val;
    return this;
  }

  is(col: string, val: any) {
    this.filters[col] = val;
    return this;
  }

  in(col: string, val: any[]) {
    this.filters[col] = val;
    return this;
  }

  insert(val: any) {
    const inserts = (globalThis as any).inserts;
    if (!inserts[this.tableName]) inserts[this.tableName] = [];
    const valWithId = { id: val.id || `${this.tableName}-mock-id`, ...val };
    inserts[this.tableName].push(valWithId);
    return this;
  }

  update(_val: any) {
    return this;
  }

  maybeSingle() {
    return this.single();
  }

  single() {
    const mockErrorsByTable = (globalThis as any).mockErrorsByTable;
    const error = mockErrorsByTable[this.tableName];
    
    let data = null;
    if ((globalThis as any).inserts[this.tableName]?.length > 0) {
      data = (globalThis as any).inserts[this.tableName][0];
    } else {
      const mockData = (globalThis as any).mockDataByTable[this.tableName];
      data = Array.isArray(mockData) ? mockData[0] : mockData;
    }
    return Promise.resolve({ data: data || null, error: error || null });
  }

  then(onfulfilled?: (value: { data: any; error: any }) => any) {
    const mockErrorsByTable = (globalThis as any).mockErrorsByTable;
    const error = mockErrorsByTable[this.tableName];
    const data = (globalThis as any).mockDataByTable[this.tableName];
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

// Import the action under test after mocking
import { linkSupplierToProduct } from '../src/actions/products';

describe('Supplier Costs Detail - Server Actions & Pricing integration', () => {
  beforeEach(() => {
    (globalThis as any).mockDataByTable = {};
    (globalThis as any).mockErrorsByTable = {};
    (globalThis as any).inserts = {};
    (globalThis as any).mockSupabaseClient.from = (tableName: string) => new MockQueryBuilder(tableName);
    vi.clearAllMocks();
  });

  test('linkSupplierToProduct should correctly save transport, handling, other fixed and other cost percent', async () => {
    // Mock the organization query
    (globalThis as any).mockDataByTable['organizations'] = { id: 'org-123', slug: 'my-org' };

    const result = await linkSupplierToProduct(
      'my-org',
      'product-id-123',
      'supplier-id-456',
      'box_10kg',
      120.50, // purchase price
      13.50,  // landed cost per sales unit
      'OCEAN-SAUM-12', // SKU
      1.20,  // transport
      0.50,  // handling
      0.30,  // other fixed
      0.05   // other percent (5%)
    );

    expect(result.success).toBe(true);

    const supplierProductInserts = (globalThis as any).inserts['supplier_products'];
    expect(supplierProductInserts).toBeDefined();
    expect(supplierProductInserts).toHaveLength(1);
    expect(supplierProductInserts[0]).toMatchObject({
      organization_id: 'org-123',
      product_id: 'product-id-123',
      supplier_id: 'supplier-id-456',
      purchase_unit: 'box_10kg',
      current_purchase_price: 120.50,
      current_landed_cost: 13.50,
      supplier_sku: 'OCEAN-SAUM-12',
      transport_cost: 1.20,
      handling_cost: 0.50,
      other_fixed_cost: 0.30,
      other_cost_percent: 0.05,
    });
  });

  test('calculateLandedCost calculates landed cost dynamically with transport, handling and other costs', () => {
    const result = PricingEngine.calculateLandedCost({
      purchasePrice: 120.50,
      conversionFactor: 10,
      yieldRate: 0.92,
      transportCostPerSalesUnit: 1.20,
      handlingCostPerSalesUnit: 0.50,
      otherFixedCostPerSalesUnit: 0.30,
      otherCostPercent: 0.05, // 5%
    });

    // baseUnitCost = 120.50 / 10 = 12.05
    // usableUnitCost = 12.05 / 0.92 = 13.097826
    // percentCost = 13.097826 * 0.05 = 0.654891
    // landedCost = 13.097826 + 1.20 + 0.50 + 0.30 + 0.654891 = 15.752717

    expect(result.baseUnitCost.toNumber()).toBeCloseTo(12.05, 4);
    expect(result.usableUnitCost.toNumber()).toBeCloseTo(13.0978, 4);
    expect(result.percentCost.toNumber()).toBeCloseTo(0.6549, 4);
    expect(result.landedCost.toNumber()).toBeCloseTo(15.7527, 4);
  });

  test('confirmImport should fall back to supplier default logistical costs when creating a new supplier product reference', async () => {
    // Mock organizations table query
    (globalThis as any).mockDataByTable['organizations'] = { id: 'org-123', slug: 'my-org' };
    
    // Mock price_imports query (should return a supplier with default costs)
    (globalThis as any).mockDataByTable['price_imports'] = {
      id: 'import-abc',
      supplier_id: 'supplier-xyz',
      suppliers: {
        name: 'OceanNord Import',
        default_transport_cost: '0.80',
        default_handling_cost: '0.40',
        default_other_fixed_cost: '0.20',
        default_other_cost_percent: '0.03' // 3%
      }
    };

    // Mock price_import_rows query
    (globalThis as any).mockDataByTable['price_import_rows'] = [
      {
        id: 'row-1',
        row_number: 1,
        validation_status: 'valid',
        match_status: 'create_new', // will trigger insert product + insert new supplier_product
        matched_product_id: null,
        label: 'Nouveau Saumon',
        purchase_price: 100.0,
        conversion_factor: 10.0, // base cost = 10.0
        yield_rate: 1.0,
        purchase_unit: 'box_10kg'
      }
    ];

    // Mock product creation
    (globalThis as any).mockDataByTable['products'] = { id: 'new-product-id' };

    // Mock existing supplier product lookup: should return null to simulate creation
    (globalThis as any).mockDataByTable['supplier_products'] = null;

    // Call confirmImport
    const { confirmImport } = await import('../src/actions/imports');
    const res = await confirmImport('my-org', 'import-abc');
    expect(res.success).toBe(true);

    // Verify that the insert query for supplier_products was called with default supplier costs
    const supplierProductInserts = (globalThis as any).inserts['supplier_products'];
    expect(supplierProductInserts).toBeDefined();
    expect(supplierProductInserts).toHaveLength(1);
    
    expect(supplierProductInserts[0].transport_cost).toBe(0.80);
    expect(supplierProductInserts[0].handling_cost).toBe(0.40);
    expect(supplierProductInserts[0].other_fixed_cost).toBe(0.20);
    expect(supplierProductInserts[0].other_cost_percent).toBe(0.03);

    // base unit cost = 10.0
    // transport = 0.8, handling = 0.4, other_fixed = 0.2, other_percent = 3% of 10.0 (0.3)
    // landed cost = 10.0 + 0.8 + 0.4 + 0.2 + 0.3 = 11.7
    expect(supplierProductInserts[0].current_landed_cost).toBeCloseTo(11.7, 4);
  });

  test('applySupplierDefaultsToProducts should update all associated products with supplier defaults', async () => {
    // 1. Mock organizations query
    (globalThis as any).mockDataByTable['organizations'] = { id: 'org-123', slug: 'my-org' };

    // 2. Mock suppliers query returning defaults
    (globalThis as any).mockDataByTable['suppliers'] = {
      id: 'supplier-xyz',
      default_transport_cost: '1.50',
      default_handling_cost: '0.60',
      default_other_fixed_cost: '0.40',
      default_other_cost_percent: '0.05' // 5%
    };

    // 3. Mock associated supplier products query
    (globalThis as any).mockDataByTable['supplier_products'] = [
      {
        id: 'sp-1',
        current_purchase_price: '100.00',
        conversion_factor: '10.0', // base unit cost = 10.0
        yield_rate: '1.0',
        transport_cost: '0.0',
        handling_cost: '0.0',
        other_fixed_cost: '0.0',
        other_cost_percent: '0.0',
        current_landed_cost: '10.0'
      },
      {
        id: 'sp-2',
        current_purchase_price: '50.00',
        conversion_factor: '5.0', // base unit cost = 10.0
        yield_rate: '0.8', // usable unit cost = 10.0 / 0.8 = 12.50
        transport_cost: '0.0',
        handling_cost: '0.0',
        other_fixed_cost: '0.0',
        other_cost_percent: '0.0',
        current_landed_cost: '12.5'
      }
    ];

    // Mock supabase update calls
    const mockUpdates: any[] = [];
    (globalThis as any).mockSupabaseClient.from = (tableName: string) => {
      const builder = new MockQueryBuilder(tableName);
      if (tableName === 'supplier_products') {
        builder.update = (val: any) => {
          mockUpdates.push(val);
          return builder;
        };
      }
      return builder;
    };

    const { applySupplierDefaultsToProducts } = await import('../src/actions/suppliers');
    const result = await applySupplierDefaultsToProducts('my-org', 'supplier-xyz');
    expect(result.success).toBe(true);
    expect(result.count).toBe(2);

    expect(mockUpdates).toHaveLength(2);
    
    // Check first update
    // base unit cost = 10.00
    // transport = 1.50, handling = 0.60, other_fixed = 0.40, other_cost_percent = 5% of 10.0 = 0.50
    // landed cost = 10.0 + 1.5 + 0.6 + 0.4 + 0.5 = 13.0
    expect(mockUpdates[0]).toEqual({
      transport_cost: 1.50,
      handling_cost: 0.60,
      other_fixed_cost: 0.40,
      other_cost_percent: 0.05,
      current_landed_cost: 13.0,
    });

    // Check second update
    // usable unit cost = 12.50
    // transport = 1.50, handling = 0.60, other_fixed = 0.40, other_cost_percent = 5% of 12.5 = 0.625
    // landed cost = 12.5 + 1.5 + 0.6 + 0.4 + 0.625 = 15.625
    expect(mockUpdates[1]).toEqual({
      transport_cost: 1.50,
      handling_cost: 0.60,
      other_fixed_cost: 0.40,
      other_cost_percent: 0.05,
      current_landed_cost: 15.625,
    });
  });

  test('applySupplierDefaultsToProducts should update all associated products with supplier defaults AND bulk update categories if default_category_id is set', async () => {
    // 1. Mock organizations query
    (globalThis as any).mockDataByTable['organizations'] = { id: 'org-123', slug: 'my-org' };

    // 2. Mock suppliers query returning defaults AND a category
    (globalThis as any).mockDataByTable['suppliers'] = {
      id: 'supplier-xyz',
      default_transport_cost: '1.50',
      default_handling_cost: '0.60',
      default_other_fixed_cost: '0.40',
      default_other_cost_percent: '0.05', // 5%
      default_category_id: 'cat-999'
    };

    // 3. Mock associated supplier products query
    (globalThis as any).mockDataByTable['supplier_products'] = [
      {
        id: 'sp-1',
        product_id: 'prod-1',
        current_purchase_price: '100.00',
        conversion_factor: '10.0', // base unit cost = 10.0
        yield_rate: '1.0',
        transport_cost: '0.0',
        handling_cost: '0.0',
        other_fixed_cost: '0.0',
        other_cost_percent: '0.0',
        current_landed_cost: '10.0'
      }
    ];

    // Mock supabase update calls
    const mockUpdates: Record<string, any[]> = { supplier_products: [], products: [] };
    (globalThis as any).mockSupabaseClient.from = (tableName: string) => {
      const builder = new MockQueryBuilder(tableName);
      builder.update = (val: any) => {
        if (!mockUpdates[tableName]) mockUpdates[tableName] = [];
        mockUpdates[tableName].push(val);
        return builder;
      };
      return builder;
    };

    const { applySupplierDefaultsToProducts } = await import('../src/actions/suppliers');
    const result = await applySupplierDefaultsToProducts('my-org', 'supplier-xyz');
    expect(result.success).toBe(true);
    expect(result.count).toBe(1);

    expect(mockUpdates['supplier_products']).toHaveLength(1);
    expect(mockUpdates['products']).toHaveLength(1);
    
    // Check product category bulk update
    expect(mockUpdates['products'][0]).toEqual({
      category_id: 'cat-999'
    });

    // Check supplier product costs update
    expect(mockUpdates['supplier_products'][0]).toEqual({
      transport_cost: 1.50,
      handling_cost: 0.60,
      other_fixed_cost: 0.40,
      other_cost_percent: 0.05,
      current_landed_cost: 13.0,
    });
  });

  test('confirmImport should handle duplicate supplier_sku rows gracefully without violating unique constraints', async () => {
    // Mock organizations table query
    (globalThis as any).mockDataByTable['organizations'] = { id: 'org-123', slug: 'my-org' };
    
    // Mock price_imports query
    (globalThis as any).mockDataByTable['price_imports'] = {
      id: 'import-abc',
      supplier_id: 'supplier-xyz',
      suppliers: {
        name: 'OceanNord Import',
        default_transport_cost: '0.80',
        default_handling_cost: '0.40',
        default_other_fixed_cost: '0.20',
        default_other_cost_percent: '0.03'
      }
    };

    // Mock price_import_rows query with duplicate supplier_sku
    (globalThis as any).mockDataByTable['price_import_rows'] = [
      {
        id: 'row-1',
        row_number: 1,
        validation_status: 'valid',
        match_status: 'create_new',
        matched_product_id: null,
        label: 'Product A',
        supplier_sku: 'DUP-SKU-123',
        purchase_price: 100.0,
        conversion_factor: 10.0,
        yield_rate: 1.0,
        purchase_unit: 'box_10kg'
      },
      {
        id: 'row-2',
        row_number: 2,
        validation_status: 'valid',
        match_status: 'create_new',
        matched_product_id: null,
        label: 'Product A (duplicate description)',
        supplier_sku: 'DUP-SKU-123',
        purchase_price: 100.0,
        conversion_factor: 10.0,
        yield_rate: 1.0,
        purchase_unit: 'box_10kg'
      }
    ];

    // Mock product creation / selection
    const mockCreatedProducts: any[] = [];
    const mockCreatedSupplierProducts: any[] = [];

    // Reset query builder mock specifically for this test
    (globalThis as any).mockSupabaseClient.from = (tableName: string) => {
      const builder = new MockQueryBuilder(tableName);
      
      builder.insert = (val: any) => {
        if (tableName === 'products') {
          const newProd = { id: `new-product-${mockCreatedProducts.length + 1}`, ...val };
          mockCreatedProducts.push(newProd);
          
          // Setup mockDataByTable['products'] or single/maybeSingle result
          // so subsequent queries find it
          (globalThis as any).mockDataByTable['products'] = newProd;
          return {
            select: () => ({
              single: () => Promise.resolve({ data: newProd, error: null })
            })
          } as any;
        }
        
        if (tableName === 'supplier_products') {
          const newSp = { id: `new-sp-${mockCreatedSupplierProducts.length + 1}`, ...val };
          mockCreatedSupplierProducts.push(newSp);
          
          // Setup mockDataByTable['supplier_products'] or single/maybeSingle result
          // so subsequent queries find it
          (globalThis as any).mockDataByTable['supplier_products'] = newSp;
          return {
            select: () => ({
              single: () => Promise.resolve({ data: newSp, error: null })
            })
          } as any;
        }
        
        return builder;
      };

      // Mock update to just return builder
      builder.update = (_val: any) => {
        return builder;
      };

      // Mock queries
      builder.single = () => {
        if (tableName === 'products') {
          const lastProd = mockCreatedProducts[mockCreatedProducts.length - 1];
          return Promise.resolve({ data: lastProd || null, error: null });
        }
        if (tableName === 'supplier_products') {
          const lastSp = mockCreatedSupplierProducts[mockCreatedSupplierProducts.length - 1];
          return Promise.resolve({ data: lastSp || null, error: null });
        }
        // Fallback
        const data = (globalThis as any).mockDataByTable[tableName];
        return Promise.resolve({ data: data || null, error: null });
      };

      builder.maybeSingle = () => {
        if (tableName === 'products') {
          // Find if we already mock-inserted a product with internal_sku 'DUP-SKU-123'
          const foundProd = mockCreatedProducts.find(p => p.internal_sku === 'DUP-SKU-123');
          return Promise.resolve({ data: foundProd || null, error: null });
        }
        if (tableName === 'supplier_products') {
          const foundSp = mockCreatedSupplierProducts.find(sp => sp.supplier_sku === 'DUP-SKU-123');
          return Promise.resolve({ data: foundSp || null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      };

      return builder;
    };

    // Call confirmImport
    const { confirmImport } = await import('../src/actions/imports');
    const res = await confirmImport('my-org', 'import-abc');
    expect(res.success).toBe(true);

    // Verify that we only created 1 product because of the duplicate safety checks
    expect(mockCreatedProducts).toHaveLength(1);
    
    // Verify that the supplier product reference was created once and mapped to that product
    expect(mockCreatedSupplierProducts).toHaveLength(1);
    expect(mockCreatedSupplierProducts[0].product_id).toBe('new-product-1');
  });
});
