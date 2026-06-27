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

export async function getMarginRules(orgSlug: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: rules, error } = await supabase
      .from('margin_rules')
      .select('*, customers(name:legal_name), products(name, internal_sku), product_categories(name)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data: rules };
  } catch (err) {
    console.error('Error fetching margin rules:', err);
    const message = err instanceof Error ? err.message : 'Impossible de charger les règles de marge.';
    return { error: message };
  }
}

async function checkOverlap(
  supabase: SupabaseClient,
  orgId: string,
  ruleId: string | null,
  scope: string,
  customerId: string | null,
  categoryId: string | null,
  productId: string | null,
  validFrom: string | null,
  validTo: string | null
): Promise<void> {
  const targetCustomerId = scope.startsWith('customer') ? customerId : null;
  const targetCategoryId = (scope === 'customer_category' || scope === 'organization_category') ? categoryId : null;
  const targetProductId = scope === 'customer_product' ? productId : null;

  let query = supabase
    .from('margin_rules')
    .select('id, valid_from, valid_to')
    .eq('organization_id', orgId)
    .eq('scope', scope)
    .eq('is_active', true);

  if (ruleId) {
    query = query.neq('id', ruleId);
  }

  if (targetCustomerId) {
    query = query.eq('customer_id', targetCustomerId);
  } else {
    query = query.is('customer_id', null);
  }

  if (targetCategoryId) {
    query = query.eq('category_id', targetCategoryId);
  } else {
    query = query.is('category_id', null);
  }

  if (targetProductId) {
    query = query.eq('product_id', targetProductId);
  } else {
    query = query.is('product_id', null);
  }

  const { data: existingRules, error } = await query;
  if (error) throw error;

  for (const r of existingRules || []) {
    const startA = validFrom;
    const endA = validTo;
    const startB = r.valid_from;
    const endB = r.valid_to;

    // Overlap logic: (StartA <= EndB or EndB is null) and (StartB <= EndA or EndA is null)
    const cond1 = !startA || !endB || startA <= endB;
    const cond2 = !startB || !endA || startB <= endA;

    if (cond1 && cond2) {
      let periodMsg = "cette période";
      if (r.valid_from && r.valid_to) {
        periodMsg = `la période du ${formatFrenchDate(r.valid_from)} au ${formatFrenchDate(r.valid_to)}`;
      } else if (r.valid_from) {
        periodMsg = `la période à partir du ${formatFrenchDate(r.valid_from)}`;
      } else if (r.valid_to) {
        periodMsg = `la période jusqu'au ${formatFrenchDate(r.valid_to)}`;
      } else {
        periodMsg = "toute période (règle permanente)";
      }
      throw new Error(`Une règle de marge active existe déjà pour ce ciblage sur ${periodMsg}.`);
    }
  }
}

function formatFrenchDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

export async function createMarginRule(orgSlug: string, formData: FormData) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const scope = formData.get('scope') as string;
    const targetMarginRate = parseFloat(formData.get('targetMarginRate') as string);
    const customerId = formData.get('customerId') as string || null;
    const categoryId = formData.get('categoryId') as string || null;
    const productId = formData.get('productId') as string || null;
    const priorityStr = formData.get('priority') as string;
    const priority = priorityStr ? parseInt(priorityStr, 10) : 0;

    const validFromStr = formData.get('validFrom') as string || null;
    const validToStr = formData.get('validTo') as string || null;

    let validFrom: string | null = null;
    let validTo: string | null = null;

    if (validFromStr && validFromStr.trim() !== '') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(validFromStr)) {
        throw new Error('Le format de la date de début est incorrect. Utilisez AAAA-MM-JJ.');
      }
      validFrom = validFromStr;
    }

    if (validToStr && validToStr.trim() !== '') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(validToStr)) {
        throw new Error('Le format de la date de fin est incorrect. Utilisez AAAA-MM-JJ.');
      }
      validTo = validToStr;
    }

    if (validFrom && validTo && validFrom > validTo) {
      throw new Error('La date de début doit être antérieure ou égale à la date de fin.');
    }

    if (!scope) throw new Error('Le scope de la règle est obligatoire.');
    if (isNaN(targetMarginRate) || targetMarginRate < 0 || targetMarginRate > 0.95) {
      throw new Error('Le taux de marge cible doit être compris entre 0 et 95% (0.00 et 0.95).');
    }

    // Validate scope constraints
    if (scope === 'customer_product' && (!customerId || !productId)) {
      throw new Error('Pour une règle produit client, le client et le produit sont obligatoires.');
    }
    if (scope === 'customer_category' && (!customerId || !categoryId)) {
      throw new Error('Pour une règle catégorie client, le client et la catégorie sont obligatoires.');
    }
    if (scope === 'customer' && !customerId) {
      throw new Error('Pour une règle client globale, le client est obligatoire.');
    }
    if (scope === 'organization_category' && !categoryId) {
      throw new Error('Pour une règle catégorie globale, la catégorie est obligatoire.');
    }

    // Validate overlap
    await checkOverlap(
      supabase,
      orgId,
      null,
      scope,
      customerId,
      categoryId,
      productId,
      validFrom,
      validTo
    );

    const { data, error } = await supabase
      .from('margin_rules')
      .insert({
        organization_id: orgId,
        scope,
        target_margin_rate: targetMarginRate,
        customer_id: scope.startsWith('customer') ? customerId : null,
        category_id: (scope === 'customer_category' || scope === 'organization_category') ? categoryId : null,
        product_id: scope === 'customer_product' ? productId : null,
        priority,
        is_active: true,
        valid_from: validFrom,
        valid_to: validTo,
      })
      .select()
      .single();

    if (error) throw error;

    const { data: { user } } = await supabase.auth.getUser();
    await logAuditEvent(
      orgId,
      user?.id || null,
      'margin_rule_created',
      'margin_rules',
      data.id,
      {
        scope: data.scope,
        targetMarginRate: data.target_margin_rate,
        customerId: data.customer_id,
        categoryId: data.category_id,
        productId: data.product_id,
        validFrom: data.valid_from,
        validTo: data.valid_to,
      }
    );

    revalidatePath(`/${orgSlug}/margins`);
    return { success: true, data };
  } catch (err) {
    console.error('Error creating margin rule:', err);
    const message = err instanceof Error ? err.message : 'Impossible de créer la règle de marge.';
    return { error: message };
  }
}

