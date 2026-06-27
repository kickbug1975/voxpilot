import { describe, test, expect } from 'vitest';
import { PricingEngine, MarginRule } from '../src/domain/PricingEngine';
import { Decimal } from 'decimal.js';

describe('PricingEngine - Coût Rendu (Landed Cost)', () => {
  test('Calcule le coût rendu avec les valeurs standard', () => {
    // Achat 10€, Caisse de 5kg, Rendement 80%, Transport 1.20€, Manutention 0.50€, Autres fixes 0.30€, Pourcentage 5%
    // baseUnitCost = 10 / 5 = 2.0
    // usableUnitCost = 2.0 / 0.8 = 2.50
    // percentCost = 2.50 * 0.05 = 0.125
    // landedCost = 2.50 + 1.20 + 0.50 + 0.30 + 0.125 = 4.625
    const result = PricingEngine.calculateLandedCost({
      purchasePrice: 10,
      conversionFactor: 5,
      yieldRate: 0.8,
      transportCostPerSalesUnit: 1.20,
      handlingCostPerSalesUnit: 0.50,
      otherFixedCostPerSalesUnit: 0.30,
      otherCostPercent: 0.05,
    });

    expect(result.baseUnitCost.toNumber()).toBe(2.0);
    expect(result.usableUnitCost.toNumber()).toBe(2.50);
    expect(result.percentCost.toNumber()).toBe(0.125);
    expect(result.landedCost.toNumber()).toBe(4.625);
  });

  test('Lève une erreur si le facteur de conversion est <= 0', () => {
    expect(() => {
      PricingEngine.calculateLandedCost({
        purchasePrice: 10,
        conversionFactor: 0,
        yieldRate: 0.8,
      });
    }).toThrow('Le facteur de conversion doit être supérieur à zéro.');

    expect(() => {
      PricingEngine.calculateLandedCost({
        purchasePrice: 10,
        conversionFactor: -1.5,
        yieldRate: 0.8,
      });
    }).toThrow('Le facteur de conversion doit être supérieur à zéro.');
  });

  test('Lève une erreur si le rendement de matière est <= 0 ou > 1', () => {
    expect(() => {
      PricingEngine.calculateLandedCost({
        purchasePrice: 10,
        conversionFactor: 5,
        yieldRate: 0,
      });
    }).toThrow('Le taux de rendement doit être compris entre 0 et 1');

    expect(() => {
      PricingEngine.calculateLandedCost({
        purchasePrice: 10,
        conversionFactor: 5,
        yieldRate: 1.05,
      });
    }).toThrow('Le taux de rendement doit être compris entre 0 et 1');
  });
});

describe('PricingEngine - Marges et Markups', () => {
  test('Calcule la marge brute et le markup', () => {
    // Vente 10€, Coût 8€
    // Marge brute = 2€
    // Taux de marge = 2 / 10 = 20%
    // Markup = 2 / 8 = 25%
    const result = PricingEngine.calculateMargin(10, 8);

    expect(result.grossMarginAmount.toNumber()).toBe(2);
    expect(result.marginRate?.toNumber()).toBe(0.20);
    expect(result.markupRate?.toNumber()).toBe(0.25);
  });

  test('Gère les prix de vente <= 0 avec taux de marge nul', () => {
    const resultZero = PricingEngine.calculateMargin(0, 5);
    expect(resultZero.marginRate).toBeNull();
    expect(resultZero.grossMarginAmount.toNumber()).toBe(-5);

    const resultNeg = PricingEngine.calculateMargin(-2, 5);
    expect(resultNeg.marginRate).toBeNull();
  });

  test('Gère les coûts de base <= 0 avec markup nul', () => {
    const resultZero = PricingEngine.calculateMargin(10, 0);
    expect(resultZero.markupRate).toBeNull();
    expect(resultZero.grossMarginAmount.toNumber()).toBe(10);
  });
});

