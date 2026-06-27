'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { SupabaseClient } from '@supabase/supabase-js';
import { ImportParser } from '@/domain/ImportParser';
import { ProductMatcher, MatchingResult } from '@/domain/ProductMatcher';
import { PricingEngine } from '@/domain/PricingEngine';
import { logAuditEvent } from './audit';
import { AiDocumentParser } from '@/lib/ai';

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

export async function getImports(orgSlug: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: imports, error } = await supabase
      .from('price_imports')
      .select('*, suppliers(name)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data: imports };
  } catch (err) {
    console.error('Error fetching imports:', err);
    const message = err instanceof Error ? err.message : 'Impossible de charger les importations.';
    return { error: message };
  }
}

export async function getImportDetails(orgSlug: string, importId: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    // Fetch import
    const { data: priceImport, error: impError } = await supabase
      .from('price_imports')
      .select('*, suppliers(name)')
      .eq('organization_id', orgId)
      .eq('id', importId)
      .single();
    if (impError) throw impError;

    // Fetch rows
    const { data: rows, error: rowsError } = await supabase
      .from('price_import_rows')
      .select('*, products(name, internal_sku)')
      .eq('organization_id', orgId)
      .eq('price_import_id', importId)
      .order('row_number', { ascending: true });
    if (rowsError) throw rowsError;

    return { data: { priceImport, rows } };
  } catch (err) {
    console.error('Error fetching import details:', err);
    const message = err instanceof Error ? err.message : 'Impossible de charger les détails de l\'import.';
    return { error: message };
  }
}

