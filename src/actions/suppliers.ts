'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { SupabaseClient } from '@supabase/supabase-js';
import { logAuditEvent } from './audit';
import { PricingEngine } from '@/domain/PricingEngine';

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

export async function getSuppliers(orgSlug: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: suppliers, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('organization_id', orgId)
      .order('name');

    if (error) throw error;
    return { data: suppliers };
  } catch (err) {
    console.error('Error fetching suppliers:', err);
    const message = err instanceof Error ? err.message : 'Impossible de charger les fournisseurs.';
    return { error: message };
  }
}

export async function getSupplierById(orgSlug: string, id: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const [supplierResult, productsResult] = await Promise.all([
      supabase
        .from('suppliers')
        .select('*')
        .eq('organization_id', orgId)
        .eq('id', id)
        .single(),
      supabase
        .from('view_supplier_products')
        .select('*, products(name, internal_sku)')
        .eq('organization_id', orgId)
        .eq('supplier_id', id)
    ]);

    if (supplierResult.error) throw supplierResult.error;
    if (productsResult.error) throw productsResult.error;

    return { data: { ...supplierResult.data, products: productsResult.data || [] } };
  } catch (err) {
    console.error('Error fetching supplier details:', err);
    const message = err instanceof Error ? err.message : 'Impossible de charger les détails du fournisseur.';
    return { error: message };
  }
}

function parseFormFloat(formData: FormData, key: string, divideByHundred: boolean = false): number {
  const val = formData.get(key);
  if (!val) return 0;
  const parsed = parseFloat(val as string);
  return isNaN(parsed) ? 0 : (divideByHundred ? parsed / 100 : parsed);
}

export async function createSupplier(orgSlug: string, formData: FormData) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const name = formData.get('name') as string;
    const code = formData.get('code') as string;
    const email = formData.get('email') as string;
    const phone = formData.get('phone') as string;
    const paymentTerms = formData.get('paymentTerms') as string;
    const notes = formData.get('notes') as string;

    const defaultTransportCost = parseFormFloat(formData, 'defaultTransportCost');
    const defaultHandlingCost = parseFormFloat(formData, 'defaultHandlingCost');
    const defaultOtherFixedCost = parseFormFloat(formData, 'defaultOtherFixedCost');
    const defaultOtherCostPercent = parseFormFloat(formData, 'defaultOtherCostPercent', true);
    const defaultCategoryId = formData.get('defaultCategoryId') as string || null;

    if (!name) throw new Error('Le nom du fournisseur est obligatoire.');

    const { data, error } = await supabase
      .from('suppliers')
      .insert({
        organization_id: orgId,
        name,
        code: code || null,
        email: email || null,
        phone: phone || null,
        payment_terms: paymentTerms || null,
        notes: notes || null,
        default_transport_cost: defaultTransportCost,
        default_handling_cost: defaultHandlingCost,
        default_other_fixed_cost: defaultOtherFixedCost,
        default_other_cost_percent: defaultOtherCostPercent,
        default_category_id: defaultCategoryId || null,
      })
      .select()
      .single();

    if (error) throw error;

    revalidatePath(`/${orgSlug}/suppliers`);
    return { success: true, data };
  } catch (err) {
    console.error('Error creating supplier:', err);
    const message = err instanceof Error ? err.message : 'Impossible de créer le fournisseur.';
    return { error: message };
  }
}

export async function updateSupplier(orgSlug: string, id: string, formData: FormData) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const name = formData.get('name') as string;
    const code = formData.get('code') as string;
    const email = formData.get('email') as string;
    const phone = formData.get('phone') as string;
    const paymentTerms = formData.get('paymentTerms') as string;
    const notes = formData.get('notes') as string;
    const isActive = formData.get('isActive') === 'true';

    const defaultTransportCost = parseFormFloat(formData, 'defaultTransportCost');
    const defaultHandlingCost = parseFormFloat(formData, 'defaultHandlingCost');
    const defaultOtherFixedCost = parseFormFloat(formData, 'defaultOtherFixedCost');
    const defaultOtherCostPercent = parseFormFloat(formData, 'defaultOtherCostPercent', true);
    const defaultCategoryId = formData.get('defaultCategoryId') as string || null;

    if (!name) throw new Error('Le nom du fournisseur est obligatoire.');

    const { data, error } = await supabase
      .from('suppliers')
      .update({
        name,
        code: code || null,
        email: email || null,
        phone: phone || null,
        payment_terms: paymentTerms || null,
        notes: notes || null,
        is_active: isActive,
        default_transport_cost: defaultTransportCost,
        default_handling_cost: defaultHandlingCost,
        default_other_fixed_cost: defaultOtherFixedCost,
        default_other_cost_percent: defaultOtherCostPercent,
        default_category_id: defaultCategoryId || null,
      })
      .eq('organization_id', orgId)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    revalidatePath(`/${orgSlug}/suppliers`);
    revalidatePath(`/${orgSlug}/suppliers/${id}`);
    return { success: true, data };
  } catch (err) {
    console.error('Error updating supplier:', err);
    const message = err instanceof Error ? err.message : 'Impossible de modifier le fournisseur.';
    return { error: message };
  }
}

