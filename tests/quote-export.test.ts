/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';

// Setup Mock variables on globalThis for vitest hoisting safety
(globalThis as any).mockDataByTable = {};
(globalThis as any).mockErrorsByTable = {};
(globalThis as any).mockUser = { id: 'mock-user-id', email: 'test@example.com' };

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
  order() { return this; }
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

  private getData() {
    const mockDataByTable = (globalThis as any).mockDataByTable;
    const mocked = mockDataByTable[this.tableName];
    if (typeof mocked === 'function') {
      return mocked(this.filters);
    }
    if (mocked && typeof mocked === 'object' && !Array.isArray(mocked)) {
      if (this.filters.public_token_hash && mocked[this.filters.public_token_hash] !== undefined) {
        return mocked[this.filters.public_token_hash];
      }
      if (this.filters.id && mocked[this.filters.id] !== undefined) {
        return mocked[this.filters.id];
      }
    }
    return mocked;
  }
}

(globalThis as any).mockSupabaseClient = {
  from: (tableName: string) => new MockQueryBuilder(tableName),
  auth: {
    getUser: vi.fn().mockImplementation(() => Promise.resolve({ data: { user: (globalThis as any).mockUser } })),
  },
};

// Mock the Supabase clients
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

// Import the GET handler
import { GET } from '@/app/api/quotes/[id]/xlsx/route';

