'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { SupabaseClient } from '@supabase/supabase-js';
import { PricingEngine } from '@/domain/PricingEngine';
import { Decimal } from 'decimal.js';
import { logAuditEvent } from './audit';

// Helper to get organization ID and verify membership
async function getOrgId(supabase: SupabaseClient, orgSlug: string): Promise<string> {
  const { data: org, error } = await supabase
    .from('organizations')
    .select('id, default_margin_rate, default_rounding_rule')
    .eq('slug', orgSlug)
    .single();

  if (error || !org) {
    throw new Error('Organisation introuvable ou accès non autorisé.');
  }

  return org.id;
}

// Get user role in organization
async function getUserRole(supabase: SupabaseClient, orgId: string, userId: string): Promise<string> {
  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  return membership?.role || 'viewer';
}

export async function getQuotes(orgSlug: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: quotes, error } = await supabase
      .from('quotes')
      .select('*, customers(legal_name)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data: quotes };
  } catch (err) {
    console.error('Error fetching quotes:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de charger les devis.' };
  }
}

export async function getQuoteById(orgSlug: string, id: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const [quoteResult, itemsResult] = await Promise.all([
      supabase
        .from('quotes')
        .select('*, customers(legal_name, primary_email)')
        .eq('organization_id', orgId)
        .eq('id', id)
        .single(),
      supabase
        .from('quote_items')
        .select('*, products(name, internal_sku, barcode, sales_unit)')
        .eq('organization_id', orgId)
        .eq('quote_id', id)
        .order('position', { ascending: true })
    ]);

    if (quoteResult.error) throw quoteResult.error;
    if (itemsResult.error) throw itemsResult.error;

    return { data: { quote: quoteResult.data, items: itemsResult.data || [] } };
  } catch (err) {
    console.error('Error fetching quote details:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de charger les détails du devis.' };
  }
}

export async function createQuote(orgSlug: string, customerId: string, title: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Utilisateur non connecté.');

    const year = new Date().getFullYear();

    // Generate sequence number BM-YYYY-XXXXX
    const { data: lastQuote, error: seqError } = await supabase
      .from('quotes')
      .select('quote_number')
      .eq('organization_id', orgId)
      .like('quote_number', `BM-${year}-%`)
      .order('quote_number', { ascending: false })
      .limit(1);

    if (seqError) throw seqError;

    let nextNum = 1;
    if (lastQuote && lastQuote.length > 0) {
      const match = lastQuote[0].quote_number.match(/BM-\d{4}-(\d{5})/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }

    const quoteNumber = `BM-${year}-${String(nextNum).padStart(5, '0')}`;

    const { data: quote, error: insertError } = await supabase
      .from('quotes')
      .insert({
        organization_id: orgId,
        quote_number: quoteNumber,
        revision: 1,
        customer_id: customerId,
        title: title || `Devis ${quoteNumber}`,
        status: 'draft',
        issue_date: new Date().toISOString().split('T')[0],
        sales_owner_id: user.id,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    revalidatePath(`/${orgSlug}/quotes`);
    return { success: true, quoteId: quote.id };
  } catch (err) {
    console.error('Error creating quote:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de créer le devis.' };
  }
}

export async function updateQuoteHeader(
  orgSlug: string,
  quoteId: string,
  data: {
    contact_name: string | null;
    contact_email: string | null;
    title: string;
    expires_at: string | null;
    public_note: string | null;
    internal_note: string | null;
    terms: string | null;
    contact_id?: string | null;
    location_id?: string | null;
  }
) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    // Verify it is draft
    const { data: existingQuote } = await supabase
      .from('quotes')
      .select('status')
      .eq('id', quoteId)
      .eq('organization_id', orgId)
      .single();

    if (!existingQuote || existingQuote.status !== 'draft') {
      throw new Error("L'en-tête ne peut être modifié que pour un devis en brouillon.");
    }

    const { error } = await supabase
      .from('quotes')
      .update({
        contact_name: data.contact_name,
        contact_email: data.contact_email,
        title: data.title,
        expires_at: data.expires_at,
        public_note: data.public_note,
        internal_note: data.internal_note,
        terms: data.terms,
        contact_id: data.contact_id || null,
        location_id: data.location_id || null,
      })
      .eq('id', quoteId)
      .eq('organization_id', orgId);

    if (error) throw error;

    revalidatePath(`/${orgSlug}/quotes/${quoteId}`);
    return { success: true };
  } catch (err) {
    console.error('Error updating quote header:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de mettre à jour le devis.' };
  }
}

