'use client';

import React, { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  ArrowLeft, Check, ChevronRight, Search, Plus, 
  AlertTriangle, CheckCircle2, ShieldAlert, 
  Info, Loader2, Eye
} from 'lucide-react';
import { saveMappingAndValidate, updateRowMatchDecision, confirmImport } from '@/actions/imports';
import { ProductMatcher } from '@/domain/ProductMatcher';

interface Product {
  id: string;
  name: string;
  internal_sku: string;
  barcode: string | null;
}

interface PriceImportRow {
  id: string;
  row_number: number;
  raw_data: unknown[];
  normalized_data: Record<string, unknown> | null;
  supplier_sku: string | null;
  ean: string | null;
  label: string | null;
  purchase_price: number | null;
  conversion_factor: number | null;
  yield_rate: number | null;
  effective_date: string | null;
  validation_status: 'valid' | 'warning' | 'error' | 'ignored';
  validation_errors: string[] | null;
  match_status: 'auto_matched' | 'review_required' | 'matched' | 'create_new' | 'ignored' | 'unmatched';
  matched_product_id: string | null;
  match_score: number | null;
  match_method: string | null;
  products?: { name: string; internal_sku: string } | null;
}

interface PriceImport {
  id: string;
  file_name: string;
  sheet_name: string | null;
  status: string;
  total_rows: number | null;
  valid_rows: number | null;
  error_rows: number | null;
  mapping: Record<string, any> | null;
  supplier_id: string;
  suppliers?: { name: string } | null;
  file_type?: string | null;
}

interface ImportDetailsClientProps {
  orgSlug: string;
  importId: string;
  priceImport: PriceImport;
  initialRows: PriceImportRow[];
  products: Product[];
}