export async function startImport(orgSlug: string, supplierId: string, formData: FormData) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const file = formData.get('file') as File;
    if (!file) throw new Error("Aucun fichier n'a été fourni.");

    const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
    const isImage = file.type.startsWith('image/') || 
      file.name.endsWith('.png') || 
      file.name.endsWith('.jpg') || 
      file.name.endsWith('.jpeg');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Utilisateur non connecté.");

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (isPdf || isImage) {
      // 1. Call AI Parser to extract rows
      const base64Data = buffer.toString('base64');
      const mimeType = file.type || (isPdf ? 'application/pdf' : 'image/jpeg');
      const dataUri = `data:${mimeType};base64,${base64Data}`;
      
      const extracted = await AiDocumentParser.extractTariffData(dataUri, file.name);

      // 2. Insert price_imports with status 'review' and isAi: true
      const { data: imp, error: impError } = await supabase
        .from('price_imports')
        .insert({
          organization_id: orgId,
          supplier_id: supplierId,
          file_name: file.name,
          file_type: mimeType,
          sheet_name: 'IA (Gemini)',
          status: 'review',
          total_rows: extracted.items.length,
          started_by: user.id,
          mapping: { isAi: true }
        })
        .select()
        .single();

      if (impError) throw impError;

      // 3. Fetch products & supplier products for matching
      const { data: products, error: prodError } = await supabase
        .from('products')
        .select('id, name, internal_sku, barcode')
        .eq('organization_id', orgId);
      if (prodError) throw prodError;

      const { data: supplierProducts, error: spError } = await supabase
        .from('supplier_products')
        .select('id, product_id, supplier_sku')
        .eq('organization_id', orgId);
      if (spError) throw spError;

      // 4. Validate and match extracted rows
      let validCount = 0;
      let errorCount = 0;

      const importRows = extracted.items.map((item, idx) => {
        const errors: string[] = [];
        if (!item.label || item.label.trim() === '') {
          errors.push("Le libellé du produit est manquant.");
        }
        if (item.purchase_price === null || item.purchase_price === undefined) {
          errors.push("Le prix d'achat est manquant.");
        } else if (item.purchase_price < 0) {
          errors.push("Le prix d'achat ne peut pas être négatif.");
        }
        if (item.conversion_factor !== null && item.conversion_factor <= 0) {
          errors.push("Le facteur de conversion doit être supérieur à zéro.");
        }
        if (item.yield_rate !== null && (item.yield_rate <= 0 || item.yield_rate > 1.0)) {
          errors.push("Le taux de rendement doit être compris entre 0 et 1 (ex: 0.85 pour 85%).");
        }
        
        const validation_status = errors.length > 0 ? 'error' : 'valid';
        if (validation_status === 'valid') {
          validCount++;
        } else {
          errorCount++;
        }

        let matchResult = {
          status: 'unmatched',
          matchedProductId: null as string | null,
          score: 0,
          method: 'none',
        };

        if (validation_status === 'valid') {
          matchResult = ProductMatcher.match(
            { 
              ean: item.ean ? String(item.ean).trim() : null, 
              sku: item.supplier_sku ? String(item.supplier_sku).trim() : null, 
              label: item.label ? String(item.label).trim() : '' 
            },
            products || [],
            supplierProducts || []
          );
        }

        const normalized_data = {
          supplier_sku: item.supplier_sku,
          ean: item.ean,
          label: item.label,
          purchase_price: item.purchase_price,
          conversion_factor: item.conversion_factor || 1.0,
          yield_rate: item.yield_rate || 1.0,
          effective_date: null,
        };

        return {
          organization_id: orgId,
          price_import_id: imp.id,
          row_number: idx + 1,
          raw_data: [
            item.supplier_sku || '',
            item.ean || '',
            item.label || '',
            item.purchase_price || 0,
            item.purchase_unit || '',
            item.conversion_factor || 1.0,
            item.yield_rate || 1.0
          ] as any,
          supplier_sku: item.supplier_sku,
          ean: item.ean,
          label: item.label,
          purchase_price: item.purchase_price,
          conversion_factor: item.conversion_factor || 1.0,
          yield_rate: item.yield_rate || 1.0,
          validation_status,
          validation_errors: errors,
          match_status: matchResult.status,
          matched_product_id: matchResult.matchedProductId,
          match_score: matchResult.score,
          match_method: matchResult.method,
          normalized_data,
        };
      });

      const chunkSize = 200;
      for (let i = 0; i < importRows.length; i += chunkSize) {
        const chunk = importRows.slice(i, i + chunkSize);
        const { error: rowError } = await supabase.from('price_import_rows').insert(chunk);
        if (rowError) throw rowError;
      }

      await supabase
        .from('price_imports')
        .update({
          valid_rows: validCount,
          error_rows: errorCount,
        })
        .eq('id', imp.id);

      revalidatePath(`/${orgSlug}/imports`);
      revalidatePath(`/${orgSlug}/imports/${imp.id}`);

      return {
        success: true,
        importId: imp.id
      };
    }

    // Default Spreadsheet/CSV processing
    const sheets = ImportParser.parseFile(buffer);
    if (sheets.length === 0) throw new Error("Le fichier ne contient aucune feuille lisible.");

    const mainSheet = sheets[0];

    const { data: imp, error: impError } = await supabase
      .from('price_imports')
      .insert({
        organization_id: orgId,
        supplier_id: supplierId,
        file_name: file.name,
        file_type: file.type,
        sheet_name: mainSheet.name,
        status: 'uploaded',
        total_rows: mainSheet.rows.length,
        started_by: user.id,
      })
      .select()
      .single();

    if (impError) throw impError;

    // Save rows raw data in batches to avoid large payloads
    const importRows = mainSheet.rows.map((row, idx) => ({
      organization_id: orgId,
      price_import_id: imp.id,
      row_number: idx + 1,
      raw_data: row,
      validation_status: 'ignored',
    }));

    const chunkSize = 200;
    for (let i = 0; i < importRows.length; i += chunkSize) {
      const chunk = importRows.slice(i, i + chunkSize);
      const { error: rowError } = await supabase.from('price_import_rows').insert(chunk);
      if (rowError) throw rowError;
    }

    revalidatePath(`/${orgSlug}/imports`);
    return { 
      success: true, 
      importId: imp.id, 
      headers: mainSheet.headers, 
      previewRows: mainSheet.rows.slice(0, 5) 
    };
  } catch (err) {
    console.error('Error starting import:', err);
    const message = err instanceof Error ? err.message : 'Impossible de démarrer l\'importation.';
    return { error: message };
  }
}

