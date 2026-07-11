'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Calcule ou récupère le prix unitaire d'un produit pour un client donné à l'instant T.
 * Recopie la même cascade que celle du webhook WhatsApp :
 * 1. Prix spécifique client (product_sales_prices avec customer_id)
 * 2. Règle de marge spécifique client (margin_rules) appliquée au coût du produit (price_snapshots)
 * 3. Prix général catalogue (product_sales_prices avec customer_id = null)
 * 4. Fallback par défaut (15.00 €/kg)
 */
export async function getPriceForCustomerProduct(
  customerId: string,
  productId: string,
  organizationId: string
): Promise<number> {
  try {
    const supabase = await createClient();

    // --- 1. PRIX SPÉCIFIQUE CLIENT ---
    const { data: specPrice } = await supabase
      .from('product_sales_prices')
      .select('sales_price')
      .eq('customer_id', customerId)
      .eq('product_id', productId)
      .eq('is_active', true)
      .maybeSingle();

    if (specPrice && specPrice.sales_price) {
      return parseFloat(specPrice.sales_price);
    }

    // --- 2. RÈGLE DE MARGE CLIENT (SUR COÛT RENDU) ---
    const { data: product } = await supabase
      .from('products')
      .select('category_id')
      .eq('id', productId)
      .maybeSingle();

    const categoryId = product?.category_id;

    const { data: rules } = await supabase
      .from('margin_rules')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    if (rules && rules.length > 0) {
      const activeRules = rules.filter(r => {
        if (r.scope === 'customer_product' && r.customer_id === customerId && r.product_id === productId) return true;
        if (r.scope === 'customer_category' && r.customer_id === customerId && r.category_id === categoryId) return true;
        if (r.scope === 'customer' && r.customer_id === customerId && !r.product_id && !r.category_id) return true;
        return false;
      });

      if (activeRules.length > 0) {
        activeRules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        const bestRule = activeRules[0];
        const marginRate = parseFloat(bestRule.target_margin_rate);

        if (marginRate < 1) {
          const { data: supplierProduct } = await supabase
            .from('supplier_products')
            .select('id')
            .eq('product_id', productId)
            .maybeSingle();

          let landedCost: number | null = null;
          if (supplierProduct) {
            const { data: snap } = await supabase
              .from('price_snapshots')
              .select('landed_cost')
              .eq('supplier_product_id', supplierProduct.id)
              .eq('is_active', true)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            
            if (snap && snap.landed_cost) {
              landedCost = parseFloat(snap.landed_cost);
            }
          }

          if (landedCost && landedCost > 0) {
            const calculatedPrice = landedCost / (1 - marginRate);
            return Math.ceil(calculatedPrice / 0.05) * 0.05;
          }
        }
      }
    }

    // --- 3. PRIX GÉNÉRAL CATALOGUE ---
    const { data: generalPrice } = await supabase
      .from('product_sales_prices')
      .select('sales_price')
      .is('customer_id', null)
      .eq('product_id', productId)
      .eq('is_active', true)
      .maybeSingle();

    if (generalPrice && generalPrice.sales_price) {
      return parseFloat(generalPrice.sales_price);
    }

    return 15.00;
  } catch (err) {
    console.error('[Portal Pricing] Error resolving price:', err);
    return 15.00;
  }
}
