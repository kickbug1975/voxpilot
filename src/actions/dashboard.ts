'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { SupabaseClient } from '@supabase/supabase-js';

// Helper to get organization ID and verify membership
async function getOrgId(supabase: SupabaseClient, orgSlug: string): Promise<string> {
  const { data: org, error } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', orgSlug)
    .single();

  if (error || !org) {
    throw new Error('Organisation introuvable ou accès non autorisé.');
  }

  return org.id;
}

export async function getDashboardStats(orgSlug: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    // 1-7. Fetch organization settings, products, rules, prices, and quotes in parallel
    const [
      orgResponse,
      productsResponse,
      marginRulesResponse,
      salesPricesResponse,
      supplierProductsResponse,
      activeQuotesResponse,
      openQuotesResponse
    ] = await Promise.all([
      supabase
        .from('organizations')
        .select('id, default_margin_rate')
        .eq('id', orgId)
        .single(),
      supabase
        .from('products')
        .select('id, name, category_id')
        .eq('organization_id', orgId)
        .eq('is_active', true),
      supabase
        .from('margin_rules')
        .select('*')
        .eq('organization_id', orgId)
        .eq('is_active', true),
      supabase
        .from('product_sales_prices')
        .select('product_id, sales_price')
        .eq('organization_id', orgId)
        .is('customer_id', null)
        .eq('is_active', true),
      supabase
        .from('supplier_products')
        .select('product_id, current_landed_cost')
        .eq('organization_id', orgId)
        .eq('is_active', true),
      supabase
        .from('quotes')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .in('status', ['sent', 'viewed']),
      supabase
        .from('quotes')
        .select('id')
        .eq('organization_id', orgId)
        .in('status', ['draft', 'sent', 'viewed'])
    ]);

    const org = orgResponse.data;
    const defaultRate = org?.default_margin_rate ? parseFloat(org.default_margin_rate) : 0.20;
    const products = productsResponse.data;
    const marginRules = marginRulesResponse.data;
    const salesPrices = salesPricesResponse.data;
    const supplierProducts = supplierProductsResponse.data;
    const activeQuotesCount = activeQuotesResponse.count;
    const openQuotes = openQuotesResponse.data;

    let marginSum = 0;
    let marginCount = 0;
    let atRiskCount = 0;
    let totalPotentialProtectedUnitMargin = 0;

    const productPricesMap = new Map<string, number>();
    salesPrices?.forEach(sp => {
      productPricesMap.set(sp.product_id, parseFloat(sp.sales_price));
    });

    const productLandedCostsMap = new Map<string, number[]>();
    supplierProducts?.forEach(sp => {
      if (sp.current_landed_cost) {
        const val = parseFloat(sp.current_landed_cost);
        if (!productLandedCostsMap.has(sp.product_id)) {
          productLandedCostsMap.set(sp.product_id, []);
        }
        productLandedCostsMap.get(sp.product_id)!.push(val);
      }
    });

    products?.forEach(p => {
      const salesPrice = productPricesMap.get(p.id);
      const landedCosts = productLandedCostsMap.get(p.id) || [];
      if (salesPrice !== undefined && landedCosts.length > 0) {
        const minLandedCost = Math.min(...landedCosts);
        
        // Resolve target margin rule (hierarchy: scope organization_category -> default org margin)
        const categoryRules = marginRules?.filter(r => r.scope === 'organization_category' && r.category_id === p.category_id) || [];
        const targetMargin = categoryRules.length > 0 
          ? Math.max(...categoryRules.map(r => parseFloat(r.target_margin_rate)))
          : defaultRate;

        if (salesPrice > 0) {
          const actualMargin = (salesPrice - minLandedCost) / salesPrice;
          marginSum += actualMargin;
          marginCount++;

          if (actualMargin < targetMargin) {
            atRiskCount++;
            const recommendedRawPrice = minLandedCost / (1 - targetMargin);
            // standard rounding: up 0.05
            const recommendedPrice = Math.ceil(recommendedRawPrice / 0.05) * 0.05;
            const potentialUnitGain = Math.max(0, recommendedPrice - salesPrice);
            totalPotentialProtectedUnitMargin += potentialUnitGain;
          }
        }
      }
    });

    const averageMargin = marginCount > 0 ? marginSum / marginCount : defaultRate;
    
    const openQuoteIds = openQuotes?.map(q => q.id) || [];
    
    let quotePotentialMargin = 0;
    if (openQuoteIds.length > 0) {
      const { data: quoteItems } = await supabase
        .from('quote_items')
        .select('quantity, unit_price, recommended_price')
        .in('quote_id', openQuoteIds);

      quoteItems?.forEach(item => {
        if (item.quantity && item.unit_price && item.recommended_price) {
          const qty = parseFloat(item.quantity);
          const unit = parseFloat(item.unit_price);
          const rec = parseFloat(item.recommended_price);
          if (unit < rec) {
            quotePotentialMargin += (rec - unit) * qty;
          }
        }
      });
    }

    return { 
      data: {
        averageMargin,
        atRiskCount,
        potentialProtectedUnitMargin: totalPotentialProtectedUnitMargin,
        potentialProtectedQuoteMargin: quotePotentialMargin,
        activeQuotesCount: activeQuotesCount || 0
      }
    };
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de calculer les indicateurs.' };
  }
}