export async function saveMappingAndValidate(orgSlug: string, importId: string, mapping: Record<string, string>) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    // Fetch import and rows
    const { error: impError } = await supabase
      .from('price_imports')
      .select('id')
      .eq('organization_id', orgId)
      .eq('id', importId)
      .single();
    if (impError) throw impError;

    const { data: rows, error: rowsError } = await supabase
      .from('price_import_rows')
      .select('*')
      .eq('organization_id', orgId)
      .eq('price_import_id', importId);
    if (rowsError) throw rowsError;

    // Fetch products and supplier products for matching
    const { data: products, error: prodError } = await supabase
      .from('products')
      .select('id, name, internal_sku, barcode')
      .eq('organization_id', orgId);
    if (prodError) throw prodError;

    const { data: supplierProducts, error: spError } = await supabase
      .from('supplier_products')
      .select('id, product_id, supplier_sku')
      .eq('organization_id', orgId);
    if (spError) throw spError;

    let validCount = 0;
    let errorCount = 0;

    const skuIdx = parseInt(mapping.supplierSku, 10);
    const eanIdx = parseInt(mapping.ean, 10);
    const labelIdx = parseInt(mapping.label, 10);
    const priceIdx = parseInt(mapping.purchasePrice, 10);
    const convIdx = mapping.conversionFactor ? parseInt(mapping.conversionFactor, 10) : -1;
    const yieldIdx = mapping.yieldRate ? parseInt(mapping.yieldRate, 10) : -1;
    const dateIdx = mapping.effectiveDate ? parseInt(mapping.effectiveDate, 10) : -1;

    for (const row of rows) {
      const raw = row.raw_data as unknown[];
      const rawSku = skuIdx >= 0 ? raw[skuIdx] as string | number | null | undefined : null;
      const rawEan = eanIdx >= 0 ? raw[eanIdx] as string | number | null | undefined : null;
      const rawLabel = labelIdx >= 0 ? raw[labelIdx] as string | number | null | undefined : null;
      const rawPrice = priceIdx >= 0 ? raw[priceIdx] as string | number | null | undefined : null;
      const rawConv = convIdx >= 0 ? raw[convIdx] as string | number | null | undefined : null;
      const rawYield = yieldIdx >= 0 ? raw[yieldIdx] as string | number | null | undefined : null;
      const rawDate = dateIdx >= 0 ? raw[dateIdx] : null;

      const errors: string[] = [];

      if (!rawLabel) errors.push("Le libellé du produit est manquant.");
      if (rawPrice === null || rawPrice === undefined || rawPrice === '') errors.push("Le prix d'achat est manquant.");

      const label = rawLabel ? String(rawLabel).trim() : '';
      const sku = rawSku ? String(rawSku).trim() : null;
      const ean = rawEan ? String(rawEan).trim() : null;

      const priceNum = ImportParser.parseBelgianNumber(rawPrice);
      if (priceNum === null && rawPrice !== null && rawPrice !== undefined && rawPrice !== '') {
        errors.push(`Format de prix d'achat invalide : ${rawPrice}`);
      } else if (priceNum !== null && priceNum < 0) {
        errors.push("Le prix d'achat ne peut pas être négatif.");
      }

      const conversionFactor = convIdx >= 0 ? (ImportParser.parseBelgianNumber(rawConv) || 1.0) : 1.0;
      if (conversionFactor <= 0) {
        errors.push("Le facteur de conversion doit être supérieur à zéro.");
      }

      const yieldRate = yieldIdx >= 0 ? (ImportParser.parseBelgianNumber(rawYield) || 1.0) : 1.0;
      if (yieldRate <= 0 || yieldRate > 1.0) {
        errors.push("Le taux de rendement doit être compris entre 0 et 1 (ex: 0.85 pour 85%).");
      }

      const effectiveDate = dateIdx >= 0 ? ImportParser.parseDate(rawDate) : null;

      const validation_status = errors.length > 0 ? 'error' : 'valid';
      if (validation_status === 'valid') {
        validCount++;
      } else {
        errorCount++;
      }

      let matchResult: MatchingResult = {
        status: 'unmatched',
        matchedProductId: null,
        score: 0,
        method: 'none',
        candidates: [],
      };

      if (validation_status === 'valid') {
        matchResult = ProductMatcher.match(
          { ean, sku, label },
          products || [],
          supplierProducts || []
        );
      }

      const normalized_data = {
        supplier_sku: sku,
        ean,
        label,
        purchase_price: priceNum,
        conversion_factor: conversionFactor,
        yield_rate: yieldRate,
        effective_date: effectiveDate ? effectiveDate.toISOString().split('T')[0] : null,
      };

      await supabase
        .from('price_import_rows')
        .update({
          supplier_sku: sku,
          ean,
          label,
          purchase_price: priceNum,
          conversion_factor: conversionFactor,
          yield_rate: yieldRate,
          effective_date: effectiveDate,
          validation_status,
          validation_errors: errors,
          match_status: matchResult.status,
          matched_product_id: matchResult.matchedProductId,
          match_score: matchResult.score,
          match_method: matchResult.method,
          normalized_data,
        })
        .eq('id', row.id);
    }

    await supabase
      .from('price_imports')
      .update({
        status: 'review',
        valid_rows: validCount,
        error_rows: errorCount,
        mapping,
      })
      .eq('id', importId);

    revalidatePath(`/${orgSlug}/imports/${importId}`);
    return { success: true };
  } catch (err) {
    console.error('Error validating import:', err);
    const message = err instanceof Error ? err.message : 'Impossible de valider le fichier d\'import.';
    return { error: message };
  }
}