describe('PricingEngine - Règles d\'arrondi', () => {
  test('Arrondi "none" (2 décimales standard)', () => {
    expect(PricingEngine.applyRoundingRule(new Decimal(12.344), 'none').toNumber()).toBe(12.34);
    expect(PricingEngine.applyRoundingRule(new Decimal(12.346), 'none').toNumber()).toBe(12.35);
  });

  test('Arrondi "nearest_0_05"', () => {
    expect(PricingEngine.applyRoundingRule(new Decimal(12.32), 'nearest_0_05').toNumber()).toBe(12.30);
    expect(PricingEngine.applyRoundingRule(new Decimal(12.33), 'nearest_0_05').toNumber()).toBe(12.35);
    expect(PricingEngine.applyRoundingRule(new Decimal(12.37), 'nearest_0_05').toNumber()).toBe(12.35);
    expect(PricingEngine.applyRoundingRule(new Decimal(12.38), 'nearest_0_05').toNumber()).toBe(12.40);
  });

  test('Arrondi "up_0_05"', () => {
    expect(PricingEngine.applyRoundingRule(new Decimal(12.31), 'up_0_05').toNumber()).toBe(12.35);
    expect(PricingEngine.applyRoundingRule(new Decimal(12.35), 'up_0_05').toNumber()).toBe(12.35);
    expect(PricingEngine.applyRoundingRule(new Decimal(12.36), 'up_0_05').toNumber()).toBe(12.40);
  });

  test('Arrondi "nearest_0_10"', () => {
    expect(PricingEngine.applyRoundingRule(new Decimal(12.34), 'nearest_0_10').toNumber()).toBe(12.30);
    expect(PricingEngine.applyRoundingRule(new Decimal(12.35), 'nearest_0_10').toNumber()).toBe(12.40);
  });

  test('Arrondi "up_0_10"', () => {
    expect(PricingEngine.applyRoundingRule(new Decimal(12.31), 'up_0_10').toNumber()).toBe(12.40);
    expect(PricingEngine.applyRoundingRule(new Decimal(12.30), 'up_0_10').toNumber()).toBe(12.30);
  });

  test('Arrondi "psychological_0_99"', () => {
    // 12.34 -> 12.99
    expect(PricingEngine.applyRoundingRule(new Decimal(12.34), 'psychological_0_99').toNumber()).toBe(12.99);
    // 12.99 -> 12.99
    expect(PricingEngine.applyRoundingRule(new Decimal(12.99), 'psychological_0_99').toNumber()).toBe(12.99);
    // 13.00 -> 13.99
    expect(PricingEngine.applyRoundingRule(new Decimal(13.00), 'psychological_0_99').toNumber()).toBe(13.99);
    // 12.00 -> 12.99
    expect(PricingEngine.applyRoundingRule(new Decimal(12.00), 'psychological_0_99').toNumber()).toBe(12.99);
    // Cas limite : < 1 EUR
    expect(PricingEngine.applyRoundingRule(new Decimal(0.554), 'psychological_0_99').toNumber()).toBe(0.55);
  });
});

describe('PricingEngine - Prix Recommandé', () => {
  test('Calcule le prix recommandé brut et arrondi', () => {
    // Coût rendu = 8.0€, Marge cible = 20% (0.20)
    // Prix recommandé brut = 8.0 / (1 - 0.20) = 10.0€
    // Arrondi up_0_05 de 10.00 = 10.00
    const result = PricingEngine.calculateRecommendedPrice(8.0, 0.20, 'up_0_05');
    expect(result.recommendedRawPrice.toNumber()).toBe(10.0);
    expect(result.recommendedPrice.toNumber()).toBe(10.0);

    // Coût rendu = 8.13€, Marge cible = 20%
    // Prix recommandé brut = 8.13 / 0.8 = 10.1625
    // Arrondi up_0_05 = 10.20
    const resultArr = PricingEngine.calculateRecommendedPrice(8.13, 0.20, 'up_0_05');
    expect(resultArr.recommendedPrice.toNumber()).toBe(10.20);
  });

  test('Lève une erreur si la marge cible >= 1', () => {
    expect(() => {
      PricingEngine.calculateRecommendedPrice(10, 1.0, 'none');
    }).toThrow('Le taux de marge cible doit être strictement inférieur à 1.');

    expect(() => {
      PricingEngine.calculateRecommendedPrice(10, 1.05, 'none');
    }).toThrow('Le taux de marge cible doit être strictement inférieur à 1.');
  });
});