export async function getRecentAlerts(orgSlug: string, limit: number = 5) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: alerts, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('organization_id', orgId)
      .eq('status', 'unread')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return { data: alerts };
  } catch (err) {
    console.error('Error fetching recent alerts:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de charger les alertes.' };
  }
}

export async function getRecentCostVariations(orgSlug: string, limit: number = 5) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    // Fetch confirmed imports
    const { data: imports } = await supabase
      .from('price_imports')
      .select('id')
      .eq('organization_id', orgId)
      .eq('status', 'confirmed')
      .order('confirmed_at', { ascending: false })
      .limit(3);

    const importIds = imports?.map(imp => imp.id) || [];

    if (importIds.length === 0) {
      return { data: [] };
    }

    // Fetch price snapshots associated with these imports
    const { data: snapshots, error } = await supabase
      .from('price_snapshots')
      .select('*, supplier_products(supplier_sku, products(name), suppliers(name))')
      .eq('organization_id', orgId)
      .in('price_import_id', importIds)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const variations = snapshots?.map(snap => {
      const prodName = snap.supplier_products?.products?.name || 'Produit';
      const suppName = snap.supplier_products?.suppliers?.name || 'Fournisseur';
      const landed = snap.landed_cost ? parseFloat(snap.landed_cost) : 0;
      const base = snap.purchase_price ? parseFloat(snap.purchase_price) : 0;
      
      return {
        id: snap.id,
        productName: prodName,
        supplierName: suppName,
        sku: snap.supplier_products?.supplier_sku || 'SKU',
        landedCost: landed,
        purchasePrice: base,
        createdAt: snap.created_at,
      };
    });

    return { data: variations || [] };
  } catch (err) {
    console.error('Error fetching recent cost variations:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de charger les variations de coût.' };
  }
}

export async function getRecentQuotes(orgSlug: string, limit: number = 5) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: quotes, error } = await supabase
      .from('quotes')
      .select('*, customers(legal_name)')
      .eq('organization_id', orgId)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return { data: quotes };
  } catch (err) {
    console.error('Error fetching recent quotes:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de charger les devis récents.' };
  }
}

export async function markAlertStatus(orgSlug: string, alertId: string, status: 'read' | 'resolved') {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const updatePayload: Record<string, any> = { status };
    if (status === 'read') updatePayload.read_at = new Date().toISOString();
    if (status === 'resolved') updatePayload.resolved_at = new Date().toISOString();

    const { error } = await supabase
      .from('alerts')
      .update(updatePayload)
      .eq('organization_id', orgId)
      .eq('id', alertId);

    if (error) throw error;

    revalidatePath(`/${orgSlug}`);
    return { success: true };
  } catch (err) {
    console.error('Error marking alert status:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de mettre à jour l\'alerte.' };
  }
}
