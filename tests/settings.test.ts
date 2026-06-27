/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

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
  in(col: string, val: any) {
    this.filters[col] = val;
    return this;
  }
  order() { return this; }
  limit() { return this; }
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

  delete() {
    const updates = (globalThis as any).updates;
    if (!updates[this.tableName]) updates[this.tableName] = [];
    updates[this.tableName].push({ deleted: true, filters: this.filters });
    return this;
  }

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
      if (this.filters.token_hash && mocked[this.filters.token_hash] !== undefined) {
        return mocked[this.filters.token_hash];
      }
      if (this.filters.id && mocked[this.filters.id] !== undefined) {
        return mocked[this.filters.id];
      }
      if (this.filters.slug && mocked[this.filters.slug] !== undefined) {
        return mocked[this.filters.slug];
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

// Mock the Supabase client creators
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => {
    return (globalThis as any).mockSupabaseClient;
  }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockImplementation(() => {
    const client = { ...(globalThis as any).mockSupabaseClient };
    client.auth = {
      admin: {
        getUserByEmail: vi.fn().mockImplementation((email: string) => {
          if (email === 'exists@member.com') {
            return Promise.resolve({ data: { user: { id: 'exists-user-id', email } } });
          }
          return Promise.resolve({ data: { user: null } });
        }),
        listUsers: vi.fn().mockImplementation(() => {
          return Promise.resolve({
            data: {
              users: [
                { id: 'user-admin', email: 'admin@example.com' },
                { id: 'user-sales', email: 'sales@example.com' },
                { id: 'user-owner', email: 'owner@example.com' }
              ]
            }
          });
        })
      }
    };
    return client;
  }),
}));

// Mock next/cache revalidatePath
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Mock next/headers
vi.mock('next/headers', () => ({
  headers: vi.fn().mockImplementation(async () => {
    return {
      get: (key: string) => {
        if (key === 'user-agent') return 'Mozilla/5.0 Chrome/120.0.0.0';
        if (key === 'x-forwarded-for') return '192.168.1.10';
        return null;
      }
    };
  }),
}));

// Import settings actions
import { 
  updateOrgSettings, 
  inviteTeamMember, 
  resendInvitation, 
  revokeInvitation, 
  updateMemberRole, 
  updateMemberStatus,
  acceptInvitation
} from '../src/actions/settings';

