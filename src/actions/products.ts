'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { SupabaseClient } from '@supabase/supabase-js';
import { logAuditEvent } from './audit';

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

export async function getProducts(orgSlug: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('organization_id', orgId)
      .order('name');

    if (error) throw error;
    return { data: products };
  } catch (err) {
    console.error('Error fetching products:', err);
    const message = err instanceof Error ? err.message : 'Impossible de charger les produits.';
    return { error: message };
  }
}

export async function getProductById(orgSlug: string, id: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const [productResult, supplierResult] = await Promise.all([
      supabase
        .from('products')
        .select('*')
        .eq('organization_id', orgId)
        .eq('id', id)
        .single(),
      supabase
        .from('view_supplier_products')
        .select('*, suppliers(name)')
        .eq('organization_id', orgId)
        .eq('product_id', id)
    ]);

    if (productResult.error) throw productResult.error;
    if (supplierResult.error) throw supplierResult.error;

    return { data: { ...productResult.data, suppliers: supplierResult.data || [] } };
  } catch (err) {
    console.error('Error fetching product details:', err);
    const message = err instanceof Error ? err.message : 'Impossible de charger les détails du produit.';
    return { error: message };
  }
}

export async function createProduct(orgSlug: string, formData: FormData) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const name = formData.get('name') as string;
    const sku = formData.get('internal_sku') as string;
    const barcode = formData.get('barcode') as string;
    const categoryId = formData.get('category_id') as string;
    const salesUnit = formData.get('sales_unit') as string;
    const defaultYieldRate = parseFloat(formData.get('default_yield_rate') as string || '1.0');

    if (!name || !sku) throw new Error('Le nom et le SKU interne du produit sont obligatoires.');

    const { data, error } = await supabase
      .from('products')
      .insert({
        organization_id: orgId,
        name,
        internal_sku: sku,
        barcode: barcode || null,
        category_id: categoryId || null,
        sales_unit: salesUnit || 'kg',
        default_yield_rate: defaultYieldRate,
      })
      .select()
      .single();

    if (error) throw error;

    revalidatePath(`/${orgSlug}/products`);
    return { success: true, data };
  } catch (err) {
    console.error('Error creating product:', err);
    const message = err instanceof Error ? err.message : 'Impossible de créer le produit.';
    return { error: message };
  }
}

export async function updateProduct(orgSlug: string, id: string, formData: FormData) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const name = formData.get('name') as string;
    const sku = formData.get('internal_sku') as string;
    const barcode = formData.get('barcode') as string;
    const categoryId = formData.get('category_id') as string;
    const salesUnit = formData.get('sales_unit') as string;
    const defaultYieldRate = parseFloat(formData.get('default_yield_rate') as string || '1.0');
    const isActive = formData.get('isActive') === 'true';

    if (!name || !sku) throw new Error('Le nom et le SKU interne du produit sont obligatoires.');

    const { data, error } = await supabase
      .from('products')
      .update({
        name,
        internal_sku: sku,
        barcode: barcode || null,
        category_id: categoryId || null,
        sales_unit: salesUnit || 'kg',
        default_yield_rate: defaultYieldRate,
        is_active: isActive,
      })
      .eq('organization_id', orgId)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    revalidatePath(`/${orgSlug}/products`);
    revalidatePath(`/${orgSlug}/products/${id}`);
    return { success: true, data };
  } catch (err) {
    console.error('Error updating product:', err);
    const message = err instanceof Error ? err.message : 'Impossible de modifier le produit.';
    return { error: message };
  }
}

