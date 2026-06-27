import { Decimal } from 'decimal.js';

export interface LandedCostInput {
  purchasePrice: number | string | Decimal;
  conversionFactor: number | string | Decimal;
  yieldRate: number | string | Decimal;
  transportCostPerSalesUnit?: number | string | Decimal;
  handlingCostPerSalesUnit?: number | string | Decimal;
  otherFixedCostPerSalesUnit?: number | string | Decimal;
  otherCostPercent?: number | string | Decimal;
}

export interface LandedCostResult {
  baseUnitCost: Decimal;
  usableUnitCost: Decimal;
  percentCost: Decimal;
  landedCost: Decimal;
}

export interface MarginResult {
  grossMarginAmount: Decimal;
  marginRate: Decimal | null;
  markupRate: Decimal | null;
}

export interface RecommendedPriceResult {
  recommendedRawPrice: Decimal;
  recommendedPrice: Decimal;
}

export interface ResolvedRule {
  targetMarginRate: Decimal;
  source: 'customer_product' | 'customer_category' | 'customer' | 'organization_category' | 'organization' | 'fallback';
  ruleId?: string;
}

export interface MarginRule {
  id?: string;
  scope: 'customer_product' | 'customer_category' | 'customer' | 'organization_category';
  customer_id?: string | null;
  category_id?: string | null;
  product_id?: string | null;
  target_margin_rate: number | string;
  priority?: number;
  is_active?: boolean;
  valid_from?: string | null;
  valid_to?: string | null;
}

export class PricingEngine {
  /**
   * Calcule le coût rendu (Landed Cost) à partir des coûts de base et frais annexes.
   */
  static calculateLandedCost(input: LandedCostInput): LandedCostResult {
    const purchase = new Decimal(input.purchasePrice);
    const conv = new Decimal(input.conversionFactor);
    if (conv.lte(0)) {
      throw new Error('Le facteur de conversion doit être supérieur à zéro.');
    }
    const yRate = new Decimal(input.yieldRate);
    if (yRate.lte(0) || yRate.gt(1)) {
      throw new Error('Le taux de rendement doit être compris entre 0 et 1 (exclusif pour 0).');
    }

    const baseUnitCost = purchase.div(conv);
    const usableUnitCost = baseUnitCost.div(yRate);

    const transport = new Decimal(input.transportCostPerSalesUnit || 0);
    const handling = new Decimal(input.handlingCostPerSalesUnit || 0);
    const otherFixed = new Decimal(input.otherFixedCostPerSalesUnit || 0);
    const otherPct = new Decimal(input.otherCostPercent || 0);

    const percentCost = usableUnitCost.mul(otherPct);
    const landedCost = usableUnitCost
      .plus(transport)
      .plus(handling)
      .plus(otherFixed)
      .plus(percentCost);

    if (landedCost.lt(0)) {
      throw new Error('Le coût rendu calculé ne peut pas être inférieur à zéro.');
    }

    return {
      baseUnitCost,
      usableUnitCost,
      percentCost,
      landedCost,
    };
  }

  /**
   * Calcule les marges, markup, et écarts en euros basés sur le prix de vente et le coût rendu.
   */
  static calculateMargin(
    salesPrice: number | string | Decimal,
    landedCost: number | string | Decimal
  ): MarginResult {
    const price = new Decimal(salesPrice);
    const cost = new Decimal(landedCost);

    const grossMarginAmount = price.minus(cost);

    let marginRate: Decimal | null = null;
    if (price.gt(0)) {
      marginRate = grossMarginAmount.div(price);
    }

    let markupRate: Decimal | null = null;
    if (cost.gt(0)) {
      markupRate = grossMarginAmount.div(cost);
    }

    return {
      grossMarginAmount,
      marginRate,
      markupRate,
    };
  }

  /**
   * Applique une règle d'arrondi sur un montant brut.
   */
  static applyRoundingRule(value: Decimal, rule: string): Decimal {
    const r = rule || 'up_0_05';

    switch (r) {
      case 'none':
        return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      case 'nearest_0_05':
        return value.div(0.05).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).mul(0.05);

      case 'up_0_05':
        return value.div(0.05).toDecimalPlaces(0, Decimal.ROUND_CEIL).mul(0.05);

      case 'nearest_0_10':
        return value.div(0.10).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).mul(0.10);

      case 'up_0_10':
        return value.div(0.10).toDecimalPlaces(0, Decimal.ROUND_CEIL).mul(0.10);

      case 'psychological_0_99':
        if (value.lt(1)) {
          return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        }
        const base = value.toDecimalPlaces(0, Decimal.ROUND_FLOOR);
        const candidate = base.plus(0.99);
        if (value.gt(candidate)) {
          return candidate.plus(1);
        }
        return candidate;

