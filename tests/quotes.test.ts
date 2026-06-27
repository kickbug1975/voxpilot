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

// Mock the Supabase server client creator
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

// Import actions after mocking
import {
  createQuote,
  saveQuoteItems,
  lockAndSendQuote,
  reviseQuote,
  duplicateQuote,
} from '../src/actions/quotes';

describe('Quotes Server Actions', () => {
  beforeEach(() => {
    (globalThis as any).mockDataByTable = {};
    (globalThis as any).mockErrorsByTable = {};
    (globalThis as any).inserts = {};
    (globalThis as any).updates = {};
    (globalThis as any).mockUser = { id: 'mock-user-id', email: 'test@example.com' };
    vi.clearAllMocks();
  });

  describe('createQuote', () => {
    test('Crée le premier devis de l\'année avec la séquence 00001', async () => {
      (globalThis as any).mockDataByTable['organizations'] = { id: 'org-123', default_margin_rate: '0.20' };
      (globalThis as any).mockDataByTable['quotes'] = []; // Aucun devis existant pour l'année

      const res = await createQuote('my-org', 'cust-456', 'Mon Devis Test');
      expect(res.success).toBe(true);
      expect(res.quoteId).toBe('inserted-id');
      
      expect((globalThis as any).inserts['quotes']).toBeDefined();
      expect((globalThis as any).inserts['quotes'][0].quote_number).toMatch(/BM-\d{4}-00001/);
      expect((globalThis as any).inserts['quotes'][0].customer_id).toBe('cust-456');
      expect((globalThis as any).inserts['quotes'][0].title).toBe('Mon Devis Test');
      expect((globalThis as any).inserts['quotes'][0].status).toBe('draft');
      expect((globalThis as any).inserts['quotes'][0].revision).toBe(1);
    });

    test('Incrémente le numéro de séquence par rapport au dernier devis existant', async () => {
      (globalThis as any).mockDataByTable['organizations'] = { id: 'org-123', default_margin_rate: '0.20' };
      const currentYear = new Date().getFullYear();
      (globalThis as any).mockDataByTable['quotes'] = [{ quote_number: `BM-${currentYear}-00042` }];

      const res = await createQuote('my-org', 'cust-456', '');
      expect(res.success).toBe(true);
      expect((globalThis as any).inserts['quotes'][0].quote_number).toBe(`BM-${currentYear}-00043`);
      expect((globalThis as any).inserts['quotes'][0].title).toBe(`Devis BM-${currentYear}-00043`);
    });
  });

  describe('saveQuoteItems', () => {
    beforeEach(() => {
      // Configuration par défaut de l'organisation
      (globalThis as any).mockDataByTable['organizations'] = {
        id: 'org-123',
        default_margin_rate: '0.20',
        default_rounding_rule: 'up_0_05',
        sales_can_override_floor: false,
      };

      // Statut du devis
      (globalThis as any).mockDataByTable['quotes'] = {
        status: 'draft',
        customer_id: 'cust-456',
      };

      // Rôle utilisateur (sales par défaut)
      (globalThis as any).mockDataByTable['organization_memberships'] = {
        role: 'sales',
      };

      // Produits
      (globalThis as any).mockDataByTable['products'] = {
        'prod-1': {
          id: 'prod-1',
          name: 'Saumon Atlantique',
          category_id: 'cat-poisson',
          sales_unit: 'kg',
          vat_rate: 0.06,
        },
      };

      // Coûts fournisseurs
      (globalThis as any).mockDataByTable['supplier_products'] = [{
        current_landed_cost: 10.0,
        current_purchase_price: 10.0,
        conversion_factor: 1.0,
        yield_rate: 1.0,
        transport_cost: 0.0,
        handling_cost: 0.0,
        other_fixed_cost: 0.0,
        other_cost_percent: 0.0,
      }];

      // Pas de règle de marge spécifique
      (globalThis as any).mockDataByTable['margin_rules'] = [];
    });

    test('Calcule correctement les totaux et enregistre les lignes de devis (marge respectée)', async () => {
      // Prix proposé 15.00€ HT avec 10% de remise -> Net unit price = 13.50€ HT
      // Coût de revient = 10.00€ HT
      // Marge réelle = (13.50 - 10.00) / 13.50 = 25.9% >= 20% cible. Tout est OK.
      const items = [
        {
          product_id: 'prod-1',
          quantity: 10,
          unit_price: 15.00,
          discount_rate: 0.10,
          override_justification: null,
          position: 1,
          description: '10 kg de saumon',
        },
      ];

      const res = await saveQuoteItems('my-org', 'quote-abc', items);
      expect(res.success).toBe(true);

      // Vérifier les lignes insérées
      expect((globalThis as any).inserts['quote_items']).toHaveLength(1);
      const insertedItem = (globalThis as any).inserts['quote_items'][0];
      expect(insertedItem.net_unit_price).toBe(13.50);
      expect(insertedItem.margin_rate).toBeCloseTo(0.259, 3);
      expect(insertedItem.margin_amount).toBe(3.50);
      expect(insertedItem.line_subtotal).toBe(135.00);

      // Vérifier la mise à jour des totaux du devis
      expect((globalThis as any).updates['quotes']).toHaveLength(1);
      const quoteUpdate = (globalThis as any).updates['quotes'][0];
      expect(quoteUpdate.subtotal).toBe(135.00);
      expect(quoteUpdate.tax_total).toBe(135.00 * 0.06);
      expect(quoteUpdate.grand_total).toBe(135.00 * 1.06);
      expect(quoteUpdate.has_complete_quantities).toBe(true);
    });

    test('Bloque la sauvegarde si la marge réelle est inférieure à la cible et que l\'utilisateur est commercial sans droit de dérogation', async () => {
      // Prix proposé 12.00€ HT (sans remise) -> Marge réelle = (12 - 10) / 12 = 16.67% < 20% cible.
      const items = [
        {
          product_id: 'prod-1',
          quantity: 5,
          unit_price: 12.00,
          discount_rate: 0,
          override_justification: null,
          position: 1,
          description: 'Marge insuffisante',
        },
      ];

      const res = await saveQuoteItems('my-org', 'quote-abc', items);
      expect(res.error).toContain('inférieure à la cible');
      expect(res.error).toContain("vous n'êtes pas autorisé à déroger au seuil");
      expect((globalThis as any).inserts['quote_items']).toBeUndefined();
    });

    test('Bloque la sauvegarde si la dérogation est autorisée pour le commercial mais qu\'aucune justification n\'est fournie', async () => {
      // Autoriser la dérogation pour les commerciaux au niveau de l'organisation
      (globalThis as any).mockDataByTable['organizations'].sales_can_override_floor = true;

      const items = [
        {
          product_id: 'prod-1',
          quantity: 5,
          unit_price: 12.00,
          discount_rate: 0,
          override_justification: null, // Justification manquante
          position: 1,
          description: 'Marge insuffisante sans justification',
        },
      ];

      const res = await saveQuoteItems('my-org', 'quote-abc', items);
      expect(res.error).toContain('Une justification est obligatoire');
      expect((globalThis as any).inserts['quote_items']).toBeUndefined();
    });

    test('Autorise la sauvegarde si la dérogation est autorisée pour le commercial et qu\'une justification est fournie', async () => {
      (globalThis as any).mockDataByTable['organizations'].sales_can_override_floor = true;

      const items = [
        {
          product_id: 'prod-1',
          quantity: 5,
          unit_price: 12.00,
          discount_rate: 0,
          override_justification: 'Prix négocié pour volume futur',
          position: 1,
          description: 'Marge insuffisante avec justification',
        },
      ];

      const res = await saveQuoteItems('my-org', 'quote-abc', items);
      expect(res.success).toBe(true);
      expect((globalThis as any).inserts['quote_items']).toHaveLength(1);
      expect((globalThis as any).inserts['quote_items'][0].override_justification).toBe('Prix négocié pour volume futur');
    });

    test('Autorise la sauvegarde sans bloquer si l\'utilisateur est un manager/admin, même sous le seuil et sans justification', async () => {
      // Rôle manager
      (globalThis as any).mockDataByTable['organization_memberships'] = {
        role: 'manager',
      };

      const items = [
        {
          product_id: 'prod-1',
          quantity: 5,
          unit_price: 12.00,
          discount_rate: 0,
          override_justification: null, // Pas de justification
          position: 1,
          description: 'Marge insuffisante par un manager',
        },
      ];

      const res = await saveQuoteItems('my-org', 'quote-abc', items);
      expect(res.success).toBe(true);
      expect((globalThis as any).inserts['quote_items']).toHaveLength(1);
    });

    test('Calcule correctement le cout de revient et la marge si is_transformed est false (vente entier)', async () => {
      // Configuration fournisseur avec conversion factor = 10, yield = 0.8, transport = 1.0, main d'oeuvre = 2.0
      (globalThis as any).mockDataByTable['supplier_products'] = [{
        current_purchase_price: 120.0,
        conversion_factor: 10,
        yield_rate: 0.8,
        transport_cost: 1.0,
        handling_cost: 2.0,
        other_fixed_cost: 0.5,
        other_cost_percent: 0.0,
        current_landed_cost: 18.5,
      }];

      // Si is_transformed = false (vente entier):
      // baseUnitCost = 120 / 10 = 12.0
      // usableUnitCost = 12.0 / 1.0 = 12.0 (yield forcé à 1.0)
      // handling = 0.0 (main d'oeuvre forcée à 0.0)
      // landedCost = 12.0 + 1.0 (transport) + 0.0 (handling) + 0.5 (other fixed) = 13.5
      // Prix proposé 18.00 HT, net = 18.00 HT
      // Marge réelle = (18.0 - 13.5) / 18.0 = 25% (>= 20% cible)

      const items = [
        {
          product_id: 'prod-1',
          quantity: 10,
          unit_price: 18.00,
          discount_rate: 0,
          override_justification: null,
          position: 1,
          description: 'Vente saumon entier',
          is_transformed: false,
        },
      ];

      const res = await saveQuoteItems('my-org', 'quote-abc', items);
      expect(res.success).toBe(true);

      expect((globalThis as any).inserts['quote_items']).toHaveLength(1);
      const insertedItem = (globalThis as any).inserts['quote_items'][0];
      expect(insertedItem.is_transformed).toBe(false);
      expect(insertedItem.landed_cost_snapshot).toBeCloseTo(13.5, 2);
      expect(insertedItem.margin_rate).toBeCloseTo(0.25, 2);
    });

    test('Calcule correctement le cout de revient en utilisant default_yield_rate du produit si la yield_rate du fournisseur est vide ou egale a 1.0', async () => {
      // Configuration produit avec default_yield_rate = 0.4
      (globalThis as any).mockDataByTable['products'] = {
        'prod-1': {
          id: 'prod-1',
          name: 'Bar de Ligne Filet',
          category_id: 'cat-poisson',
          sales_unit: 'kg',
          vat_rate: 0.06,
          default_yield_rate: 0.40,
        },
      };

      // Configuration fournisseur avec yield_rate = 1.0
      (globalThis as any).mockDataByTable['supplier_products'] = [{
        current_purchase_price: 24.00,
        conversion_factor: 1.0,
        yield_rate: 1.0,
        transport_cost: 0.0,
        handling_cost: 0.0,
        other_fixed_cost: 0.0,
        other_cost_percent: 0.0,
        current_landed_cost: 24.00,
      }];

      // Si is_transformed = true:
      // yield rate tombe à 1.0 au niveau fournisseur, donc fallback sur produit default_yield_rate = 0.4
      // usableUnitCost = 24.0 / 0.4 = 60.0
      // landedCost = 60.0
      // Prix proposé 80.00 HT, net = 80.00 HT
      // Marge réelle = (80 - 60) / 80 = 25% (>= 20% cible)

      const items = [
        {
          product_id: 'prod-1',
          quantity: 10,
          unit_price: 80.00,
          discount_rate: 0,
          override_justification: null,
          position: 1,
          description: 'Vente bar filet transformé',
          is_transformed: true,
        },
      ];

      const res = await saveQuoteItems('my-org', 'quote-abc', items);
      expect(res.success).toBe(true);

      expect((globalThis as any).inserts['quote_items']).toHaveLength(1);
      const insertedItem = (globalThis as any).inserts['quote_items'][0];
      expect(insertedItem.is_transformed).toBe(true);
      expect(insertedItem.landed_cost_snapshot).toBeCloseTo(60.0, 2);
      expect(insertedItem.margin_rate).toBeCloseTo(0.25, 2);
    });
  });

  describe('lockAndSendQuote', () => {
    test('Verrouille le devis et change son statut en "sent"', async () => {
      (globalThis as any).mockDataByTable['organizations'] = { id: 'org-123' };
      (globalThis as any).mockDataByTable['quotes'] = {
        status: 'draft',
        expires_at: '2026-07-22',
      };

      const res = await lockAndSendQuote('my-org', 'quote-abc');
      expect(res.success).toBe(true);
      expect(res.token).toBeDefined();

      expect((globalThis as any).updates['quotes']).toHaveLength(1);
      expect((globalThis as any).updates['quotes'][0].status).toBe('sent');
      expect((globalThis as any).updates['quotes'][0].public_token_hash).toBeDefined();

      expect((globalThis as any).inserts['quote_events']).toHaveLength(1);
      expect((globalThis as any).inserts['quote_events'][0].event_type).toBe('sent');
    });
  });

  describe('reviseQuote', () => {
    test('Crée une nouvelle révision et annule l\'ancienne version', async () => {
      (globalThis as any).mockDataByTable['organizations'] = { id: 'org-123' };
      (globalThis as any).mockDataByTable['quotes'] = {
        id: 'quote-v1',
        quote_number: 'BM-2026-00001',
        revision: 1,
        status: 'sent',
        customer_id: 'cust-456',
        title: 'Devis V1',
      };

      (globalThis as any).mockDataByTable['quote_items'] = [
        {
          product_id: 'prod-1',
          position: 1,
          quantity: 10,
          unit_price: 15.00,
          discount_rate: 0.10,
          target_margin_rate: 0.20,
          tax_rate: 0.06,
        },
      ];

      const res = await reviseQuote('my-org', 'quote-v1', false);
      expect(res.success).toBe(true);
      expect(res.newQuoteId).toBe('inserted-id');

      // L'ancien devis est annulé
      expect((globalThis as any).updates['quotes']).toHaveLength(1);
      expect((globalThis as any).updates['quotes'][0].status).toBe('cancelled');

      // Le nouveau devis est inséré en statut draft avec révision incrémentée
      expect((globalThis as any).inserts['quotes']).toHaveLength(1);
      expect((globalThis as any).inserts['quotes'][0].revision).toBe(2);
      expect((globalThis as any).inserts['quotes'][0].status).toBe('draft');
      expect((globalThis as any).inserts['quotes'][0].parent_quote_id).toBe('quote-v1');

      // Les articles sont copiés vers la nouvelle révision
      expect((globalThis as any).inserts['quote_items']).toHaveLength(1);
      expect((globalThis as any).inserts['quote_items'][0].quote_id).toBe('inserted-id');
    });
  });

  describe('duplicateQuote', () => {
    test('Duplique le devis pour un nouveau client avec recalcul des marges cibles', async () => {
      (globalThis as any).mockDataByTable['organizations'] = { id: 'org-123' };
      (globalThis as any).mockDataByTable['quotes'] = {
        id: 'quote-orig',
        quote_number: 'BM-2026-00001',
        revision: 1,
        status: 'sent',
        customer_id: 'cust-old',
        title: 'Original Title',
      };

      // Règle de marge cible de l'org = 20%, mais on configure une règle spécifique pour le nouveau client à 25%
      (globalThis as any).mockDataByTable['margin_rules'] = [
        {
          id: 'rule-new-cust',
          scope: 'customer',
          customer_id: 'cust-new',
          target_margin_rate: '0.25',
          priority: 20,
          is_active: true,
        },
      ];

      (globalThis as any).mockDataByTable['quote_items'] = [
        {
          product_id: 'prod-1',
          position: 1,
          quantity: 10,
          unit_price: 15.00,
          discount_rate: 0,
          landed_cost_snapshot: 10.0,
          target_margin_rate: 0.20, // Ancienne cible pour cust-old
          tax_rate: 0.06,
        },
      ];

      (globalThis as any).mockDataByTable['products'] = {
        'prod-1': {
          id: 'prod-1',
          category_id: 'cat-1',
        },
      };

      const res = await duplicateQuote('my-org', 'quote-orig', 'cust-new');
      expect(res.success).toBe(true);

      // Nouveau devis inséré en draft
      expect((globalThis as any).inserts['quotes']).toHaveLength(1);
      expect((globalThis as any).inserts['quotes'][0].customer_id).toBe('cust-new');
      expect((globalThis as any).inserts['quotes'][0].status).toBe('draft');
      expect((globalThis as any).inserts['quotes'][0].revision).toBe(1);

      // Recalcul de l'article avec la nouvelle marge cible à 25% et prix recommandé associé
      expect((globalThis as any).inserts['quote_items']).toHaveLength(1);
      const duplicatedItem = (globalThis as any).inserts['quote_items'][0];
      expect(duplicatedItem.target_margin_rate).toBe(0.25);
      // Prix recommandé pour marge cible de 25% sur coût de 10.0€ : 10.0 / 0.75 = 13.333 -> arrondi up_0_05 = 13.35
      expect(duplicatedItem.recommended_price).toBe(13.35);
    });
  });
});