export async function deleteProduct(orgSlug: string, id: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    // Fetch product to get its name (and check existence)
    const { data: product, error: fetchError } = await supabase
      .from('products')
      .select('name')
      .eq('organization_id', orgId)
      .eq('id', id)
      .single();

    if (fetchError || !product) {
      throw new Error('Produit introuvable.');
    }

    // Check if product is referenced in quote items
    const { count, error: countError } = await supabase
      .from('quote_items')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('product_id', id);

    if (countError) throw countError;

    const hasQuotes = (count ?? 0) > 0;
    let actionType = 'product_deleted';

    if (hasQuotes) {
      actionType = 'product_archived';
      const { error: updateError } = await supabase
        .from('products')
        .update({ is_active: false })
        .eq('organization_id', orgId)
        .eq('id', id);
      if (updateError) throw updateError;
    } else {
      const { error: deleteError } = await supabase
        .from('products')
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
      'products',
      id,
      { name: product.name }
    );

    revalidatePath(`/${orgSlug}/products`);
    revalidatePath(`/${orgSlug}/products/${id}`);
    return { success: true };
  } catch (err) {
    console.error('Error deleting product:', err);
    const message = err instanceof Error ? err.message : 'Impossible de supprimer le produit.';
    return { error: message };
  }
}

export async function linkSupplierToProduct(
  orgSlug: string,
  productId: string,
  supplierId: string,
  purchaseUnit: string,
  purchasePrice: number,
  landedCost: number,
  supplierSku?: string,
  transportCost: number = 0,
  handlingCost: number = 0,
  otherFixedCost: number = 0,
  otherCostPercent: number = 0
) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data, error } = await supabase
      .from('supplier_products')
      .insert({
        organization_id: orgId,
        product_id: productId,
        supplier_id: supplierId,
        purchase_unit: purchaseUnit || 'kg',
        current_purchase_price: purchasePrice,
        current_landed_cost: landedCost,
        supplier_sku: supplierSku || null,
        transport_cost: transportCost,
        handling_cost: handlingCost,
        other_fixed_cost: otherFixedCost,
        other_cost_percent: otherCostPercent,
      })
      .select()
      .single();

    if (error) throw error;

    revalidatePath(`/${orgSlug}/products/${productId}`);
    return { success: true, data };
  } catch (err) {
    console.error('Error linking supplier to product:', err);
    const message = err instanceof Error ? err.message : 'Impossible d\'associer le fournisseur.';
    return { error: message };
  }
}

export async function unlinkSupplierFromProduct(orgSlug: string, productId: string, supplierProductId: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { error } = await supabase
      .from('supplier_products')
      .delete()
      .eq('organization_id', orgId)
      .eq('id', supplierProductId);

    if (error) throw error;

    revalidatePath(`/${orgSlug}/products/${productId}`);
    return { success: true };
  } catch (err) {
    console.error('Error unlinking supplier from product:', err);
    const message = err instanceof Error ? err.message : 'Impossible de dissocier le fournisseur.';
    return { error: message };
  }
}

export async function updateProductAvailability(
  orgSlug: string,
  id: string,
  fields: { is_available?: boolean; in_stock_ghlin?: boolean }
) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data, error } = await supabase
      .from('products')
      .update(fields)
      .eq('organization_id', orgId)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    revalidatePath(`/${orgSlug}/stock`);
    revalidatePath(`/${orgSlug}/products`);
    return { success: true, data };
  } catch (err) {
    console.error('Error updating product availability:', err);
    const message = err instanceof Error ? err.message : 'Impossible de modifier la disponibilité du produit.';
    return { error: message };
  }
}

export async function bulkUpdateYieldRate(orgSlug: string, productIds: string[], yieldRate: number) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    if (!productIds || productIds.length === 0) {
      throw new Error('Aucun produit sélectionné.');
    }

    const { data, error } = await supabase
      .from('products')
      .update({ default_yield_rate: yieldRate })
      .eq('organization_id', orgId)
      .in('id', productIds);

    if (error) throw error;

    // Loguer l'audit
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await logAuditEvent(
        orgId,
        user?.id || null,
        'BULK_UPDATE_YIELD_RATE',
        'products',
        null,
        { product_ids: productIds, default_yield_rate: yieldRate }
      );
    } catch (auditErr) {
      console.error('Error logging audit event:', auditErr);
    }

    revalidatePath(`/${orgSlug}/products`);
    revalidatePath(`/${orgSlug}/stock`);

    return { success: true };
  } catch (err) {
    console.error('Error bulk updating yield rates:', err);
    const message = err instanceof Error ? err.message : 'Impossible de modifier les rendements en masse.';
    return { error: message };
  }
}