export async function updateRowMatchDecision(
  orgSlug: string,
  importId: string,
  rowId: string,
  decision: { status: string; productId?: string | null }
) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { error } = await supabase
      .from('price_import_rows')
      .update({
        match_status: decision.status,
        matched_product_id: decision.productId || null,
        match_method: 'manual',
      })
      .eq('organization_id', orgId)
      .eq('price_import_id', importId)
      .eq('id', rowId);

    if (error) throw error;

    revalidatePath(`/${orgSlug}/imports/${importId}`);
    return { success: true };
  } catch (err) {
    console.error('Error updating row match decision:', err);
    const message = err instanceof Error ? err.message : 'Impossible d\'enregistrer votre décision.';
    return { error: message };
  }
}

export async function confirmImport(orgSlug: string, importId: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Utilisateur non connecté.");

    // Fetch import details
    const { data: imp, error: impError } = await supabase
      .from('price_imports')
      .select('*, suppliers(name, default_transport_cost, default_handling_cost, default_other_fixed_cost, default_other_cost_percent, default_category_id)')
      .eq('organization_id', orgId)
      .eq('id', importId)
      .single();
    if (impError) throw impError;
    const supplierName = imp.suppliers?.name || 'Fournisseur';

    // Fetch all valid rows
    const { data: rows, error: rowsError } = await supabase
      .from('price_import_rows')
      .select('*')
      .eq('organization_id', orgId)
      .eq('price_import_id', importId)
      .eq('validation_status', 'valid');
    if (rowsError) throw rowsError;

    // Fetch organization settings for alert and default margin rate
    const { data: org } = await supabase
      .from('organizations')
      .select('cost_increase_alert_rate, default_margin_rate')
      .eq('id', orgId)
      .single();
    const alertRate = org?.cost_increase_alert_rate ? parseFloat(org.cost_increase_alert_rate) : 0.05;
    const defaultOrgMarginRate = org?.default_margin_rate ? parseFloat(org.default_margin_rate) : 0.20;

    // Fetch active margin rules for the organization
    const { data: rules } = await supabase
      .from('margin_rules')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true);
    const activeRules = rules || [];

    for (const row of rows) {
      // Ignore ignored rows or rows without matched product
      if (row.match_status === 'ignored' || (!row.matched_product_id && row.match_status !== 'create_new')) {
        continue;
      }

      let productId = row.matched_product_id;

      // 1. Create a new product if match_status is 'create_new'
      if (row.match_status === 'create_new') {
        let existingProductId = null;

        if (row.supplier_sku) {
          // Check if there is already a supplier_product mapping for this supplier and SKU in database
          const { data: existingSpForSku } = await supabase
            .from('supplier_products')
            .select('product_id')
            .eq('organization_id', orgId)
            .eq('supplier_id', imp.supplier_id)
            .eq('supplier_sku', row.supplier_sku)
            .maybeSingle();

          if (existingSpForSku) {
            existingProductId = existingSpForSku.product_id;
          } else {
            // Check if there is a product with this internal_sku in database
            const { data: existingProd } = await supabase
              .from('products')
              .select('id')
              .eq('organization_id', orgId)
              .eq('internal_sku', row.supplier_sku)
              .maybeSingle();

            if (existingProd) {
              existingProductId = existingProd.id;
            }
          }
        }

        if (existingProductId) {
          productId = existingProductId;
        } else {
          const defaultCategoryId = imp?.suppliers && 'default_category_id' in (imp.suppliers as any)
            ? (imp.suppliers as any).default_category_id
            : null;

          const { data: newProd, error: newProdError } = await supabase
            .from('products')
            .insert({
              organization_id: orgId,
              name: row.label,
              internal_sku: row.supplier_sku || `SKU-${Date.now()}-${row.row_number}`,
              barcode: row.ean || null,
              sales_unit: 'kg', // default unit
              default_yield_rate: row.yield_rate || 1.0,
              is_active: true,
              category_id: defaultCategoryId || null,
            })
            .select()
            .single();

          if (newProdError) throw newProdError;
          productId = newProd.id;
        }
      }

      if (!productId) continue;

      // 2. Fetch existing supplier product reference
      const { data: existingSp } = await supabase
        .from('supplier_products')
        .select('*')
        .eq('organization_id', orgId)
        .eq('supplier_id', imp.supplier_id)
        .eq('product_id', productId)
        .single();

      // Retrieve previous costs for alert checking or fallback to supplier default costs
      const oldLandedCost = existingSp?.current_landed_cost ? parseFloat(existingSp.current_landed_cost) : null;

      const defaultTransport = imp?.suppliers && 'default_transport_cost' in (imp.suppliers as any)
        ? parseFloat(String((imp.suppliers as any).default_transport_cost || '0'))
        : 0.0;
      const defaultHandling = imp?.suppliers && 'default_handling_cost' in (imp.suppliers as any)
        ? parseFloat(String((imp.suppliers as any).default_handling_cost || '0'))
        : 0.0;
      const defaultOtherFixed = imp?.suppliers && 'default_other_fixed_cost' in (imp.suppliers as any)
        ? parseFloat(String((imp.suppliers as any).default_other_fixed_cost || '0'))
        : 0.0;
      const defaultOtherPercent = imp?.suppliers && 'default_other_cost_percent' in (imp.suppliers as any)
        ? parseFloat(String((imp.suppliers as any).default_other_cost_percent || '0'))
        : 0.0;

      const transportCost = existingSp
        ? (existingSp.transport_cost ? parseFloat(existingSp.transport_cost) : 0.0)
        : defaultTransport;
      const handlingCost = existingSp
        ? (existingSp.handling_cost ? parseFloat(existingSp.handling_cost) : 0.0)
        : defaultHandling;
      const otherFixedCost = existingSp
        ? (existingSp.other_fixed_cost ? parseFloat(existingSp.other_fixed_cost) : 0.0)
        : defaultOtherFixed;
      const otherCostPercent = existingSp
        ? (existingSp.other_cost_percent ? parseFloat(existingSp.other_cost_percent) : 0.0)
        : defaultOtherPercent;

      // 3. Compute landed cost using domain engine
      const landedResult = PricingEngine.calculateLandedCost({
        purchasePrice: row.purchase_price,
        conversionFactor: row.conversion_factor,
        yieldRate: row.yield_rate || 1.0,
        transportCostPerSalesUnit: transportCost,
        handlingCostPerSalesUnit: handlingCost,
        otherFixedCostPerSalesUnit: otherFixedCost,
        otherCostPercent: otherCostPercent,
      });

      const newLandedCost = landedResult.landedCost.toNumber();
      let supplierProductId = existingSp?.id;

      if (existingSp) {
        // Update existing ref
        const { error: spUpdateError } = await supabase
          .from('supplier_products')
          .update({
            supplier_sku: row.supplier_sku || existingSp.supplier_sku,
            ean: row.ean || existingSp.ean,
            conversion_factor: row.conversion_factor,
            yield_rate: row.yield_rate,
            current_purchase_price: row.purchase_price,
            current_landed_cost: newLandedCost,
            current_price_effective_at: row.effective_date || new Date().toISOString().split('T')[0],
          })
          .eq('id', existingSp.id);

        if (spUpdateError) throw spUpdateError;
      } else {
        // Insert new ref
        const { data: newSp, error: spInsertError } = await supabase
          .from('supplier_products')
          .insert({
            organization_id: orgId,
            supplier_id: imp.supplier_id,
            product_id: productId,
            supplier_sku: row.supplier_sku || null,
            ean: row.ean || null,
            purchase_unit: row.purchase_unit || 'kg',
            conversion_factor: row.conversion_factor,
            yield_rate: row.yield_rate || 1.0,
            current_purchase_price: row.purchase_price,
            current_landed_cost: newLandedCost,
            current_price_effective_at: row.effective_date || new Date().toISOString().split('T')[0],
            transport_cost: transportCost,
            handling_cost: handlingCost,
            other_fixed_cost: otherFixedCost,
            other_cost_percent: otherCostPercent,
          })
          .select()
          .single();

        if (spInsertError) throw spInsertError;
        supplierProductId = newSp.id;
      }

      if (!supplierProductId) continue;

      // 4. Create price snapshot
      const baseUnitCost = row.purchase_price / row.conversion_factor;
      await supabase
        .from('price_snapshots')
        .insert({
          organization_id: orgId,
          supplier_product_id: supplierProductId,
          price_import_id: importId,
          source_row_id: row.id,
          purchase_price: row.purchase_price,
          base_unit_cost: baseUnitCost,
          landed_cost: newLandedCost,
        });

      // 5. Trigger alert if price increased significantly
      if (oldLandedCost !== null && oldLandedCost > 0) {
        const increasePct = (newLandedCost - oldLandedCost) / oldLandedCost;
        if (increasePct > alertRate) {
          const priority = increasePct > 0.15 ? 'high' : 'medium';
          await supabase
            .from('alerts')
            .insert({
              organization_id: orgId,
              type: 'cost_increase',
              priority,
              status: 'unread',
              title: `Hausse de coût importante : ${row.label}`,
              message: `Le coût rendu du produit a augmenté de ${(increasePct * 100).toFixed(1)}% (passant de ${oldLandedCost.toFixed(2)} € à ${newLandedCost.toFixed(2)} €) pour le fournisseur ${supplierName}.`,
              entity_type: 'supplier_products',
              entity_id: supplierProductId,
              metadata: {
                oldLandedCost,
                newLandedCost,
                increasePct,
                supplierName,
                productName: row.label,
              },
            });
        }
      }

      // 5.5. Trigger below_margin alert if necessary
      const { data: product } = await supabase
        .from('products')
        .select('name, category_id')
        .eq('id', productId)
        .single();

      if (product) {
        const { data: salesPriceData } = await supabase
          .from('product_sales_prices')
          .select('sales_price')
          .eq('product_id', productId)
          .is('customer_id', null)
          .eq('is_active', true)
          .maybeSingle();

        if (salesPriceData && salesPriceData.sales_price !== null) {
          const salesPrice = parseFloat(salesPriceData.sales_price);
          if (salesPrice > 0) {
            const currentMargin = (salesPrice - newLandedCost) / salesPrice;

            const resolvedRule = PricingEngine.resolveMarginRule(
              {
                productId: productId,
                categoryId: product.category_id,
                customerId: null,
              },
              activeRules.map(r => ({
                id: r.id,
                scope: r.scope as any,
                customer_id: r.customer_id,
                category_id: r.category_id,
                product_id: r.product_id,
                target_margin_rate: parseFloat(r.target_margin_rate),
                priority: r.priority,
                is_active: r.is_active,
                valid_from: r.valid_from,
                valid_to: r.valid_to,
              })),
              defaultOrgMarginRate
            );

            const targetMarginRate = resolvedRule.targetMarginRate.toNumber();

            if (currentMargin < targetMarginRate) {
              const priority = currentMargin < 0 ? 'critical' : 'high';
              await supabase
                .from('alerts')
                .insert({
                  organization_id: orgId,
                  type: 'below_margin',
                  priority,
                  status: 'unread',
                  title: `Marge insuffisante : ${product.name}`,
                  message: `La marge brute actuelle (${(currentMargin * 100).toFixed(1)}%) est inférieure à la marge cible de ${(targetMarginRate * 100).toFixed(1)}%.`,
                  entity_type: 'products',
                  entity_id: productId,
                  metadata: {
                    currentMargin,
                    targetMargin: targetMarginRate,
                    salesPrice,
                    landedCost: newLandedCost,
                  },
                });
            }
          }
        }
      }
    }

    // 6. Update import status to confirmed
    await supabase
      .from('price_imports')
      .update({
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        confirmed_by: user.id,
      })
      .eq('id', importId);

    // Log to audit logs
    await logAuditEvent(
      orgId,
      user.id,
      'import_confirmed',
      'price_imports',
      importId,
      {
        fileName: imp.file_name,
        totalRows: imp.total_rows,
        validRows: imp.valid_rows,
        errorRows: imp.error_rows,
      }
    );

    revalidatePath(`/${orgSlug}/imports/${importId}`);
    revalidatePath(`/${orgSlug}/products`);
    revalidatePath(`/${orgSlug}/suppliers`);
    
    return { success: true };
  } catch (err) {
    console.error('Error confirming import:', err);
    const message = err instanceof Error ? err.message : 'Impossible de confirmer l\'importation définitive.';
    return { error: message };
  }
}