export async function deleteSupplier(orgSlug: string, id: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    // Fetch supplier to get its name (and check existence)
    const { data: supplier, error: fetchError } = await supabase
      .from('suppliers')
      .select('name')
      .eq('organization_id', orgId)
      .eq('id', id)
      .single();

    if (fetchError || !supplier) {
      throw new Error('Fournisseur introuvable.');
    }

    // Check if supplier has any price imports
    const { count, error: countError } = await supabase
      .from('price_imports')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('supplier_id', id);

    if (countError) throw countError;

    const hasImports = (count ?? 0) > 0;
    let actionType = 'supplier_deleted';

    if (hasImports) {
      actionType = 'supplier_archived';
      const { error: updateError } = await supabase
        .from('suppliers')
        .update({ is_active: false })
        .eq('organization_id', orgId)
        .eq('id', id);
      if (updateError) throw updateError;
    } else {
      const { error: deleteError } = await supabase
        .from('suppliers')
        .delete()
        .eq('organization_id', orgId)
        .eq('id', id);
      if (deleteError) throw deleteError;
    }

    // Log audit event
    const { data: { user } } = await supabase.auth.getUser();
    await logAuditEvent(
      orgId,
      user?.id || null,
      actionType,
      'suppliers',
      id,
      { name: supplier.name }
    );

    revalidatePath(`/${orgSlug}/suppliers`);
    revalidatePath(`/${orgSlug}/suppliers/${id}`);
    return { success: true };
  } catch (err) {
    console.error('Error deleting supplier:', err);
    const message = err instanceof Error ? err.message : 'Impossible de supprimer le fournisseur.';
    return { error: message };
  }
}

export async function applySupplierDefaultsToProducts(orgSlug: string, supplierId: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    // 1. Fetch supplier defaults
    const { data: supplier, error: supplierError } = await supabase
      .from('suppliers')
      .select('default_transport_cost, default_handling_cost, default_other_fixed_cost, default_other_cost_percent, default_category_id')
      .eq('organization_id', orgId)
      .eq('id', supplierId)
      .single();

    if (supplierError || !supplier) {
      throw new Error('Fournisseur introuvable.');
    }

    const defaultTransport = supplier.default_transport_cost ? parseFloat(String(supplier.default_transport_cost)) : 0.0;
    const defaultHandling = supplier.default_handling_cost ? parseFloat(String(supplier.default_handling_cost)) : 0.0;
    const defaultOtherFixed = supplier.default_other_fixed_cost ? parseFloat(String(supplier.default_other_fixed_cost)) : 0.0;
    const defaultOtherPercent = supplier.default_other_cost_percent ? parseFloat(String(supplier.default_other_cost_percent)) : 0.0;

    // 2. Fetch all products associated with this supplier
    const { data: supplierProducts, error: productsError } = await supabase
      .from('supplier_products')
      .select('id, product_id, current_purchase_price, conversion_factor, yield_rate')
      .eq('organization_id', orgId)
      .eq('supplier_id', supplierId);

    if (productsError) throw productsError;

    if (supplierProducts && supplierProducts.length > 0) {
      // 2.5 Bulk update category_id on the products if default_category_id is configured
      if (supplier.default_category_id) {
        const productIds = supplierProducts.map(sp => sp.product_id);
        const { error: bulkCatError } = await supabase
          .from('products')
          .update({ category_id: supplier.default_category_id })
          .in('id', productIds)
          .eq('organization_id', orgId);
        
        if (bulkCatError) throw bulkCatError;
      }

      // 3. Recalculate and update each product
      for (const sp of supplierProducts) {
        const purchasePrice = parseFloat(String(sp.current_purchase_price || '0'));
        const conversionFactor = parseFloat(String(sp.conversion_factor || '1.0'));
        const yieldRate = parseFloat(String(sp.yield_rate || '1.0'));

        const landedResult = PricingEngine.calculateLandedCost({
          purchasePrice,
          conversionFactor,
          yieldRate,
          transportCostPerSalesUnit: defaultTransport,
          handlingCostPerSalesUnit: defaultHandling,
          otherFixedCostPerSalesUnit: defaultOtherFixed,
          otherCostPercent: defaultOtherPercent,
        });

        const { error: updateError } = await supabase
          .from('supplier_products')
          .update({
            transport_cost: defaultTransport,
            handling_cost: defaultHandling,
            other_fixed_cost: defaultOtherFixed,
            other_cost_percent: defaultOtherPercent,
            current_landed_cost: landedResult.landedCost.toNumber(),
          })
          .eq('id', sp.id);

        if (updateError) throw updateError;
      }
    }

    revalidatePath(`/${orgSlug}/suppliers/${supplierId}`);
    revalidatePath(`/${orgSlug}/products`);
    
    return { success: true, count: supplierProducts?.length || 0 };
  } catch (err) {
    console.error('Error applying supplier defaults to products:', err);
    const message = err instanceof Error ? err.message : 'Impossible d\'appliquer les frais par défaut.';
    return { error: message };
  }
}