export async function updateMarginRule(orgSlug: string, id: string, formData: FormData) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const targetMarginRate = parseFloat(formData.get('targetMarginRate') as string);
    const priorityStr = formData.get('priority') as string;
    const priority = priorityStr ? parseInt(priorityStr, 10) : 0;
    const isActive = formData.get('isActive') === 'true';

    const validFromStr = formData.get('validFrom') as string || null;
    const validToStr = formData.get('validTo') as string || null;

    let validFrom: string | null = null;
    let validTo: string | null = null;

    if (validFromStr && validFromStr.trim() !== '') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(validFromStr)) {
        throw new Error('Le format de la date de début est incorrect. Utilisez AAAA-MM-JJ.');
      }
      validFrom = validFromStr;
    }

    if (validToStr && validToStr.trim() !== '') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(validToStr)) {
        throw new Error('Le format de la date de fin est incorrect. Utilisez AAAA-MM-JJ.');
      }
      validTo = validToStr;
    }

    if (validFrom && validTo && validFrom > validTo) {
      throw new Error('La date de début doit être antérieure ou égale à la date de fin.');
    }

    if (isNaN(targetMarginRate) || targetMarginRate < 0 || targetMarginRate > 0.95) {
      throw new Error('Le taux de marge cible doit être compris entre 0 et 95% (0.00 et 0.95).');
    }

    // Fetch existing rule to get target scope for overlap check
    const { data: existingRule, error: findError } = await supabase
      .from('margin_rules')
      .select('*')
      .eq('organization_id', orgId)
      .eq('id', id)
      .single();

    if (findError || !existingRule) {
      throw new Error('Règle de marge introuvable.');
    }

    // Validate overlap only if active
    if (isActive) {
      await checkOverlap(
        supabase,
        orgId,
        id,
        existingRule.scope,
        existingRule.customer_id,
        existingRule.category_id,
        existingRule.product_id,
        validFrom,
        validTo
      );
    }

    const { data, error } = await supabase
      .from('margin_rules')
      .update({
        target_margin_rate: targetMarginRate,
        priority,
        is_active: isActive,
        valid_from: validFrom,
        valid_to: validTo,
      })
      .eq('organization_id', orgId)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    const { data: { user } } = await supabase.auth.getUser();
    await logAuditEvent(
      orgId,
      user?.id || null,
      'margin_rule_updated',
      'margin_rules',
      data.id,
      {
        targetMarginRate: data.target_margin_rate,
        priority: data.priority,
        isActive: data.is_active,
        validFrom: data.valid_from,
        validTo: data.valid_to,
      }
    );

    revalidatePath(`/${orgSlug}/margins`);
    return { success: true, data };
  } catch (err) {
    console.error('Error updating margin rule:', err);
    const message = err instanceof Error ? err.message : 'Impossible de modifier la règle de marge.';
    return { error: message };
  }
}

export async function deleteMarginRule(orgSlug: string, id: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { error } = await supabase
      .from('margin_rules')
      .delete()
      .eq('organization_id', orgId)
      .eq('id', id);

    if (error) throw error;

    const { data: { user } } = await supabase.auth.getUser();
    await logAuditEvent(
      orgId,
      user?.id || null,
      'margin_rule_deleted',
      'margin_rules',
      id,
      { id }
    );

    revalidatePath(`/${orgSlug}/margins`);
    return { success: true };
  } catch (err) {
    console.error('Error deleting margin rule:', err);
    const message = err instanceof Error ? err.message : 'Impossible de supprimer la règle de marge.';
    return { error: message };
  }
}
