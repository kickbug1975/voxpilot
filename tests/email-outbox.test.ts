/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, vi, beforeEach } from 'vitest';

// Setup Mock variables on globalThis for vitest hoisting safety
(globalThis as any).mockDataByTable = {};
(globalThis as any).mockErrorsByTable = {};
(globalThis as any).inserts = {};
(globalThis as any).updates = {};
(globalThis as any).mockUser = { id: 'mock-user-id', email: 'test@example.com' };

class MockQueryBuilder {
  private tableName: string;
  private isInsert = false;
  private insertedData: any = null;
  private filters: Record<string, any> = {};

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select() { return this; }
  eq(col: string, val: any) {
    this.filters[col] = val;
    return this;
  }
  like() { return this; }
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
      return mocked(this.filters);
    }
    if (mocked && typeof mocked === 'object' && !Array.isArray(mocked)) {
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
    getUser: vi.fn().mockImplementation(() => Promise.resolve({ data: { user: (globalThis as any).mockUser } })),
  },
};

// Mock next/headers
vi.mock('next/headers', () => ({
  headers: vi.fn().mockImplementation(async () => {
    const headersMap = new Map<string, string>();
    headersMap.set('x-forwarded-for', '127.0.0.1');
    headersMap.set('user-agent', 'vitest');
    return headersMap;
  }),
}));

// Mock next/cache revalidatePath
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Mock Supabase server client creator
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

import { lockAndSendQuote } from '../src/actions/quotes';

describe('Email Outbox & lockAndSendQuote Simulation Tests', () => {
  beforeEach(() => {
    (globalThis as any).mockDataByTable = {};
    (globalThis as any).mockErrorsByTable = {};
    (globalThis as any).inserts = {};
    (globalThis as any).updates = {};
    (globalThis as any).mockUser = { id: 'mock-user-id', email: 'test@example.com' };
    vi.clearAllMocks();
  });

  test('lockAndSendQuote inserts a simulated email in email_messages using quote contact_email', async () => {
    (globalThis as any).mockDataByTable['organizations'] = { id: 'org-123' };
    (globalThis as any).mockDataByTable['quotes'] = {
      status: 'draft',
      expires_at: '2026-07-22',
      quote_number: 'BM-2026-12345',
      contact_email: 'contact-quote@example.com',
      customers: { primary_email: 'customer@example.com' }
    };

    const res = await lockAndSendQuote('my-org', 'quote-abc');
    expect(res.success).toBe(true);
    expect(res.token).toBeDefined();

    // Verify quote lock updates
    expect((globalThis as any).updates['quotes']).toHaveLength(1);
    expect((globalThis as any).updates['quotes'][0].status).toBe('sent');

    // Verify email simulation insert
    const emailInserts = (globalThis as any).inserts['email_messages'];
    expect(emailInserts).toBeDefined();
    expect(emailInserts).toHaveLength(1);
    expect(emailInserts[0].organization_id).toBe('org-123');
    expect(emailInserts[0].quote_id).toBe('quote-abc');
    expect(emailInserts[0].to_emails).toEqual(['contact-quote@example.com']);
    expect(emailInserts[0].subject).toBe('Offre commerciale BM-2026-12345 sur BlueMargin');
    expect(emailInserts[0].status).toBe('logged');
    expect(emailInserts[0].provider).toBe('console');
    expect(emailInserts[0].provider_message_id).toBe(res.token);
    expect(emailInserts[0].sent_by).toBe('mock-user-id');
    expect(emailInserts[0].sent_at).toBeDefined();
  });

  test('lockAndSendQuote falls back to customer primary_email when quote contact_email is empty', async () => {
    (globalThis as any).mockDataByTable['organizations'] = { id: 'org-123' };
    (globalThis as any).mockDataByTable['quotes'] = {
      status: 'draft',
      expires_at: '2026-07-22',
      quote_number: 'BM-2026-99999',
      contact_email: null,
      customers: { primary_email: 'customer@example.com' }
    };

    const res = await lockAndSendQuote('my-org', 'quote-def');
    expect(res.success).toBe(true);
    expect(res.token).toBeDefined();

    // Verify email simulation insert has customer's primary email
    const emailInserts = (globalThis as any).inserts['email_messages'];
    expect(emailInserts).toBeDefined();
    expect(emailInserts).toHaveLength(1);
    expect(emailInserts[0].to_emails).toEqual(['customer@example.com']);
    expect(emailInserts[0].quote_id).toBe('quote-def');
  });

  test('lockAndSendQuote inserts empty to_emails array if no email is configured anywhere', async () => {
    (globalThis as any).mockDataByTable['organizations'] = { id: 'org-123' };
    (globalThis as any).mockDataByTable['quotes'] = {
      status: 'draft',
      expires_at: '2026-07-22',
      quote_number: 'BM-2026-00000',
      contact_email: null,
      customers: null
    };

    const res = await lockAndSendQuote('my-org', 'quote-empty');
    expect(res.success).toBe(true);
    expect(res.token).toBeDefined();

    // Verify email simulation insert has empty to_emails array
    const emailInserts = (globalThis as any).inserts['email_messages'];
    expect(emailInserts).toBeDefined();
    expect(emailInserts).toHaveLength(1);
    expect(emailInserts[0].to_emails).toEqual([]);
  });
});