      default:
        // default up_0_05
        return value.div(0.05).toDecimalPlaces(0, Decimal.ROUND_CEIL).mul(0.05);
    }
  }

  /**
   * Calcule le prix recommandé d'un produit basé sur son coût rendu et sa marge cible.
   */
  static calculateRecommendedPrice(
    landedCost: number | string | Decimal,
    targetMarginRate: number | string | Decimal,
    roundingRule: string
  ): RecommendedPriceResult {
    const cost = new Decimal(landedCost);
    const targetMargin = new Decimal(targetMarginRate);

    if (targetMargin.gte(1)) {
      throw new Error('Le taux de marge cible doit être strictement inférieur à 1.');
    }

    const recommendedRawPrice = cost.div(new Decimal(1).minus(targetMargin));
    const recommendedPrice = this.applyRoundingRule(recommendedRawPrice, roundingRule);

    return {
      recommendedRawPrice,
      recommendedPrice,
    };
  }

  /**
   * Résout la règle de marge applicable d'après la hiérarchie.
   */
  static resolveMarginRule(
    context: {
      productId?: string | null;
      categoryId?: string | null;
      customerId?: string | null;
      referenceDate?: Date | string | null;
    },
    rules: MarginRule[],
    defaultOrgMarginRate?: number | string | Decimal | null
  ): ResolvedRule {
    const { productId, categoryId, customerId } = context;

    const ref = context.referenceDate ? new Date(context.referenceDate) : new Date();
    const refYear = ref.getFullYear();
    const refMonth = ref.getMonth();
    const refDay = ref.getDate();
    const localRefTime = new Date(refYear, refMonth, refDay).getTime();

    const parseLocalDate = (dateStr: string): number => {
      const parts = dateStr.split('-');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      return new Date(year, month, day).getTime();
    };

    // Récupère uniquement les règles actives et valides à la date de référence
    const activeRules = rules.filter(r => {
      if (r.is_active === false) return false;
      
      if (r.valid_from && r.valid_from.trim() !== '') {
        const fromTime = parseLocalDate(r.valid_from);
        if (localRefTime < fromTime) return false;
      }
      
      if (r.valid_to && r.valid_to.trim() !== '') {
        const toTime = parseLocalDate(r.valid_to);
        if (localRefTime > toTime) return false;
      }
      
      return true;
    });

    // Fonction de tri par priorité descendante
    const sortRules = (list: MarginRule[]) => {
      return [...list].sort((a, b) => (b.priority || 0) - (a.priority || 0));
    };

    // 1. Règle client + produit
    if (customerId && productId) {
      const matches = activeRules.filter(
        r => r.scope === 'customer_product' && r.customer_id === customerId && r.product_id === productId
      );
      if (matches.length > 0) {
        const best = sortRules(matches)[0];
        return {
          targetMarginRate: new Decimal(best.target_margin_rate),
          source: 'customer_product',
          ruleId: best.id,
        };
      }
    }

    // 2. Règle client + catégorie
    if (customerId && categoryId) {
      const matches = activeRules.filter(
        r => r.scope === 'customer_category' && r.customer_id === customerId && r.category_id === categoryId
      );
      if (matches.length > 0) {
        const best = sortRules(matches)[0];
        return {
          targetMarginRate: new Decimal(best.target_margin_rate),
          source: 'customer_category',
          ruleId: best.id,
        };
      }
    }

    // 3. Règle client globale
    if (customerId) {
      const matches = activeRules.filter(
        r => r.scope === 'customer' && r.customer_id === customerId && !r.product_id && !r.category_id
      );
      if (matches.length > 0) {
        const best = sortRules(matches)[0];
        return {
          targetMarginRate: new Decimal(best.target_margin_rate),
          source: 'customer',
          ruleId: best.id,
        };
      }
    }

    // 4. Règle organisation + catégorie
    if (categoryId) {
      const matches = activeRules.filter(
        r => r.scope === 'organization_category' && r.category_id === categoryId && !r.customer_id
      );
      if (matches.length > 0) {
        const best = sortRules(matches)[0];
        return {
          targetMarginRate: new Decimal(best.target_margin_rate),
          source: 'organization_category',
          ruleId: best.id,
        };
      }
    }

    // 5. Règle par défaut de l'organisation
    if (defaultOrgMarginRate !== undefined && defaultOrgMarginRate !== null) {
      try {
        return {
          targetMarginRate: new Decimal(defaultOrgMarginRate),
          source: 'organization',
        };
      } catch {
        // Fallback technique
      }
    }

    // 6. Règle de secours ultime (20%)
    return {
      targetMarginRate: new Decimal(0.20),
      source: 'fallback',
    };
  }
}