interface SaveQuoteItemInput {
  product_id: string;
  quantity: number | null;
  unit_price: number;
  discount_rate: number;
  override_justification: string | null;
  position: number;
  description: string | null;
  is_transformed?: boolean;
}

export async function saveQuoteItems(orgSlug: string, quoteId: string, items: SaveQuoteItemInput[]) {
  try {
    const supabase = await createClient();
    
    // 1. Fetch organization settings
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, default_margin_rate, default_rounding_rule, sales_can_override_floor')
      .eq('slug', orgSlug)
      .single();

    if (orgError || !org) throw new Error('Organisation introuvable.');
    const orgId = org.id;

    // Verify draft status
    const { data: quote } = await supabase
      .from('quotes')
      .select('status, customer_id, issue_date')
      .eq('id', quoteId)
      .eq('organization_id', orgId)
      .single();

    if (!quote || quote.status !== 'draft') {
      throw new Error("Les lignes d'articles ne peuvent être modifiées que pour un devis en brouillon.");
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Utilisateur non connecté.');

    const userRole = await getUserRole(supabase, orgId, user.id);
    const isManagerOrAdmin = ['owner', 'admin', 'manager'].includes(userRole);
    const salesCanOverride = org.sales_can_override_floor ?? false;

    // Fetch margin rules for resolving target margin
    const { data: rules } = await supabase
      .from('margin_rules')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true);

    const activeRules = rules || [];

    // Delete existing items for the quote to overwrite
    const { error: deleteError } = await supabase
      .from('quote_items')
      .delete()
      .eq('quote_id', quoteId)
      .eq('organization_id', orgId);
    if (deleteError) throw deleteError;

    let subtotal = new Decimal(0);
    let taxTotal = new Decimal(0);
    let grandTotal = new Decimal(0);
    let hasCompleteQuantities = true;

    for (const item of items) {
      // Fetch product details
      const { data: product } = await supabase
        .from('products')
        .select('*')
        .eq('id', item.product_id)
        .eq('organization_id', orgId)
        .single();
      if (!product) throw new Error(`Produit introuvable : ${item.product_id}`);

      // Fetch active supplier product references for costs
      const { data: sps } = await supabase
        .from('supplier_products')
        .select('current_landed_cost, current_purchase_price, conversion_factor, yield_rate, transport_cost, handling_cost, other_fixed_cost, other_cost_percent')
        .eq('product_id', item.product_id)
        .eq('organization_id', orgId)
        .eq('is_active', true);
      
      let currentLandedCost = 0;
      if (sps && sps.length > 0) {
        const computedCosts = sps.map(sp => {
          const isTransformed = item.is_transformed !== false;
          const spYield = sp.yield_rate ? parseFloat(sp.yield_rate) : 1.0;
          const yieldRate = isTransformed 
            ? (spYield !== 1.0 ? spYield : parseFloat(product.default_yield_rate || '1.0'))
            : 1.0;
          const handlingCost = isTransformed ? parseFloat(sp.handling_cost || '0.0') : 0.0;
          const result = PricingEngine.calculateLandedCost({
            purchasePrice: parseFloat(sp.current_purchase_price || '0'),
            conversionFactor: parseFloat(sp.conversion_factor || '1.0'),
            yieldRate: yieldRate,
            transportCostPerSalesUnit: parseFloat(sp.transport_cost || '0'),
            handlingCostPerSalesUnit: handlingCost,
            otherFixedCostPerSalesUnit: parseFloat(sp.other_fixed_cost || '0'),
            otherCostPercent: parseFloat(sp.other_cost_percent || '0'),
          });
          return result.landedCost.toNumber();
        });
        currentLandedCost = Math.min(...computedCosts);
      }

      // Resolve Margin target
      const resolvedRule = PricingEngine.resolveMarginRule(
        {
          productId: item.product_id,
          categoryId: product.category_id,
          customerId: quote.customer_id,
          referenceDate: quote.issue_date,
        },
        activeRules.map(r => ({
          id: r.id,
          scope: r.scope as 'customer_product' | 'customer_category' | 'customer' | 'organization_category',
          customer_id: r.customer_id,
          category_id: r.category_id,
          product_id: r.product_id,
          target_margin_rate: parseFloat(r.target_margin_rate),
          priority: r.priority,
          is_active: r.is_active,
          valid_from: r.valid_from,
          valid_to: r.valid_to,
        })),
        org.default_margin_rate ? parseFloat(org.default_margin_rate) : 0.20
      );

      // Compute recommended price
      const recResult = PricingEngine.calculateRecommendedPrice(
        currentLandedCost,
        resolvedRule.targetMarginRate,
        org.default_rounding_rule || 'up_0_05'
      );

      // Calculate real margins
      const proposedPrice = new Decimal(item.unit_price);
      const discount = new Decimal(item.discount_rate || 0);
      const netUnitPrice = proposedPrice.mul(new Decimal(1).minus(discount));
      
      const marginCalculations = PricingEngine.calculateMargin(netUnitPrice, currentLandedCost);

      const marginRate = marginCalculations.marginRate ? marginCalculations.marginRate.toNumber() : 0;
      const targetMargin = resolvedRule.targetMarginRate.toNumber();

      // Threshold check (FR-QUO-007)
      if (marginRate < targetMargin) {
        const needsOverride = !isManagerOrAdmin;
        const cannotOverride = needsOverride && !salesCanOverride;

        if (cannotOverride) {
          throw new Error(
            `Le prix de vente proposé pour ${product.name} entraîne une marge (${(marginRate * 100).toFixed(1)}%) inférieure à la cible (${(targetMargin * 100).toFixed(1)}%). En tant que commercial, vous n'êtes pas autorisé à déroger au seuil.`
          );
        } else if (needsOverride && !item.override_justification) {
          throw new Error(
            `Le prix proposé pour ${product.name} est inférieur au seuil cible de marge. Une justification est obligatoire pour valider cette dérogation.`
          );
        }
      }

      // Calculations if quantity is set (FR-QUO-012)
      let lineSubtotal = new Decimal(0);
      if (item.quantity !== null && item.quantity !== undefined) {
        lineSubtotal = netUnitPrice.mul(item.quantity);
        subtotal = subtotal.plus(lineSubtotal);
        const vatRate = new Decimal(product.vat_rate || 0.06);
        const lineTax = lineSubtotal.mul(vatRate);
        taxTotal = taxTotal.plus(lineTax);
        grandTotal = grandTotal.plus(lineSubtotal.plus(lineTax));
      } else {
        hasCompleteQuantities = false;
      }

      // Snapshot structure
      const productSnapshot = {
        name: product.name,
        internal_sku: product.internal_sku,
        barcode: product.barcode,
        sales_unit: product.sales_unit,
      };

      // Insert Quote Item
      const { error: insertError } = await supabase
        .from('quote_items')
        .insert({
          organization_id: orgId,
          quote_id: quoteId,
          position: item.position,
          product_id: item.product_id,
          product_snapshot: productSnapshot,
          description: item.description,
          sales_unit: product.sales_unit,
          quantity: item.quantity,
          is_transformed: item.is_transformed !== false,
          landed_cost_snapshot: currentLandedCost,
          target_margin_rate: targetMargin,
          pricing_rule_source: resolvedRule.source,
          pricing_rule_id: resolvedRule.ruleId || null,
          recommended_price: recResult.recommendedPrice.toNumber(),
          unit_price: item.unit_price,
          discount_rate: item.discount_rate,
          net_unit_price: netUnitPrice.toNumber(),
          margin_amount: marginCalculations.grossMarginAmount.toNumber(),
          margin_rate: marginRate,
          tax_rate: product.vat_rate || 0.06,
          line_subtotal: item.quantity !== null ? lineSubtotal.toNumber() : null,
          override_justification: item.override_justification,
          created_by: user.id,
        });

      if (insertError) throw insertError;
    }

    // 4. Update the quote totals (subtotal, tax_total, grand_total)
    const { error: updateQuoteError } = await supabase
      .from('quotes')
      .update({
        subtotal: hasCompleteQuantities ? subtotal.toNumber() : null,
        tax_total: hasCompleteQuantities ? taxTotal.toNumber() : null,
        grand_total: hasCompleteQuantities ? grandTotal.toNumber() : null,
        has_complete_quantities: hasCompleteQuantities,
      })
      .eq('id', quoteId)
      .eq('organization_id', orgId);

    if (updateQuoteError) throw updateQuoteError;

    revalidatePath(`/${orgSlug}/quotes/${quoteId}`);
    return { success: true };
  } catch (err) {
    console.error('Error saving quote items:', err);
    return { error: err instanceof Error ? err.message : "Impossible d'enregistrer les articles du devis." };
  }
}