export default function ImportDetailsClient({
  orgSlug,
  importId,
  priceImport,
  initialRows,
  products,
}: ImportDetailsClientProps) {
  const router = useRouter();
  const [rows, setRows] = useState<PriceImportRow[]>(initialRows);

  const isAiImport = priceImport.mapping?.isAi === 'true' || priceImport.mapping?.isAi === true;

  const [step, setStep] = useState<1 | 2 | 3>(
    isAiImport
      ? 2
      : (priceImport.status === 'uploaded' || priceImport.status === 'mapping' ? 1 : 2)
  );
  
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Sync rows from server when initialRows updates directly during render
  const [prevInitialRows, setPrevInitialRows] = useState(initialRows);
  if (initialRows !== prevInitialRows) {
    setRows(initialRows);
    setPrevInitialRows(initialRows);
  }

  // Extract columns based on raw data length of first row
  const columnsCount = useMemo(() => {
    if (initialRows.length === 0) return 0;
    const firstRaw = initialRows[0].raw_data;
    return Array.isArray(firstRaw) ? firstRaw.length : 0;
  }, [initialRows]);

  const headers = useMemo(() => {
    return Array.from({ length: columnsCount }, (_, i) => `Colonne ${i + 1}`);
  }, [columnsCount]);

  const previewRows = useMemo(() => {
    return initialRows.slice(0, 5);
  }, [initialRows]);

  // Mapping State
  const [mapping, setMapping] = useState({
    supplierSku: priceImport.mapping?.supplierSku ?? '',
    ean: priceImport.mapping?.ean ?? '',
    label: priceImport.mapping?.label ?? '',
    purchasePrice: priceImport.mapping?.purchasePrice ?? '',
    conversionFactor: priceImport.mapping?.conversionFactor ?? '',
    yieldRate: priceImport.mapping?.yieldRate ?? '',
    effectiveDate: priceImport.mapping?.effectiveDate ?? '',
  });

  const handleMappingChange = (field: string, val: string) => {
    setMapping(prev => ({ ...prev, [field]: val }));
  };

  // Run analysis (Step 1 -> Step 2)
  const handleRunAnalysis = async () => {
    setError(null);
    if (!mapping.label || !mapping.purchasePrice) {
      setError("Les colonnes 'Libellé du produit' et 'Prix d'achat HT' sont obligatoires.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await saveMappingAndValidate(orgSlug, importId, mapping);
        if (result.error) {
          throw new Error(result.error);
        }
        setSuccess("Mapping enregistré et analyse complétée avec succès !");
        setStep(2);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Une erreur est survenue lors de l'analyse.");
      }
    });
  };

  // Step 2 Filter state
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'matched' | 'ignored' | 'errors'>('all');

  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      if (activeTab === 'all') return true;
      if (activeTab === 'pending') {
        return row.validation_status === 'valid' && 
          (row.match_status === 'review_required' || row.match_status === 'unmatched');
      }
      if (activeTab === 'matched') {
        return row.validation_status === 'valid' && 
          (row.match_status === 'auto_matched' || row.match_status === 'matched' || row.match_status === 'create_new');
      }
      if (activeTab === 'ignored') {
        return row.validation_status === 'valid' && row.match_status === 'ignored';
      }
      if (activeTab === 'errors') {
        return row.validation_status === 'error';
      }
      return true;
    });
  }, [rows, activeTab]);

  // Modal State for manual linking
  const [selectedRow, setSelectedRow] = useState<PriceImportRow | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return products.slice(0, 50); // limit for UI performance
    return products.filter(p => 
      p.name.toLowerCase().includes(q) || 
      p.internal_sku.toLowerCase().includes(q) || 
      (p.barcode && p.barcode.toLowerCase().includes(q))
    );
  }, [products, searchQuery]);

  // Compute fuzzy suggestions for a row if no exact match is found
  const suggestions = useMemo(() => {
    if (!selectedRow) return [];
    // Calculate triggers on the fly using ProductMatcher
    const matchRes = ProductMatcher.match(
      { 
        ean: selectedRow.ean, 
        sku: selectedRow.supplier_sku, 
        label: selectedRow.label || '' 
      },
      products,
      []
    );
    return matchRes.candidates;
  }, [selectedRow, products]);

  const handleOpenLinkModal = (row: PriceImportRow) => {
    setSelectedRow(row);
    setSearchQuery(row.label || '');
  };

  const handleUpdateRowDecision = async (rowId: string, status: string, productId: string | null = null) => {
    // Optimistic UI update
    setRows(prev => prev.map(r => {
      if (r.id === rowId) {
        const prod = products.find(p => p.id === productId);
        return {
          ...r,
          match_status: status as 'auto_matched' | 'review_required' | 'matched' | 'create_new' | 'ignored' | 'unmatched',
          matched_product_id: productId,
          products: prod ? { name: prod.name, internal_sku: prod.internal_sku } : null,
          match_method: 'manual',
        };
      }
      return r;
    }));

    try {
      const res = await updateRowMatchDecision(orgSlug, importId, rowId, { status, productId });
      if (res.error) {
        throw new Error(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la mise à jour de l'association.");
      // Rollback on failure
      router.refresh();
    }
  };

  // Step 3 final confirmation
  const handleConfirmImport = async () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const result = await confirmImport(orgSlug, importId);
        if (result.error) {
          throw new Error(result.error);
        }
        setSuccess("L'importation a été confirmée et appliquée avec succès ! Redirection...");
        setTimeout(() => {
          router.push(`/${orgSlug}/imports`);
          router.refresh();
        }, 1500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur lors de la confirmation définitive.");
      }
    });
  };

  // Counters
  const counters = useMemo(() => {
    const total = rows.length;
    const errors = rows.filter(r => r.validation_status === 'error').length;
    const valid = total - errors;
    const pending = rows.filter(r => r.validation_status === 'valid' && (r.match_status === 'review_required' || r.match_status === 'unmatched')).length;
    const matched = rows.filter(r => r.validation_status === 'valid' && (r.match_status === 'auto_matched' || r.match_status === 'matched' || r.match_status === 'create_new')).length;
    const ignored = rows.filter(r => r.validation_status === 'valid' && r.match_status === 'ignored').length;

    return { total, errors, valid, pending, matched, ignored };
  }, [rows]);

  const rowsToConfirm = useMemo(() => {
    return rows.filter(r => r.validation_status === 'valid' && r.match_status !== 'ignored' && (r.matched_product_id || r.match_status === 'create_new'));
  }, [rows]);

  const newProductsCount = useMemo(() => {
    return rows.filter(r => r.validation_status === 'valid' && r.match_status === 'create_new').length;
  }, [rows]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <button 
            onClick={() => router.push(`/${orgSlug}/imports`)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors font-medium mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {"Retour aux imports"}
          </button>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <span>{"Revue de l'import :"}</span>
            <span className="text-primary truncate max-w-[250px]" title={priceImport.file_name}>
              {priceImport.file_name}
            </span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {"Fournisseur : "}
            <span className="font-semibold text-slate-700">{priceImport.suppliers?.name || 'Fournisseur'}</span>
            {priceImport.sheet_name && ` • Feuille : ${priceImport.sheet_name}`}
          </p>
        </div>

        {/* Wizard Steps indicator */}
        <div className="flex items-center gap-2 bg-slate-100/80 backdrop-blur-xs p-1.5 rounded-lg border border-slate-200/50 self-start text-xs font-semibold text-slate-650">
          <button 
            disabled={isPending || isAiImport}
            onClick={() => setStep(1)}
            className={`px-3 py-1 rounded-md transition-all ${step === 1 ? 'bg-white text-primary shadow-xs' : 'hover:text-slate-900 disabled:opacity-75 disabled:cursor-not-allowed'}`}
          >
            {isAiImport ? "1. Extraction IA (Complétée)" : "1. Mapping"}
          </button>
          <ChevronRight className="h-3 w-3 text-slate-400" />
          <button 
            disabled={isPending || (priceImport.status === 'uploaded' && !isAiImport)}
            onClick={() => setStep(2)}
            className={`px-3 py-1 rounded-md transition-all ${step === 2 ? 'bg-white text-primary shadow-xs' : 'hover:text-slate-900 disabled:opacity-50'}`}
          >
            {"2. Revue & Matching"}
          </button>
          <ChevronRight className="h-3 w-3 text-slate-400" />
          <button 
            disabled={isPending || (priceImport.status === 'uploaded' && !isAiImport) || counters.pending > 0}
            onClick={() => setStep(3)}
            className={`px-3 py-1 rounded-md transition-all ${step === 3 ? 'bg-white text-primary shadow-xs' : 'hover:text-slate-900 disabled:opacity-50'}`}
          >
            {"3. Confirmation"}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-250 text-emerald-700 text-sm font-medium flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* ====================================================================== */}
      {/* STEP 1: COLUMN MAPPING                                                 */}
      {/* ====================================================================== */}
      {step === 1 && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Mapping settings card */}
          <div className="xl:col-span-1 bg-white border border-slate-200 rounded-xl shadow-xs p-6 space-y-6">
            <div>
              <h3 className="font-bold text-slate-900 text-base">{"Liaison des colonnes"}</h3>
              <p className="text-xs text-slate-500 mt-1">
                {"Associez les colonnes de votre fichier aux attributs attendus par BlueMargin."}
              </p>
            </div>

            <div className="space-y-4">
              {/* SKU */}
              <div className="grid gap-1.5">
                <Label htmlFor="sku-col" className="text-xs font-semibold text-slate-700 flex justify-between">
                  <span>{"SKU Fournisseur"}</span>
                  <span className="text-slate-400 font-normal">{"(Optionnel)"}</span>
                </Label>
                <select
                  id="sku-col"
                  value={mapping.supplierSku}
                  onChange={(e) => handleMappingChange('supplierSku', e.target.value)}
                  className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">{"Ne pas importer"}</option>
                  {headers.map((h, i) => (
                    <option key={i} value={String(i)}>{`${h} : ${previewRows[0]?.raw_data[i] ?? ''}`}</option>
                  ))}
                </select>
              </div>

              {/* Barcode / EAN */}
              <div className="grid gap-1.5">
                <Label htmlFor="ean-col" className="text-xs font-semibold text-slate-700 flex justify-between">
                  <span>{"Code EAN / Code-barres"}</span>
                  <span className="text-slate-400 font-normal">{"(Optionnel)"}</span>
                </Label>
                <select
                  id="ean-col"
                  value={mapping.ean}
                  onChange={(e) => handleMappingChange('ean', e.target.value)}
                  className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">{"Ne pas importer"}</option>
                  {headers.map((h, i) => (
                    <option key={i} value={String(i)}>{`${h} : ${previewRows[0]?.raw_data[i] ?? ''}`}</option>
                  ))}
                </select>
              </div>

              {/* Label / Designation */}
              <div className="grid gap-1.5">
                <Label htmlFor="label-col" className="text-xs font-semibold text-slate-700 flex justify-between">
                  <span>{"Libellé / Désignation *"}</span>
                  <span className="text-primary font-normal">{"(Requis)"}</span>
                </Label>
                <select
                  id="label-col"
                  value={mapping.label}
                  onChange={(e) => handleMappingChange('label', e.target.value)}
                  required
                  className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring border-primary/50"
                >
                  <option value="">{"Sélectionnez la colonne..."}</option>
                  {headers.map((h, i) => (
                    <option key={i} value={String(i)}>{`${h} : ${previewRows[0]?.raw_data[i] ?? ''}`}</option>
                  ))}
                </select>
              </div>

              {/* Purchase Price */}
              <div className="grid gap-1.5">
                <Label htmlFor="price-col" className="text-xs font-semibold text-slate-700 flex justify-between">
                  <span>{"Prix d'achat HT *"}</span>
                  <span className="text-primary font-normal">{"(Requis)"}</span>
                </Label>
                <select
                  id="price-col"
                  value={mapping.purchasePrice}
                  onChange={(e) => handleMappingChange('purchasePrice', e.target.value)}
                  required
                  className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring border-primary/50"
                >
                  <option value="">{"Sélectionnez la colonne..."}</option>
                  {headers.map((h, i) => (
                    <option key={i} value={String(i)}>{`${h} : ${previewRows[0]?.raw_data[i] ?? ''}`}</option>
                  ))}
                </select>
              </div>

              {/* Conversion factor */}
              <div className="grid gap-1.5">
                <Label htmlFor="conv-col" className="text-xs font-semibold text-slate-700 flex justify-between">
                  <span>{"Facteur de conversion"}</span>
                  <span className="text-slate-400 font-normal">{"(Optionnel - Défaut: 1)"}</span>
                </Label>
                <select
                  id="conv-col"
                  value={mapping.conversionFactor}
                  onChange={(e) => handleMappingChange('conversionFactor', e.target.value)}
                  className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">{"Aucun (1.0)"}</option>
                  {headers.map((h, i) => (
                    <option key={i} value={String(i)}>{`${h} : ${previewRows[0]?.raw_data[i] ?? ''}`}</option>
                  ))}
                </select>
              </div>

              {/* Yield rate */}
              <div className="grid gap-1.5">
                <Label htmlFor="yield-col" className="text-xs font-semibold text-slate-700 flex justify-between">
                  <span>{"Taux de rendement"}</span>
                  <span className="text-slate-400 font-normal">{"(Optionnel - Défaut: 100%)"}</span>
                </Label>
                <select
                  id="yield-col"
                  value={mapping.yieldRate}
                  onChange={(e) => handleMappingChange('yieldRate', e.target.value)}
                  className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">{"Aucun (100%)"}</option>
                  {headers.map((h, i) => (
                    <option key={i} value={String(i)}>{`${h} : ${previewRows[0]?.raw_data[i] ?? ''}`}</option>
                  ))}
                </select>
              </div>

              {/* Effective date */}
              <div className="grid gap-1.5">
                <Label htmlFor="date-col" className="text-xs font-semibold text-slate-700 flex justify-between">
                  <span>{"Date d'effet du tarif"}</span>
                  <span className="text-slate-400 font-normal">{"(Optionnel)"}</span>
                </Label>
                <select
                  id="date-col"
                  value={mapping.effectiveDate}
                  onChange={(e) => handleMappingChange('effectiveDate', e.target.value)}
                  className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">{"Utiliser la date du jour"}</option>
                  {headers.map((h, i) => (
                    <option key={i} value={String(i)}>{`${h} : ${previewRows[0]?.raw_data[i] ?? ''}`}</option>
                  ))}
                </select>
              </div>
            </div>

            <Button
              onClick={handleRunAnalysis}
              disabled={isPending || !mapping.label || !mapping.purchasePrice}
              className="w-full bg-primary hover:bg-primary/95 text-white font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {"Analyse en cours..."}
                </>
              ) : (
                <>
                  {"Valider et Analyser"}
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>

          {/* Preview rows card */}
          <div className="xl:col-span-2 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center gap-2">
              <Eye className="h-4 w-4 text-slate-500" />
              <h3 className="font-bold text-slate-900 text-sm">{"Aperçu du fichier (5 premières lignes)"}</h3>
            </div>

            {previewRows.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                {"Aucune donnée d'aperçu disponible."}
              </div>
            ) : (
              <div className="overflow-x-auto flex-1">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      {headers.map((h, idx) => (
                        <TableHead key={idx} className="font-bold text-slate-700 text-xs border-r border-slate-100 last:border-0 whitespace-nowrap">
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row) => (
                      <TableRow key={row.id} className="hover:bg-slate-50/50">
                        {headers.map((_, colIdx) => {
                          const val = row.raw_data[colIdx];
                          return (
                            <TableCell key={colIdx} className="text-slate-650 text-xs border-r border-slate-100 last:border-0 truncate max-w-[200px]" title={val !== null && val !== undefined ? String(val) : undefined}>
                              {val !== null && val !== undefined ? String(val) : '-'}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="p-4 bg-slate-50/50 border-t border-slate-200 text-[11px] text-slate-500">
              {"L'aperçu vous permet de repérer les en-têtes et le contenu pour configurer les listes de liaison à gauche."}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* STEP 2: REVIEW & PRODUCT MATCHING                                      */}
      {/* ====================================================================== */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Quick stats & mapping edit shortcut */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex flex-wrap gap-6 items-center justify-between shadow-xs">
            <div className="flex flex-wrap gap-4 items-center text-xs font-semibold text-slate-600">
              <div>
                {"Lignes totales : "}
                <span className="text-slate-900 text-sm font-bold font-mono">{counters.total}</span>
              </div>
              <div className="h-4 w-px bg-slate-300" />
              <div>
                {"Valides : "}
                <span className="text-emerald-600 text-sm font-bold font-mono">{counters.valid}</span>
              </div>
              <div className="h-4 w-px bg-slate-300" />
              <div>
                {"À associer : "}
                <span className="text-amber-600 text-sm font-bold font-mono">{counters.pending}</span>
              </div>
              <div className="h-4 w-px bg-slate-300" />
              <div>
                {"Associées : "}
                <span className="text-primary text-sm font-bold font-mono">{counters.matched}</span>
              </div>
              <div className="h-4 w-px bg-slate-300" />
              <div>
                {"Erreurs : "}
                <span className="text-destructive text-sm font-bold font-mono">{counters.errors}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setStep(1)}
                className="text-xs text-slate-700 cursor-pointer font-semibold"
              >
                {"Modifier le mapping"}
              </Button>
              <Button 
                disabled={counters.pending > 0} 
                onClick={() => setStep(3)}
                className="text-xs bg-primary hover:bg-primary/95 text-white font-semibold cursor-pointer shadow-xs"
              >
                {"Suivant : Résumé des changements"}
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>

          {/* Tab Selection */}
          <div className="flex border-b border-slate-200 text-sm font-medium gap-2">
            <button
              onClick={() => setActiveTab('all')}
              className={`pb-2.5 px-3 border-b-2 transition-colors relative font-semibold ${activeTab === 'all' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              {"Toutes"}
            </button>
            <button
              onClick={() => setActiveTab('pending')}
              className={`pb-2.5 px-3 border-b-2 transition-colors relative font-semibold ${activeTab === 'pending' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              {"À associer"}
              {counters.pending > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                  {counters.pending}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('matched')}
              className={`pb-2.5 px-3 border-b-2 transition-colors relative font-semibold ${activeTab === 'matched' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              {"Associées"}
            </button>
            <button
              onClick={() => setActiveTab('ignored')}
              className={`pb-2.5 px-3 border-b-2 transition-colors relative font-semibold ${activeTab === 'ignored' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              {"Ignorées"}
            </button>
            <button
              onClick={() => setActiveTab('errors')}
              className={`pb-2.5 px-3 border-b-2 transition-colors relative font-semibold ${activeTab === 'errors' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              {"Erreurs"}
              {counters.errors > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive text-[10px] font-bold">
                  {counters.errors}
                </span>
              )}
            </button>
          </div>

          {/* Grid Content */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
            {filteredRows.length === 0 ? (
              <div className="py-16 text-center text-slate-500 text-sm">
                {"Aucune ligne ne correspond au filtre sélectionné."}
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="font-bold text-slate-700 w-12 text-center">{"N°"}</TableHead>
                    <TableHead className="font-bold text-slate-700">{"Désignation du fichier"}</TableHead>
                    <TableHead className="font-bold text-slate-700">{"SKU / EAN"}</TableHead>
                    <TableHead className="font-bold text-slate-700 text-right">{"Prix HT"}</TableHead>
                    <TableHead className="font-bold text-slate-700 text-center">{"Rendement / Conv"}</TableHead>
                    <TableHead className="font-bold text-slate-700">{"Produit BlueMargin (Catalogue)"}</TableHead>
                    <TableHead className="font-bold text-slate-700 text-right">{"Actions"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow 
                      key={row.id} 
                      className={`hover:bg-slate-50/50 transition-colors ${row.validation_status === 'error' ? 'bg-destructive/5 hover:bg-destructive/10' : ''}`}
                    >
                      <TableCell className="text-center font-mono text-xs text-slate-400">
                        {row.row_number}
                      </TableCell>
                      
                      {/* Label */}
                      <TableCell className="font-medium text-slate-900 max-w-[200px] truncate" title={row.label || ''}>
                        {row.label || <span className="text-slate-400 italic">{"Non mappé"}</span>}
                      </TableCell>

                      {/* SKU / EAN */}
                      <TableCell className="text-xs text-slate-500 font-mono">
                        {row.supplier_sku && (
                          <div className="truncate" title={`SKU: ${row.supplier_sku}`}>
                            {`SKU: ${row.supplier_sku}`}
                          </div>
                        )}
                        {row.ean && (
                          <div className="truncate" title={`EAN: ${row.ean}`}>
                            {`EAN: ${row.ean}`}
                          </div>
                        )}
                        {!row.supplier_sku && !row.ean && '-'}
                      </TableCell>

                      {/* Purchase Price */}
                      <TableCell className="text-right font-medium text-slate-900 font-mono text-xs">
                        {row.purchase_price !== null ? `${row.purchase_price.toFixed(2)} €` : '-'}
                      </TableCell>

                      {/* Yield & Conv */}
                      <TableCell className="text-center text-xs text-slate-500 font-mono">
                        <div>{`Yield: ${((row.yield_rate ?? 1.0) * 100).toFixed(0)}%`}</div>
                        <div>{`Conv: ${row.conversion_factor ?? 1.0}`}</div>
                      </TableCell>

                      {/* Matched Product Badge/State */}
                      <TableCell>
                        {row.validation_status === 'error' ? (
                          <div className="space-y-1">
                            {row.validation_errors?.map((err, i) => (
                              <div key={i} className="text-xs text-destructive font-medium flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3 shrink-0" />
                                <span>{err}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {row.match_status === 'auto_matched' && row.products && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 w-fit">
                                <Check className="h-3 w-3 text-emerald-600" />
                                {`Auto-associé à : ${row.products.name}`}
                              </span>
                            )}
                            {row.match_status === 'matched' && row.products && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 w-fit">
                                <Check className="h-3 w-3 text-emerald-600" />
                                {`Associé à : ${row.products.name}`}
                              </span>
                            )}
                            {row.match_status === 'create_new' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-sky-500/10 text-sky-700 border border-sky-500/20 w-fit">
                                <Plus className="h-3 w-3 text-sky-600" />
                                {"Créer comme nouveau produit"}
                              </span>
                            )}
                            {row.match_status === 'ignored' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 w-fit">
                                {"Ligne ignorée"}
                              </span>
                            )}
                            {row.match_status === 'review_required' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-700 border border-amber-500/20 w-fit">
                                <AlertTriangle className="h-3 w-3 text-amber-600" />
                                {"Revue requise"}
                              </span>
                            )}
                            {row.match_status === 'unmatched' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200 w-fit">
                                {"Non associé"}
                              </span>
                            )}

                            {/* Secondary info (e.g. matching score) */}
                            {row.match_score !== null && row.match_score > 0 && row.match_status !== 'create_new' && row.match_status !== 'ignored' && (
                              <span className="text-[10px] text-slate-400 font-medium">
                                {`Score de similarité : ${(row.match_score * 100).toFixed(0)}% (via ${row.match_method})`}
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right">
                        {row.validation_status === 'valid' && (
                          <div className="flex items-center justify-end gap-1">
                            {/* Short shortcuts if review_required or unmatched */}
                            {(row.match_status === 'review_required' || row.match_status === 'unmatched') ? (
                              <>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleUpdateRowDecision(row.id, 'create_new')}
                                  title="Créer comme nouveau produit"
                                  className="text-sky-600 hover:text-sky-700 hover:bg-sky-50 cursor-pointer h-7 px-2 text-xs font-semibold"
                                >
                                  {"+ Nouveau"}
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleOpenLinkModal(row)}
                                  className="text-primary hover:text-primary/90 hover:bg-primary/5 cursor-pointer h-7 px-2 text-xs font-semibold"
                                >
                                  {"Lier..."}
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleUpdateRowDecision(row.id, 'ignored')}
                                  title="Ignorer cette ligne"
                                  className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer h-7 px-2 text-xs font-semibold"
                                >
                                  {"Ignorer"}
                                </Button>
                              </>
                            ) : (
                              // Regular edit association button
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleOpenLinkModal(row)}
                                className="text-slate-600 hover:bg-slate-100 cursor-pointer h-7 px-2.5 text-xs font-semibold"
                              >
                                {"Modifier"}
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* STEP 3: PRICE CHANGES SUMMARY & CONFIRMATION                          */}
      {/* ====================================================================== */}
      {step === 3 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
          {/* Main confirmation checklist */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <h3 className="font-bold text-slate-900 text-sm">{"Résumé des tarifs à importer"}</h3>
              </div>

              {rowsToConfirm.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm">
                  {"Aucun produit n'est configuré pour être importé. Veuillez retourner à l'étape 2."}
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="font-bold text-slate-700">{"Produit"}</TableHead>
                      <TableHead className="font-bold text-slate-700 text-right">{"Prix d'achat HT"}</TableHead>
                      <TableHead className="font-bold text-slate-700 text-center">{"Yield / Conv"}</TableHead>
                      <TableHead className="font-bold text-slate-700 text-right">{"Coût rendu brut estimé"}</TableHead>
                      <TableHead className="font-bold text-slate-700">{"Action de l'import"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rowsToConfirm.map((row) => {
                      const computedLanded = row.purchase_price 
                        ? (row.purchase_price / (row.conversion_factor || 1.0) / (row.yield_rate || 1.0))
                        : 0;
                      
                      return (
                        <TableRow key={row.id} className="hover:bg-slate-50/50">
                          <TableCell className="font-medium text-slate-900">
                            <div>{row.label}</div>
                            {row.products && (
                              <span className="block text-[10px] text-slate-400 font-mono">
                                {`Lien: ${row.products.name} (SKU: ${row.products.internal_sku})`}
                              </span>
                            )}
                          </TableCell>
                          
                          <TableCell className="text-right font-medium font-mono text-xs">
                            {row.purchase_price ? `${row.purchase_price.toFixed(2)} €` : '-'}
                          </TableCell>

                          <TableCell className="text-center text-xs text-slate-500 font-mono">
                            {`${((row.yield_rate ?? 1.0) * 100).toFixed(0)}% / ${row.conversion_factor ?? 1.0}`}
                          </TableCell>

                          <TableCell className="text-right font-bold text-primary font-mono text-xs">
                            {`${computedLanded.toFixed(2)} € / kg`}
                          </TableCell>

                          <TableCell>
                            {row.match_status === 'create_new' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-600 border border-sky-100">
                                {"Nouveau produit"}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100">
                                {"Mise à jour tarif"}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>

          {/* Action confirmation panel */}
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-6 space-y-6">
              <div>
                <h3 className="font-bold text-slate-900 text-base">{"Confirmation de l'import"}</h3>
                <p className="text-xs text-slate-500 mt-1">
                  {"Veuillez vérifier les comptes d'importation avant de confirmer."}
                </p>
              </div>

              <div className="divide-y divide-slate-100 text-xs font-semibold text-slate-650">
                <div className="py-2.5 flex justify-between">
                  <span>{"Total des tarifs importés"}</span>
                  <span className="text-slate-900 font-bold">{rowsToConfirm.length}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span>{"Nouveaux produits créés"}</span>
                  <span className="text-sky-600 font-bold">{newProductsCount}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span>{"Tarifs existants mis à jour"}</span>
                  <span className="text-emerald-600 font-bold">{rowsToConfirm.length - newProductsCount}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span>{"Lignes du fichier ignorées"}</span>
                  <span className="text-slate-400 font-bold">{counters.ignored}</span>
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-800 text-[11px] font-medium flex gap-2">
                <Info className="h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  {"Toutes les hausses de coût rendu brut de plus de "}
                  <span className="font-bold">{"5%"}</span>
                  {" par rapport aux snapshots précédents déclencheront automatiquement une alerte système."}
                </div>
              </div>

              <div className="space-y-2">
                <Button
                  onClick={handleConfirmImport}
                  disabled={isPending || rowsToConfirm.length === 0}
                  className="w-full bg-primary hover:bg-primary/95 text-white font-bold cursor-pointer py-2 flex items-center justify-center gap-2 shadow-sm"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {"Application définitive..."}
                    </>
                  ) : (
                    <>
                      {"Confirmer et Appliquer"}
                      <Check className="h-4 w-4" />
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                  disabled={isPending}
                  className="w-full text-slate-700 cursor-pointer font-semibold"
                >
                  {"Retour à la revue"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* MODAL: SEARCH & SELECT PRODUCT TO LINK                                 */}
      {/* ====================================================================== */}
      {selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
          <div className="relative w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="p-5 border-b border-slate-200 bg-slate-50/50">
              <h3 className="font-bold text-slate-900 text-base">
                {"Associer le produit importé"}
              </h3>
              <p className="text-xs text-slate-500 mt-1 font-medium truncate max-w-[420px]" title={selectedRow.label || ''}>
                {`Fichier : ${selectedRow.label}`}
              </p>
            </div>

            {/* Content */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* Suggestions based on fuzzy match score */}
              {suggestions.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 tracking-wide uppercase">
                    {"Suggestions de correspondance"}
                  </Label>
                  <div className="grid gap-2">
                    {suggestions.map((c) => {
                      const barcode = products.find(p => p.id === c.productId)?.barcode;
                      return (
                        <button
                          key={c.productId}
                          onClick={() => {
                            handleUpdateRowDecision(selectedRow.id, 'matched', c.productId);
                            setSelectedRow(null);
                          }}
                          className="flex items-center justify-between p-3 rounded-lg border border-amber-200 bg-amber-50/50 hover:bg-amber-50 text-left transition-colors cursor-pointer group"
                        >
                          <div>
                            <div className="font-semibold text-slate-900 text-sm">{c.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono">{`SKU: ${c.sku} • EAN/Code-barres: ${barcode || 'N/A'}`}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800">
                              {`Fuzzy: ${(c.score * 100).toFixed(0)}%`}
                            </span>
                            <span className="text-xs text-primary font-bold group-hover:underline">{"Choisir"}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Direct Search */}
              <div className="space-y-2">
                <Label htmlFor="prod-search" className="text-xs font-bold text-slate-500 tracking-wide uppercase">
                  {"Rechercher dans tout le catalogue"}
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    id="prod-search"
                    type="text"
                    placeholder="Nom, SKU interne ou code EAN..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent pl-9 pr-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </div>

              {/* Product list */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 tracking-wide uppercase">
                  {`Résultats (${filteredProducts.length})`}
                </Label>
                <div className="border border-slate-100 rounded-lg divide-y divide-slate-100 max-h-[200px] overflow-y-auto">
                  {filteredProducts.length === 0 ? (
                    <div className="p-4 text-center text-slate-400 text-xs font-medium">
                      {"Aucun produit correspondant dans le catalogue."}
                    </div>
                  ) : (
                    filteredProducts.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          handleUpdateRowDecision(selectedRow.id, 'matched', p.id);
                          setSelectedRow(null);
                        }}
                        className="w-full flex items-center justify-between p-2.5 hover:bg-slate-50 text-left transition-colors cursor-pointer group"
                      >
                        <div className="min-w-0 pr-4">
                          <div className="font-semibold text-slate-900 text-xs truncate">{p.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono truncate">{`SKU: ${p.internal_sku} • EAN: ${p.barcode || 'N/A'}`}</div>
                        </div>
                        <span className="text-[10px] text-primary font-bold shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          {"Sélectionner"}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap gap-2 justify-between items-center">
              <div className="flex gap-2">
                <Button 
                  onClick={() => {
                    handleUpdateRowDecision(selectedRow.id, 'create_new');
                    setSelectedRow(null);
                  }}
                  className="bg-sky-50 text-sky-700 hover:bg-sky-100 cursor-pointer text-xs font-bold border border-sky-200"
                >
                  {"+ Créer un nouveau produit"}
                </Button>
                <Button 
                  onClick={() => {
                    handleUpdateRowDecision(selectedRow.id, 'ignored');
                    setSelectedRow(null);
                  }}
                  className="bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer text-xs font-bold border border-slate-250"
                >
                  {"Ignorer la ligne"}
                </Button>
              </div>
              
              <Button 
                variant="ghost" 
                onClick={() => setSelectedRow(null)}
                className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer font-semibold"
              >
                {"Annuler"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