describe('PricingEngine - Résolution des règles de marge', () => {
  const mockRules: MarginRule[] = [
    {
      id: 'rule-org-cat',
      scope: 'organization_category',
      category_id: 'cat-poissons',
      target_margin_rate: 0.15,
      priority: 10,
    },
    {
      id: 'rule-cust-global',
      scope: 'customer',
      customer_id: 'cust-belgique',
      target_margin_rate: 0.18,
      priority: 20,
    },
    {
      id: 'rule-cust-cat',
      scope: 'customer_category',
      customer_id: 'cust-belgique',
      category_id: 'cat-poissons',
      target_margin_rate: 0.22,
      priority: 30,
    },
    {
      id: 'rule-cust-prod',
      scope: 'customer_product',
      customer_id: 'cust-belgique',
      product_id: 'prod-saumon',
      target_margin_rate: 0.25,
      priority: 40,
    },
  ];

  test('Résout la règle client + produit en priorité', () => {
    const res = PricingEngine.resolveMarginRule(
      {
        productId: 'prod-saumon',
        categoryId: 'cat-poissons',
        customerId: 'cust-belgique',
      },
      mockRules,
      0.12
    );

    expect(res.source).toBe('customer_product');
    expect(res.targetMarginRate.toNumber()).toBe(0.25);
    expect(res.ruleId).toBe('rule-cust-prod');
  });

  test('Résout la règle client + catégorie si pas de règle produit', () => {
    const res = PricingEngine.resolveMarginRule(
      {
        productId: 'prod-cabillaud',
        categoryId: 'cat-poissons',
        customerId: 'cust-belgique',
      },
      mockRules,
      0.12
    );

    expect(res.source).toBe('customer_category');
    expect(res.targetMarginRate.toNumber()).toBe(0.22);
    expect(res.ruleId).toBe('rule-cust-cat');
  });

  test('Résout la règle client globale si pas de règle produit ou catégorie', () => {
    const res = PricingEngine.resolveMarginRule(
      {
        productId: 'prod-crevettes',
        categoryId: 'cat-crustaces',
        customerId: 'cust-belgique',
      },
      mockRules,
      0.12
    );

    expect(res.source).toBe('customer');
    expect(res.targetMarginRate.toNumber()).toBe(0.18);
    expect(res.ruleId).toBe('rule-cust-global');
  });

  test('Résout la règle organisation + catégorie si pas de règle client', () => {
    const res = PricingEngine.resolveMarginRule(
      {
        productId: 'prod-cabillaud',
        categoryId: 'cat-poissons',
        customerId: 'cust-france',
      },
      mockRules,
      0.12
    );

    expect(res.source).toBe('organization_category');
    expect(res.targetMarginRate.toNumber()).toBe(0.15);
    expect(res.ruleId).toBe('rule-org-cat');
  });

  test('Résout le taux de marge par défaut de l\'organisation si aucune règle ne concorde', () => {
    const res = PricingEngine.resolveMarginRule(
      {
        productId: 'prod-crevettes',
        categoryId: 'cat-crustaces',
        customerId: 'cust-france',
      },
      mockRules,
      0.12
    );

    expect(res.source).toBe('organization');
    expect(res.targetMarginRate.toNumber()).toBe(0.12);
  });

  test('Sélectionne la règle de priorité la plus élevée en cas de doublon de scope', () => {
    const duplicateRules: MarginRule[] = [
      {
        id: 'rule-low-priority',
        scope: 'customer_product',
        customer_id: 'cust-belgique',
        product_id: 'prod-saumon',
        target_margin_rate: 0.15,
        priority: 5,
      },
      {
        id: 'rule-high-priority',
        scope: 'customer_product',
        customer_id: 'cust-belgique',
        product_id: 'prod-saumon',
        target_margin_rate: 0.28,
        priority: 15,
      },
    ];

    const res = PricingEngine.resolveMarginRule(
      {
        productId: 'prod-saumon',
        customerId: 'cust-belgique',
      },
      duplicateRules,
      0.12
    );

    expect(res.source).toBe('customer_product');
    expect(res.targetMarginRate.toNumber()).toBe(0.28);
    expect(res.ruleId).toBe('rule-high-priority');
  });

  test('Ignore les règles inactives', () => {
    const inactiveRules: MarginRule[] = [
      {
        id: 'rule-inactive',
        scope: 'customer_product',
        customer_id: 'cust-belgique',
        product_id: 'prod-saumon',
        target_margin_rate: 0.28,
        priority: 15,
        is_active: false,
      },
    ];

    const res = PricingEngine.resolveMarginRule(
      {
        productId: 'prod-saumon',
        customerId: 'cust-belgique',
      },
      inactiveRules,
      0.12
    );

    expect(res.source).toBe('organization');
    expect(res.targetMarginRate.toNumber()).toBe(0.12);
  });
});