describe('Settings Server Actions', () => {
  beforeEach(() => {
    (globalThis as any).mockDataByTable = {};
    (globalThis as any).mockErrorsByTable = {};
    (globalThis as any).inserts = {};
    (globalThis as any).updates = {};
    (globalThis as any).mockUser = { id: 'user-admin', email: 'admin@example.com' };
    vi.clearAllMocks();
  });

  describe('updateOrgSettings', () => {
    test('Autorise la mise à jour pour les administrateurs et propriétaires', async () => {
      // Mock organization slug lookup
      (globalThis as any).mockDataByTable['organizations'] = {
        id: 'org-123',
        name: 'Demo Org',
        slug: 'demo-org'
      };

      // Mock user role is admin
      (globalThis as any).mockDataByTable['organization_memberships'] = (filters: any) => {
        if (filters.user_id === 'user-admin') {
          return { organization_id: 'org-123', user_id: 'user-admin', role: 'admin', status: 'active' };
        }
        return null;
      };

      const payload = {
        name: 'Nouveau Nom Org',
        vat_number: 'BE 0999.888.777',
        phone: '+32 2 999 88 77',
        commercial_email: 'nouveau@entreprise.be',
        timezone: 'Europe/Paris',
        default_margin_rate: 0.25,
        default_rounding_rule: 'up_0_10',
        default_quote_validity_days: 30,
        cost_increase_alert_rate: 0.08,
        sales_can_view_costs: false,
        sales_can_override_floor: true
      };

      const res = await updateOrgSettings('demo-org', payload);
      expect(res.success).toBe(true);
      
      // Verify organization was updated in database
      const updates = (globalThis as any).updates['organizations'];
      expect(updates).toBeDefined();
      expect(updates[0].name).toBe('Nouveau Nom Org');
      expect(updates[0].default_margin_rate).toBe(0.25);
      expect(updates[0].sales_can_view_costs).toBe(false);

      // Verify audit log was written
      const auditInserts = (globalThis as any).inserts['audit_logs'];
      expect(auditInserts).toBeDefined();
      expect(auditInserts[0].action).toBe('update_settings');
      expect(auditInserts[0].ip_prefix).toBe('192.168.1.0');
    });

    test('Bloque la mise à jour pour les rôles commerciaux (sales)', async () => {
      (globalThis as any).mockDataByTable['organizations'] = { id: 'org-123', slug: 'demo-org' };
      
      // Current user is sales
      (globalThis as any).mockUser = { id: 'user-sales', email: 'sales@example.com' };
      (globalThis as any).mockDataByTable['organization_memberships'] = {
        organization_id: 'org-123',
        user_id: 'user-sales',
        role: 'sales',
        status: 'active'
      };

      const payload = {
        name: 'Essai modif commercial',
        vat_number: null,
        phone: null,
        commercial_email: null,
        timezone: 'UTC',
        default_margin_rate: 0.20,
        default_rounding_rule: 'up_0_05',
        default_quote_validity_days: 14,
        cost_increase_alert_rate: 0.05,
        sales_can_view_costs: true,
        sales_can_override_floor: false
      };

      const res = await updateOrgSettings('demo-org', payload);
      expect(res.error).toContain('Action non autorisée');
    });
  });

  describe('inviteTeamMember', () => {
    test('Permet d\'inviter un nouveau collaborateur', async () => {
      (globalThis as any).mockDataByTable['organizations'] = { id: 'org-123', slug: 'demo-org', name: 'Demo Org' };
      
      (globalThis as any).mockDataByTable['organization_memberships'] = {
        organization_id: 'org-123',
        user_id: 'user-admin',
        role: 'admin',
        status: 'active'
      };

      const res = await inviteTeamMember('demo-org', 'nouveau@collab.com', 'sales');
      expect(res.success).toBe(true);
      expect(res.token).toBeDefined();

      // Verify DB inserts
      const inviteInserts = (globalThis as any).inserts['organization_invitations'];
      expect(inviteInserts).toBeDefined();
      expect(inviteInserts[0].email).toBe('nouveau@collab.com');
      expect(inviteInserts[0].role).toBe('sales');

      // Verify email simulation
      const emailInserts = (globalThis as any).inserts['email_messages'];
      expect(emailInserts).toBeDefined();
      expect(emailInserts[0].to_emails).toContain('nouveau@collab.com');
      expect(emailInserts[0].provider_message_id).toBe(res.token); // token returned
    });
  });

  describe('resendInvitation', () => {
    test('Prolonge la validité de l\'invitation', async () => {
      (globalThis as any).mockDataByTable['organizations'] = { id: 'org-123', slug: 'demo-org' };
      (globalThis as any).mockDataByTable['organization_memberships'] = {
        organization_id: 'org-123',
        user_id: 'user-admin',
        role: 'admin',
        status: 'active'
      };

      (globalThis as any).mockDataByTable['organization_invitations'] = {
        id: 'invite-111',
        organization_id: 'org-123',
        email: 'collab@attente.com',
        role: 'manager',
        accepted_at: null,
        expires_at: new Date(Date.now() - 3600).toISOString() // expired
      };

      const res = await resendInvitation('demo-org', 'invite-111');
      expect(res.success).toBe(true);
      expect(res.token).toBeDefined();

      const inviteUpdates = (globalThis as any).updates['organization_invitations'];
      expect(inviteUpdates).toBeDefined();
      expect(new Date(inviteUpdates[0].expires_at).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('revokeInvitation', () => {
    test('Supprime l\'invitation de la base', async () => {
      (globalThis as any).mockDataByTable['organizations'] = { id: 'org-123', slug: 'demo-org' };
      (globalThis as any).mockDataByTable['organization_memberships'] = {
        organization_id: 'org-123',
        user_id: 'user-admin',
        role: 'admin',
        status: 'active'
      };

      (globalThis as any).mockDataByTable['organization_invitations'] = {
        id: 'invite-111',
        organization_id: 'org-123',
        email: 'delete@invite.com'
      };

      const res = await revokeInvitation('demo-org', 'invite-111');
      expect(res.success).toBe(true);

      const deletes = (globalThis as any).updates['organization_invitations'];
      expect(deletes).toBeDefined();
      expect(deletes[0].deleted).toBe(true);
    });
  });

  describe('updateMemberRole', () => {
    test('Modifie le rôle d\'un autre membre', async () => {
      (globalThis as any).mockDataByTable['organizations'] = { id: 'org-123', slug: 'demo-org' };
      
      // Mock user is owner
      (globalThis as any).mockUser = { id: 'user-owner', email: 'owner@example.com' };
      (globalThis as any).mockDataByTable['organization_memberships'] = (filters: any) => {
        if (filters.user_id === 'user-owner') {
          return { organization_id: 'org-123', user_id: 'user-owner', role: 'owner', status: 'active' };
        }
        if (filters.user_id === 'user-target') {
          return { organization_id: 'org-123', user_id: 'user-target', role: 'sales', status: 'active' };
        }
        return null;
      };

      const res = await updateMemberRole('demo-org', 'user-target', 'manager');
      expect(res.success).toBe(true);

      const updates = (globalThis as any).updates['organization_memberships'];
      expect(updates).toBeDefined();
      expect(updates[0].role).toBe('manager');
    });

    test('Bloque la modification de son propre rôle', async () => {
      (globalThis as any).mockDataByTable['organizations'] = { id: 'org-123', slug: 'demo-org' };
      
      // Modify target role of self
      (globalThis as any).mockUser = { id: 'user-admin', email: 'admin@example.com' };
      (globalThis as any).mockDataByTable['organization_memberships'] = {
        organization_id: 'org-123',
        user_id: 'user-admin',
        role: 'admin',
        status: 'active'
      };

      const res = await updateMemberRole('demo-org', 'user-admin', 'sales');
      expect(res.error).toContain('propre rôle');
    });
  });

  describe('updateMemberStatus', () => {
    test('Active ou désactive un membre', async () => {
      (globalThis as any).mockDataByTable['organizations'] = { id: 'org-123', slug: 'demo-org' };
      
      (globalThis as any).mockDataByTable['organization_memberships'] = (filters: any) => {
        if (filters.user_id === 'user-admin') {
          return { organization_id: 'org-123', user_id: 'user-admin', role: 'admin', status: 'active' };
        }
        if (filters.user_id === 'user-target') {
          return { organization_id: 'org-123', user_id: 'user-target', role: 'sales', status: 'active' };
        }
        return null;
      };

      const res = await updateMemberStatus('demo-org', 'user-target', 'disabled');
      expect(res.success).toBe(true);

      const updates = (globalThis as any).updates['organization_memberships'];
      expect(updates).toBeDefined();
      expect(updates[0].status).toBe('disabled');
    });
  });

  describe('acceptInvitation', () => {
    test('Associe l\'utilisateur connecté à l\'organisation invitante', async () => {
      const inviteToken = 'invite-token-xyz';
      const hash = crypto.createHash('sha256').update(inviteToken).digest('hex');

      // Setup invitation in simulated DB
      (globalThis as any).mockDataByTable['organization_invitations'] = {
        [hash]: {
          id: 'invite-123',
          organization_id: 'org-inviter',
          email: 'newbie@example.com',
          role: 'sales',
          token_hash: hash,
          expires_at: new Date(Date.now() + 3600000).toISOString(),
          accepted_at: null
        }
      };

      // Mock user is logged in newbie
      (globalThis as any).mockUser = { id: 'user-newbie', email: 'newbie@example.com' };
      
      // Mock that newbie is NOT already a member
      (globalThis as any).mockDataByTable['organization_memberships'] = null;

      // Mock organization slug lookup
      (globalThis as any).mockDataByTable['organizations'] = {
        id: 'org-inviter',
        slug: 'invited-org-slug'
      };

      const res = await acceptInvitation(inviteToken);
      expect(res.success).toBe(true);
      expect(res.redirectSlug).toBe('invited-org-slug');

      // Verify newbie was joined in organization_memberships
      const joins = (globalThis as any).inserts['organization_memberships'];
      expect(joins).toBeDefined();
      expect(joins[0].organization_id).toBe('org-inviter');
      expect(joins[0].user_id).toBe('user-newbie');
      expect(joins[0].role).toBe('sales');

      // Verify invitation was marked as accepted
      const inviteUpdates = (globalThis as any).updates['organization_invitations'];
      expect(inviteUpdates).toBeDefined();
      expect(inviteUpdates[0].accepted_at).toBeDefined();

      // Verify profile was updated with last_active_organization_id
      const profileUpdates = (globalThis as any).updates['profiles'];
      expect(profileUpdates).toBeDefined();
      expect(profileUpdates[0].last_active_organization_id).toBe('org-inviter');
    });
  });
});