export async function lockAndSendQuote(orgSlug: string, quoteId: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Utilisateur non connecté.');

    // Generate random 32-byte public token hash
    // We can use pgcrypto via postgres or generate a safe cryptographed token in TS
    const crypto = await import('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Fetch quote to verify it exists and is draft
    const { data: quote, error: fetchError } = await supabase
      .from('quotes')
      .select('status, expires_at, quote_number, contact_email, customers(primary_email)')
      .eq('id', quoteId)
      .eq('organization_id', orgId)
      .single();

    if (fetchError || !quote) throw new Error('Devis introuvable.');
    if (quote.status !== 'draft') {
      throw new Error("Seul un devis en brouillon peut être verrouillé et envoyé.");
    }

    // Set public token expiration to quote expiration date, or default to 30 days
    const expiresAt = quote.expires_at 
      ? new Date(quote.expires_at).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error: lockError } = await supabase
      .from('quotes')
      .update({
        status: 'sent',
        public_token_hash: tokenHash,
        public_token_expires_at: expiresAt,
        sent_at: new Date().toISOString(),
      })
      .eq('id', quoteId)
      .eq('organization_id', orgId);

    if (lockError) throw lockError;

    // Insert simulated email message in email_messages table
    const recipientEmail = quote.contact_email || (quote.customers as any)?.primary_email;
    const to_emails = recipientEmail ? [recipientEmail] : [];

    await supabase.from('email_messages').insert({
      organization_id: orgId,
      quote_id: quoteId,
      to_emails,
      subject: `Offre commerciale ${quote.quote_number} sur BlueMargin`,
      status: 'logged',
      provider: 'console',
      provider_message_id: token,
      sent_by: user.id,
      sent_at: new Date().toISOString(),
    });

    // Log event in quote_events
    await supabase.from('quote_events').insert({
      organization_id: orgId,
      quote_id: quoteId,
      event_type: 'sent',
      actor_type: 'user',
      actor_user_id: user.id,
      actor_name: user.email,
    });

    // Log to audit logs
    await logAuditEvent(
      orgId,
      user.id,
      'quote_sent',
      'quotes',
      quoteId,
      {
        quoteId,
        quoteNumber: quote.quote_number,
      }
    );

    // Auto follow up task logic
    try {
      const { data: orgSettings } = await supabase
        .from('organizations')
        .select('auto_create_quote_follow_up_task, default_quote_follow_up_delay_days')
        .eq('id', orgId)
        .single();

      if (orgSettings?.auto_create_quote_follow_up_task) {
        const delayDays = orgSettings.default_quote_follow_up_delay_days ?? 3;
        const dueAt = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000).toISOString();

        const { data: fullQuote } = await supabase
          .from('quotes')
          .select('quote_number, revision, customer_id, contact_id, location_id, sales_owner_id')
          .eq('id', quoteId)
          .single();

        if (fullQuote) {
          const { TaskService } = await import('@/domain/crm/TaskService');
          await TaskService.createTask(supabase, {
            organizationId: orgId,
            customerId: fullQuote.customer_id,
            locationId: fullQuote.location_id,
            contactId: fullQuote.contact_id,
            quoteId: quoteId,
            title: `Relance Devis ${fullQuote.quote_number} (R${fullQuote.revision})`,
            description: `Tâche automatique de relance du devis ${fullQuote.quote_number}.`,
            taskType: 'quote_follow_up',
            priority: 'normal',
            dueAt,
            assignedTo: fullQuote.sales_owner_id,
            automationKey: `quote-followup:${quoteId}:rev:${fullQuote.revision}`
          }, user.id);
        }
      }
    } catch (err) {
      console.error('Failed to create auto quote follow up task:', err);
    }

    revalidatePath(`/${orgSlug}/quotes/${quoteId}`);
    return { success: true, token };
  } catch (err) {
    console.error('Error locking quote:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de verrouiller le devis.' };
  }
}

