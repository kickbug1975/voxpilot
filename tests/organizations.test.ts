/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, vi, beforeEach } from 'vitest';

// Setup Mock variables on globalThis for vitest hoisting safety
(globalThis as any).mockDataByTable = {};
(globalThis as any).mockErrorsByTable = {};
(globalThis as any).inserts = {};
(globalThis as any).updates = {};
(globalThis as any).mockUser = { id: 'user-id-123', email: 'test@example.com' };

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
  maybeSingle() { return this.single(); }

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

  single() {
    const data = this.getData();
    const mockErrorsByTable = (globalThis as any).mockErrorsByTable;
    const error = mockErrorsByTable[this.tableName];
    
    // For single, return the mock object directly or the first item
    const singleData = Array.isArray(data) ? data[0] : data;
    return Promise.resolve({ data: singleData || null, error: error || null });
  }

  private getData() {
    if (this.isInsert) {
      return { id: 'inserted-uuid-xyz', slug: this.insertedData.slug, ...this.insertedData };
    }
    const mockDataByTable = (globalThis as any).mockDataByTable;
    const mocked = mockDataByTable[this.tableName];
    if (typeof mocked === 'function') {
      return mocked(this.filters);
    }
    if (mocked && typeof mocked === 'object' && !Array.isArray(mocked)) {
      if (this.filters.slug && mocked[this.filters.slug] !== undefined) {
        return mocked[this.filters.slug];
      }
    }
    return mocked;
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

// Mock the Supabase client creator
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

import { createOrganizationAction } from '../src/actions/organizations';

describe('Organizations Server Action', () => {
  beforeEach(() => {
    (globalThis as any).mockDataByTable = {};
    (globalThis as any).mockErrorsByTable = {};
    (globalThis as any).inserts = {};
    (globalThis as any).updates = {};
    (globalThis as any).mockUser = { id: 'user-id-123', email: 'test@example.com' };
    vi.clearAllMocks();
  });

  test('Creates organization, membership and profile update successfully', async () => {
    const formData = new FormData();
    formData.append('name', 'Ma Poissonnerie Géniale');
    formData.append('slug', 'ma-poissonnerie-geniale');

    const result = await createOrganizationAction(null, formData);

    expect(result.success).toBe(true);
    expect(result.slug).toBe('ma-poissonnerie-geniale');

    // Verify organization insert
    const insertedOrgs = (globalThis as any).inserts['organizations'];
    expect(insertedOrgs.length).toBe(1);
    expect(insertedOrgs[0].name).toBe('Ma Poissonnerie Géniale');
    expect(insertedOrgs[0].slug).toBe('ma-poissonnerie-geniale');
    expect(insertedOrgs[0].created_by).toBe('user-id-123');

    // Verify membership insert
    const insertedMemberships = (globalThis as any).inserts['organization_memberships'];
    expect(insertedMemberships.length).toBe(1);
    expect(insertedMemberships[0].role).toBe('owner');
    expect(insertedMemberships[0].status).toBe('active');
    expect(insertedMemberships[0].user_id).toBe('user-id-123');

    // Verify profile update
    const updatedProfiles = (globalThis as any).updates['profiles'];
    expect(updatedProfiles.length).toBe(1);
    expect(updatedProfiles[0].last_active_organization_id).toBe('inserted-uuid-xyz');
  });

  test('Rejects if name or slug is missing', async () => {
    const formData = new FormData();
    formData.append('name', '');
    formData.append('slug', 'test-slug');

    const result = await createOrganizationAction(null, formData);
    expect(result.error).toContain('obligatoires');
  });

  test('Formats slug properly to lowercase and removes invalid characters', async () => {
    const formData = new FormData();
    formData.append('name', 'New Org');
    formData.append('slug', '  New Org!  ');

    const result = await createOrganizationAction(null, formData);

    expect(result.success).toBe(true);
    expect(result.slug).toBe('new-org');

    const insertedOrgs = (globalThis as any).inserts['organizations'];
    expect(insertedOrgs[0].slug).toBe('new-org');
  });

  test('Rejects if slug is already taken', async () => {
    // Mock existing organization with the target slug
    (globalThis as any).mockDataByTable['organizations'] = {
      'taken-slug': { id: 'existing-id', name: 'Existing Org', slug: 'taken-slug' }
    };

    const formData = new FormData();
    formData.append('name', 'Another Org');
    formData.append('slug', 'taken-slug');

    const result = await createOrganizationAction(null, formData);
    expect(result.error).toContain('déjà utilisé');
  });

  test('Rejects if user is not authenticated', async () => {
    (globalThis as any).mockUser = null;

    const formData = new FormData();
    formData.append('name', 'Org');
    formData.append('slug', 'slug');

    const result = await createOrganizationAction(null, formData);
    expect(result.error).toContain('connecté');
  });
});