describe('XLSX Quote Export API Route', () => {
  const token = 'secret-token-123';
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  beforeEach(() => {
    (globalThis as any).mockDataByTable = {};
    (globalThis as any).mockErrorsByTable = {};
    (globalThis as any).mockUser = { id: 'mock-user-id', email: 'test@example.com' };
    vi.clearAllMocks();
  });

  const mockQuote = {
    id: 'quote-123',
    quote_number: 'BM-2026-00001',
    revision: 1,
    title: 'Mon Devis Test',
    issue_date: '2026-06-22',
    expires_at: '2026-07-22',
    organization_id: 'org-123',
    customers: { legal_name: 'Client Test', primary_email: 'client@example.com' },
    contact_name: 'Contact Test',
    contact_email: 'contact@example.com',
    has_complete_quantities: true,
    subtotal: 100,
    tax_total: 6,
    grand_total: 106,
    public_token_hash: tokenHash,
    public_token_expires_at: null,
    public_note: 'Note publique',
    terms: 'Conditions standard',
  };

  const mockItems = [
    {
      position: 1,
      product_snapshot: { name: 'Saumon', internal_sku: 'SAU-001', barcode: null },
      sales_unit: 'kg',
      quantity: 10,
      unit_price: 10,
      discount_rate: 0,
      line_subtotal: 100,
      tax_rate: 0.06,
      landed_cost_snapshot: 7, // Internal field
      target_margin_rate: 0.25, // Internal field
      recommended_price: 9.33, // Internal field
    }
  ];

  async function parseXlsxResponse(res: Response) {
    const buffer = await res.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  }

  describe('Accès Public par Jeton (type=client)', () => {
    test('Retourne les données client-facing excluant les coûts/marges', async () => {
      (globalThis as any).mockDataByTable['quotes'] = { [tokenHash]: mockQuote };
      (globalThis as any).mockDataByTable['quote_items'] = mockItems;

      const req = new NextRequest(`http://localhost/api/quotes/quote-123/xlsx?token=${token}&type=client`);
      const response = await GET(req, { params: Promise.resolve({ id: 'quote-123' }) });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(response.headers.get('Content-Disposition')).toContain('filename="BlueMargin_BM-2026-00001_Client_Test_Rev1.xlsx"');

      const rows = await parseXlsxResponse(response);

      // Verify that no internal information is present
      const csvStr = JSON.stringify(rows).toLowerCase();
      expect(csvStr).not.toContain('landed');
      expect(csvStr).not.toContain('coût');
      expect(csvStr).not.toContain('margin');
      expect(csvStr).not.toContain('marge');
      expect(csvStr).not.toContain('markup');
      expect(csvStr).not.toContain('conseill');
      expect(csvStr).not.toContain('target');
      expect(csvStr).not.toContain('cible');

      // Verify basic columns are present
      expect(csvStr).toContain('saumon');
      expect(csvStr).toContain('sau-001');
    });

    test('Refuse l\'accès internal si token public est fourni', async () => {
      (globalThis as any).mockDataByTable['quotes'] = { [tokenHash]: mockQuote };
      (globalThis as any).mockDataByTable['quote_items'] = mockItems;

      const req = new NextRequest(`http://localhost/api/quotes/quote-123/xlsx?token=${token}&type=internal`);
      const response = await GET(req, { params: Promise.resolve({ id: 'quote-123' }) });

      expect(response.status).toBe(403);
    });
  });

  describe('Accès Utilisateur Authentifié', () => {
    test('Autorise l\'export type=client pour un utilisateur authentifié', async () => {
      (globalThis as any).mockDataByTable['quotes'] = { 'quote-123': mockQuote };
      (globalThis as any).mockDataByTable['quote_items'] = mockItems;
      (globalThis as any).mockDataByTable['organization_memberships'] = { role: 'sales' };
      (globalThis as any).mockDataByTable['organizations'] = { sales_can_view_costs: false };

      const req = new NextRequest(`http://localhost/api/quotes/quote-123/xlsx?type=client`);
      const response = await GET(req, { params: Promise.resolve({ id: 'quote-123' }) });

      expect(response.status).toBe(200);
      const rows = await parseXlsxResponse(response);
      const csvStr = JSON.stringify(rows).toLowerCase();
      expect(csvStr).not.toContain('coût');
      expect(csvStr).not.toContain('marge');
    });

    test('Autorise l\'export type=internal pour un rôle Manager', async () => {
      (globalThis as any).mockDataByTable['quotes'] = { 'quote-123': mockQuote };
      (globalThis as any).mockDataByTable['quote_items'] = mockItems;
      (globalThis as any).mockDataByTable['organization_memberships'] = { role: 'manager' };
      (globalThis as any).mockDataByTable['organizations'] = { sales_can_view_costs: false };

      const req = new NextRequest(`http://localhost/api/quotes/quote-123/xlsx?type=internal`);
      const response = await GET(req, { params: Promise.resolve({ id: 'quote-123' }) });

      expect(response.status).toBe(200);
      const rows = await parseXlsxResponse(response);
      const csvStr = JSON.stringify(rows).toLowerCase();
      expect(csvStr).toContain('coût');
      expect(csvStr).toContain('marge');
    });

    test('Autorise l\'export type=internal pour un rôle Sales si sales_can_view_costs est true', async () => {
      (globalThis as any).mockDataByTable['quotes'] = { 'quote-123': mockQuote };
      (globalThis as any).mockDataByTable['quote_items'] = mockItems;
      (globalThis as any).mockDataByTable['organization_memberships'] = { role: 'sales' };
      (globalThis as any).mockDataByTable['organizations'] = { sales_can_view_costs: true };

      const req = new NextRequest(`http://localhost/api/quotes/quote-123/xlsx?type=internal`);
      const response = await GET(req, { params: Promise.resolve({ id: 'quote-123' }) });

      expect(response.status).toBe(200);
    });

    test('Refuse l\'export type=internal pour un rôle Sales si sales_can_view_costs est false', async () => {
      (globalThis as any).mockDataByTable['quotes'] = { 'quote-123': mockQuote };
      (globalThis as any).mockDataByTable['quote_items'] = mockItems;
      (globalThis as any).mockDataByTable['organization_memberships'] = { role: 'sales' };
      (globalThis as any).mockDataByTable['organizations'] = { sales_can_view_costs: false };

      const req = new NextRequest(`http://localhost/api/quotes/quote-123/xlsx?type=internal`);
      const response = await GET(req, { params: Promise.resolve({ id: 'quote-123' }) });

      expect(response.status).toBe(403);
    });
  });

  describe('Protection contre l\'injection CSV/XLSX', () => {
    test('Échappe les cellules commençant par =, +, - ou @ avec une apostrophe simple', async () => {
      const injectQuote = {
        ...mockQuote,
        title: '=SUM(A1:A10)', // Injection in header title
      };
      const injectItems = [
        {
          position: 1,
          product_snapshot: { name: '+Premium Salmon', internal_sku: '-SKU123', barcode: null },
          sales_unit: '@unit',
          quantity: 1,
          unit_price: 10,
          discount_rate: 0,
          line_subtotal: 10,
          tax_rate: 0.06,
        }
      ];

      (globalThis as any).mockDataByTable['quotes'] = { 'quote-123': injectQuote };
      (globalThis as any).mockDataByTable['quote_items'] = injectItems;
      (globalThis as any).mockDataByTable['organization_memberships'] = { role: 'manager' };
      (globalThis as any).mockDataByTable['organizations'] = { sales_can_view_costs: false };

      const req = new NextRequest(`http://localhost/api/quotes/quote-123/xlsx?type=internal`);
      const response = await GET(req, { params: Promise.resolve({ id: 'quote-123' }) });

      expect(response.status).toBe(200);
      const rows = await parseXlsxResponse(response);
      
      // Let's search for escaped items in the parsed rows
      // Convert all cell values to strings and inspect them
      const flattenedCells = rows.flat().map(c => String(c));
      
      expect(flattenedCells).toContain(`'=SUM(A1:A10)`);
      expect(flattenedCells).toContain(`'+Premium Salmon`);
      expect(flattenedCells).toContain(`'-SKU123`);
      expect(flattenedCells).toContain(`'@unit`);
    });
  });
});