export async function reviseQuote(orgSlug: string, quoteId: string, refreshCosts: boolean) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Utilisateur non connecté.');

    // Fetch existing quote and items
    const { data: quote, error: qError } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', quoteId)
      .eq('organization_id', orgId)
      .single();
    if (qError || !quote) throw new Error('Devis introuvable.');

    if (quote.status === 'draft') {
      throw new Error("Un devis au statut brouillon ne peut pas faire l'objet d'une révision (il est déjà modifiable).");
    }

    const { data: items, error: iError } = await supabase
      .from('quote_items')
      .select('*')
      .eq('quote_id', quoteId)
      .eq('organization_id', orgId);
    if (iError) throw iError;

    const nextRevision = (quote.revision || 1) + 1;

    // Cancel older active revision or update status
    await supabase
      .from('quotes')
      .update({ status: 'cancelled' })
      .eq('id', quoteId);

    // Cancel outstanding follow-up tasks of the old revision
    await supabase
      .from('tasks')
      .update({
        status: 'cancelled',
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', orgId)
      .eq('quote_id', quoteId)
      .in('status', ['open', 'in_progress']);

    // Create new quote row with incremented revision
    const { data: newQuote, error: insertError } = await supabase
      .from('quotes')
      .insert({
        organization_id: orgId,
        quote_number: quote.quote_number,
        revision: nextRevision,
        parent_quote_id: quote.id,
        customer_id: quote.customer_id,
        contact_name: quote.contact_name,
        contact_email: quote.contact_email,
        title: `${quote.title.split(' (R')[0]} (Rev ${nextRevision})`,
        status: 'draft',
        issue_date: new Date().toISOString().split('T')[0],
        expires_at: quote.expires_at,
        currency: quote.currency,
        public_note: quote.public_note,
        internal_note: quote.internal_note,
        terms: quote.terms,
        sales_owner_id: user.id,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Copy items to new revision
    for (const item of items) {
      let landedCost = parseFloat(item.landed_cost_snapshot || '0');
      let recPrice = parseFloat(item.recommended_price || '0');

      if (refreshCosts) {
        // Fetch product's default yield rate
        const { data: prod } = await supabase
          .from('products')
          .select('default_yield_rate')
          .eq('id', item.product_id)
          .single();

        // Fetch fresh costs
        const { data: sps } = await supabase
          .from('supplier_products')
          .select('current_landed_cost, current_purchase_price, conversion_factor, yield_rate, transport_cost, handling_cost, other_fixed_cost, other_cost_percent')
          .eq('product_id', item.product_id)
          .eq('organization_id', orgId)
          .eq('is_active', true);
        
        let freshLanded = 0;
        if (sps && sps.length > 0) {
          const computedCosts = sps.map(sp => {
            const isTransformed = item.is_transformed !== false;
            const spYield = sp.yield_rate ? parseFloat(sp.yield_rate) : 1.0;
            const yieldRate = isTransformed 
              ? (spYield !== 1.0 ? spYield : parseFloat(prod?.default_yield_rate || '1.0'))
              : 1.0;
            const handlingCost = isTransformed ? parseFloat(sp.handling_cost || '0.0') : 0.0;
            const result = PricingEngine.calculateLandedCost({
              purchasePrice: parseFloat(sp.current_purchase_price || '0'),
              conversionFactor: parseFloat(sp.conversion_factor || '1.0'),
              yieldRate: yieldRate,
              transportCostPerSalesUnit: parseFloat(sp.transport_cost || '0'),
              handlingCostPerSalesUnit: handlingCost,
              otherFixedCostPerSalesUnit: parseFloat(sp.other_fixed_cost || '0'),
              otherCostPercent: parseFloat(sp.other_cost_percent || '0'),
            });
            return result.landedCost.toNumber();
          });
          freshLanded = Math.min(...computedCosts);
        }

        landedCost = freshLanded;
        
        // Recalculate recommended price using default settings
        const orgInfo = await supabase
          .from('organizations')
          .select('default_rounding_rule')
          .eq('id', orgId)
          .single();
        const rule = orgInfo.data?.default_rounding_rule || 'up_0_05';

        const recResult = PricingEngine.calculateRecommendedPrice(
          landedCost,
          item.target_margin_rate,
          rule
        );
        recPrice = recResult.recommendedPrice.toNumber();
      }

      // Calculate net unit price and real margin
      const proposed = new Decimal(item.unit_price);
      const discount = new Decimal(item.discount_rate || 0);
      const net = proposed.mul(new Decimal(1).minus(discount));
      const marginCalculations = PricingEngine.calculateMargin(net, landedCost);

      await supabase.from('quote_items').insert({
        organization_id: orgId,
        quote_id: newQuote.id,
        position: item.position,
        product_id: item.product_id,
        product_snapshot: item.product_snapshot,
        description: item.description,
        sales_unit: item.sales_unit,
        quantity: item.quantity,
        is_transformed: item.is_transformed !== false,
        landed_cost_snapshot: landedCost,
        target_margin_rate: item.target_margin_rate,
        pricing_rule_source: item.pricing_rule_source,
        pricing_rule_id: item.pricing_rule_id,
        recommended_price: recPrice,
        unit_price: item.unit_price,
        discount_rate: item.discount_rate,
        net_unit_price: net.toNumber(),
        margin_amount: marginCalculations.grossMarginAmount.toNumber(),
        margin_rate: marginCalculations.marginRate ? marginCalculations.marginRate.toNumber() : 0,
        tax_rate: item.tax_rate || 0.06,
        line_subtotal: item.quantity !== null ? net.mul(item.quantity).toNumber() : null,
        override_justification: item.override_justification,
        created_by: user.id,
      });
    }

    // Log revision event
    await supabase.from('quote_events').insert({
      organization_id: orgId,
      quote_id: quote.id,
      event_type: 'revised',
      actor_type: 'user',
      actor_user_id: user.id,
      actor_name: user.email,
      metadata: { newQuoteId: newQuote.id },
    });

    // Log to audit logs
    await logAuditEvent(
      orgId,
      user.id,
      'quote_revised',
      'quotes',
      quote.id,
      {
        oldQuoteId: quote.id,
        newQuoteId: newQuote.id,
        quoteNumber: quote.quote_number,
        revision: nextRevision,
      }
    );

    revalidatePath(`/${orgSlug}/quotes`);
    return { success: true, newQuoteId: newQuote.id };
  } catch (err) {
    console.error('Error revising quote:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de créer la révision du devis.' };
  }
}

export async function duplicateQuote(orgSlug: string, quoteId: string, newCustomerId: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Utilisateur non connecté.');

    const { data: quote, error: qError } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', quoteId)
      .eq('organization_id', orgId)
      .single();
    if (qError || !quote) throw new Error('Devis introuvable.');

    const { data: items, error: iError } = await supabase
      .from('quote_items')
      .select('*')
      .eq('quote_id', quoteId)
      .eq('organization_id', orgId);
    if (iError) throw iError;

    const year = new Date().getFullYear();

    // Generate sequence number BM-YYYY-XXXXX
    const { data: lastQuote } = await supabase
      .from('quotes')
      .select('quote_number')
      .eq('organization_id', orgId)
      .like('quote_number', `BM-${year}-%`)
      .order('quote_number', { ascending: false })
      .limit(1);

    let nextNum = 1;
    if (lastQuote && lastQuote.length > 0) {
      const match = lastQuote[0].quote_number.match(/BM-\d{4}-(\d{5})/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }
    const quoteNumber = `BM-${year}-${String(nextNum).padStart(5, '0')}`;

    // Create cloned quote row
    const { data: newQuote, error: insertError } = await supabase
      .from('quotes')
      .insert({
        organization_id: orgId,
        quote_number: quoteNumber,
        revision: 1,
        customer_id: newCustomerId,
        title: `Copie de ${quote.quote_number} - ${quote.title}`,
        status: 'draft',
        issue_date: new Date().toISOString().split('T')[0],
        expires_at: quote.expires_at,
        currency: quote.currency,
        public_note: quote.public_note,
        internal_note: quote.internal_note,
        terms: quote.terms,
        sales_owner_id: user.id,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Fetch margin rules for recalculation
    const { data: rules } = await supabase
      .from('margin_rules')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true);
    const activeRules = rules || [];

    // Copy items with recalculated cibles for the new customer
    for (const item of items) {
      // Find category of product
      const { data: prod } = await supabase
        .from('products')
        .select('category_id')
        .eq('id', item.product_id)
        .single();
      const catId = prod?.category_id || null;

      // Resolve Margin target for new customer
      const resolvedRule = PricingEngine.resolveMarginRule(
        {
          productId: item.product_id,
          categoryId: catId,
          customerId: newCustomerId,
          referenceDate: newQuote.issue_date,
        },
        activeRules.map(r => ({
          id: r.id,
          scope: r.scope as 'customer_product' | 'customer_category' | 'customer' | 'organization_category',
          customer_id: r.customer_id,
          category_id: r.category_id,
          product_id: r.product_id,
          target_margin_rate: parseFloat(r.target_margin_rate),
          priority: r.priority,
          is_active: r.is_active,
          valid_from: r.valid_from,
          valid_to: r.valid_to,
        })),
        0.20 // default fallback
      );

      // Recalculate recommended price
      const recResult = PricingEngine.calculateRecommendedPrice(
        item.landed_cost_snapshot,
        resolvedRule.targetMarginRate,
        'up_0_05'
      );

      // Cloned item values
      const proposed = new Decimal(item.unit_price);
      const discount = new Decimal(item.discount_rate || 0);
      const net = proposed.mul(new Decimal(1).minus(discount));
      const marginCalculations = PricingEngine.calculateMargin(net, item.landed_cost_snapshot);

      await supabase.from('quote_items').insert({
        organization_id: orgId,
        quote_id: newQuote.id,
        position: item.position,
        product_id: item.product_id,
        product_snapshot: item.product_snapshot,
        description: item.description,
        sales_unit: item.sales_unit,
        quantity: item.quantity,
        is_transformed: item.is_transformed !== false,
        landed_cost_snapshot: item.landed_cost_snapshot,
        target_margin_rate: resolvedRule.targetMarginRate.toNumber(),
        pricing_rule_source: resolvedRule.source,
        pricing_rule_id: resolvedRule.ruleId || null,
        recommended_price: recResult.recommendedPrice.toNumber(),
        unit_price: item.unit_price,
        discount_rate: item.discount_rate,
        net_unit_price: net.toNumber(),
        margin_amount: marginCalculations.grossMarginAmount.toNumber(),
        margin_rate: marginCalculations.marginRate ? marginCalculations.marginRate.toNumber() : 0,
        tax_rate: item.tax_rate || 0.06,
        line_subtotal: item.quantity !== null ? net.mul(item.quantity).toNumber() : null,
        override_justification: item.override_justification,
        created_by: user.id,
      });
    }

    revalidatePath(`/${orgSlug}/quotes`);
    return { success: true, newQuoteId: newQuote.id };
  } catch (err) {
    console.error('Error duplicating quote:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de dupliquer le devis.' };
  }
}
