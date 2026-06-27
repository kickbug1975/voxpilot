/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

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

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select() { return this; }
  eq(col: string, val: any) {
    this.filters[col] = val;
    return this;
  }
  order() { return this; }
  limit() { return this; }
  in(col: string, val: any[]) { return this; }

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
      if (this.filters.public_token_hash && mocked[this.filters.public_token_hash] !== undefined) {
        return mocked[this.filters.public_token_hash];
      }
      if (this.filters.id && mocked[this.filters.id] !== undefined) {
        return mocked[this.filters.id];
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
};

// Mock the Supabase admin client creator
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockImplementation(() => {
    return (globalThis as any).mockSupabaseClient;
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => {
    return (globalThis as any).mockSupabaseClient;
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
        if (key === 'user-agent') return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        if (key === 'x-forwarded-for') return '192.168.1.123, 10.0.0.1';
        return null;
      }
    };
  }),
}));

// Import actions after mocking
import { getPublicQuote, submitPublicDecision } from '../src/actions/publicQuotes';

describe('Public Quotes Server Actions', () => {
  const token = 'my-super-secret-random-token-key-abc';
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  beforeEach(() => {
    (globalThis as any).mockDataByTable = {};
    (globalThis as any).mockErrorsByTable = {};
    (globalThis as any).inserts = {};
    (globalThis as any).updates = {};
    vi.clearAllMocks();
  });

  describe('getPublicQuote', () => {
    test('Retourne une erreur si le jeton est invalide', async () => {
      (globalThis as any).mockDataByTable['quotes'] = null; // Aucun devis trouvé

      const res = await getPublicQuote('wrong-token');
      expect(res.error).toContain('invalide ou expiré');
      expect(res.data).toBeUndefined();
    });

    test('Retourne une erreur si le devis est annulé', async () => {
      (globalThis as any).mockDataByTable['quotes'] = {
        [tokenHash]: {
          id: 'quote-123',
          organization_id: 'org-abc',
          status: 'cancelled',
          public_token_hash: tokenHash,
        }
      };

      const res = await getPublicQuote(token);
      expect(res.error).toContain('annulé');
    });

    test('Retourne une erreur si le devis a expiré', async () => {
      (globalThis as any).mockDataByTable['quotes'] = {
        [tokenHash]: {
          id: 'quote-123',
          organization_id: 'org-abc',
          status: 'sent',
          public_token_hash: tokenHash,
          public_token_expires_at: new Date(Date.now() - 3600000).toISOString(), // Expired 1h ago
        }
      };

      const res = await getPublicQuote(token);
      expect(res.error).toContain('expiré');
    });

    test('Retourne les données sécurisées et passe le statut à "viewed" lors de la première lecture', async () => {
      // Configuration de la DB simulée
      const mockQuote = {
        id: 'quote-123',
        organization_id: 'org-abc',
        status: 'sent',
        public_token_hash: tokenHash,
        public_token_expires_at: new Date(Date.now() + 3600000).toISOString(),
        customers: { legal_name: 'Client Test' }
      };

      (globalThis as any).mockDataByTable['quotes'] = {
        [tokenHash]: mockQuote
      };

      (globalThis as any).mockDataByTable['quote_items'] = [
        { id: 'item-1', position: 1, product_snapshot: { name: 'Saumon' }, unit_price: 15.0 }
      ];

      (globalThis as any).mockDataByTable['organizations'] = {
        name: 'Maison du Saumon',
        phone: '02345678',
      };

      const res = await getPublicQuote(token);
      expect(res.error).toBeUndefined();
      expect(res.data).toBeDefined();
      expect(res.data?.quote.id).toBe('quote-123');
      expect(res.data?.items).toHaveLength(1);
      expect(res.data?.organization.name).toBe('Maison du Saumon');

      // Le statut de l'offre passe à viewed en DB
      expect((globalThis as any).updates['quotes']).toHaveLength(1);
      expect((globalThis as any).updates['quotes'][0].status).toBe('viewed');

      // Un événement de lecture est loggé
      expect((globalThis as any).inserts['quote_events']).toHaveLength(1);
      expect((globalThis as any).inserts['quote_events'][0].event_type).toBe('viewed');
      expect((globalThis as any).inserts['quote_events'][0].actor_type).toBe('customer');
    });
  });

  describe('submitPublicDecision', () => {
    beforeEach(() => {
      (globalThis as any).mockDataByTable['quotes'] = {
        [tokenHash]: {
          id: 'quote-123',
          organization_id: 'org-abc',
          status: 'viewed',
          public_token_expires_at: new Date(Date.now() + 3600000).toISOString(),
        }
      };
    });

    test('Bloque si le nom du signataire est manquant', async () => {
      const res = await submitPublicDecision(token, 'accepted', '', 'Directeur', 'OK');
      expect(res.error).toContain('nom complet est obligatoire');
    });

    test('Bloque si le refus est soumis sans motif/commentaire', async () => {
      const res = await submitPublicDecision(token, 'rejected', 'Dupont', 'Acheteur', '  ');
      expect(res.error).toContain('motif de refus est obligatoire');
    });

    test('Enregistre correctement l\'acceptation avec IP tronquée, UA simplifié et alerte interne', async () => {
      const res = await submitPublicDecision(token, 'accepted', 'Dimitri Dupont', 'Acheteur', 'Consigne livraison');
      expect(res.success).toBe(true);

      // Le devis est mis à jour à accepted en DB
      expect((globalThis as any).updates['quotes']).toHaveLength(1);
      expect((globalThis as any).updates['quotes'][0].status).toBe('accepted');
      expect((globalThis as any).updates['quotes'][0].accepted_at).toBeDefined();

      // Événement d'acceptation consigné
      expect((globalThis as any).inserts['quote_events']).toHaveLength(1);
      const qe = (globalThis as any).inserts['quote_events'][0];
      expect(qe.event_type).toBe('accepted');
      expect(qe.actor_name).toBe('Dimitri Dupont');
      
      // IP et UA normalisés/anonymisés
      expect(qe.metadata.ip).toBe('192.168.1.0');
      expect(qe.metadata.userAgent).toBe('Chrome on Windows');
      expect(qe.metadata.comment).toBe('Consigne livraison');

      // Alerte créée
      expect((globalThis as any).inserts['alerts']).toHaveLength(1);
      expect((globalThis as any).inserts['alerts'][0].type).toBe('quote_accepted');
      expect((globalThis as any).inserts['alerts'][0].priority).toBe('high');
      expect((globalThis as any).inserts['alerts'][0].title).toContain('Dimitri Dupont');
    });
  });
});
