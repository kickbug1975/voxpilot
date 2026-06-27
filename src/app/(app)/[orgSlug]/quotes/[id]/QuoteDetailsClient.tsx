'use client';

import React, { useState, useTransition, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  ArrowLeft, Plus, Trash2, 
  AlertTriangle, Info, 
  Copy, Save, FileText, Lock, RotateCcw, Share2,
  FileSpreadsheet
} from 'lucide-react';
import { 
  updateQuoteHeader, 
  saveQuoteItems, 
  lockAndSendQuote, 
  reviseQuote, 
  duplicateQuote 
} from '@/actions/quotes';
import { PricingEngine } from '@/domain/PricingEngine';

interface Product {
  id: string;
  name: string;
  internal_sku: string;
  barcode: string | null;
  sales_unit: string;
  vat_rate?: number;
  default_yield_rate?: string | number;
}

interface Customer {
  id: string;
  name: string;
  email?: string | null;
}

interface SupplierProduct {
  product_id: string;
  current_landed_cost: number;
  current_purchase_price?: number | string;
  conversion_factor?: number | string;
  yield_rate?: number | string;
  transport_cost?: number | string;
  handling_cost?: number | string;
  other_fixed_cost?: number | string;
  other_cost_percent?: number | string;
}

interface MarginRule {
  id: string;
  scope: 'customer_product' | 'customer_category' | 'customer' | 'organization_category';
  customer_id: string | null;
  category_id: string | null;
  product_id: string | null;
  target_margin_rate: string | number;
  priority?: number;
  is_active?: boolean;
  valid_from?: string | null;
  valid_to?: string | null;
}

interface QuoteItem {
  id?: string;
  product_id: string;
  position: number;
  description: string | null;
  quantity: number | null;
  unit_price: number;
  discount_rate: number;
  override_justification: string | null;
  product_snapshot?: { name: string; internal_sku: string; barcode: string | null } | null;
  landed_cost_snapshot?: number;
  target_margin_rate?: number;
  recommended_price?: number;
  line_subtotal?: number | null;
  is_transformed?: boolean;
}

interface Quote {
  id: string;
  quote_number: string;
  revision: number;
  customer_id: string;
  title: string;
  status: string;
  issue_date: string;
  expires_at: string | null;
  contact_name: string | null;
  contact_email: string | null;
  public_note: string | null;
  internal_note: string | null;
  terms: string | null;
  grand_total: number | null;
  has_complete_quantities: boolean | null;
  customers?: { legal_name: string; primary_email: string | null } | null;
}

interface QuoteDetailsClientProps {
  orgSlug: string;
  quoteId: string;
  quote: Quote;
  initialItems: QuoteItem[];
  products: Product[];
  customers: Customer[];
  supplierProducts: SupplierProduct[];
  marginRules: MarginRule[];
  orgSettings: {
    defaultMarginRate: number;
    defaultRoundingRule: string;
    salesCanOverrideFloor: boolean;
    salesCanViewCosts: boolean;
  };
  userRole: string;
}

export default function QuoteDetailsClient({
  orgSlug,
  quoteId,
  quote,
  initialItems,
  products,
  customers,
  supplierProducts,
  marginRules,
  orgSettings,
  userRole,
}: QuoteDetailsClientProps) {
  const router = useRouter();
  const [items, setItems] = useState<QuoteItem[]>(initialItems);
  
  // Header Info state
  const [header, setHeader] = useState({
    title: quote.title,
    contact_name: quote.contact_name ?? '',
    contact_email: quote.contact_email ?? '',
    expires_at: quote.expires_at ? quote.expires_at.split('T')[0] : '',
    public_note: quote.public_note ?? '',
    internal_note: quote.internal_note ?? '',
    terms: quote.terms ?? '',
    contact_id: (quote as any).contact_id ?? '',
    location_id: (quote as any).location_id ?? '',
  });

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // CRM Contacts and Locations lists
  const [contacts, setContacts] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);

  useEffect(() => {
    const fetchCustomerRelations = async () => {
      if (quote.customer_id) {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        
        const [locsRes, contsRes] = await Promise.all([
          supabase
            .from('customer_locations')
            .select('id, name, address')
            .eq('customer_id', quote.customer_id)
            .eq('is_active', true),
          supabase
            .from('contacts')
            .select('id, first_name, last_name, email')
            .eq('customer_id', quote.customer_id)
            .eq('is_active', true)
        ]);

        setLocations(locsRes.data || []);
        setContacts(contsRes.data || []);
      }
    };
    fetchCustomerRelations();
  }, [quote.customer_id]);

  // Sharing states
  const [publicToken, setPublicToken] = useState<string | null>(null);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [duplicateCustomerId, setDuplicateCustomerId] = useState('');
  const [isRevisionModalOpen, setIsRevisionModalOpen] = useState(false);
  const [refreshCostsOnRevision, setRefreshCostsOnRevision] = useState(false);

  const isDraft = quote.status === 'draft';
  const isManagerOrAdmin = ['owner', 'admin', 'manager'].includes(userRole);
  const salesCanOverride = orgSettings.salesCanOverrideFloor;
  const canViewCosts = isManagerOrAdmin || orgSettings.salesCanViewCosts;

  // Sync state helpers on local changes
  const handleHeaderChange = (field: string, val: string) => {
    setHeader(prev => ({ ...prev, [field]: val }));
  };

  const handleContactChange = (contactId: string) => {
    const selected = contacts.find(c => c.id === contactId);
    setHeader(prev => ({
      ...prev,
      contact_id: contactId,
      contact_name: selected ? `${selected.first_name} ${selected.last_name}` : prev.contact_name,
      contact_email: selected ? (selected.email ?? prev.contact_email) : prev.contact_email,
    }));
  };

  const handleLocationChange = (locationId: string) => {
    setHeader(prev => ({
      ...prev,
      location_id: locationId,
    }));
  };

  const handleSaveHeader = async () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const res = await updateQuoteHeader(orgSlug, quoteId, {
          title: header.title,
          contact_name: header.contact_name || null,
          contact_email: header.contact_email || null,
          expires_at: header.expires_at || null,
          public_note: header.public_note || null,
          internal_note: header.internal_note || null,
          terms: header.terms || null,
          contact_id: header.contact_id || null,
          location_id: header.location_id || null,
        });

        if (res.error) throw new Error(res.error);
        setSuccess("L'en-tête du devis a été enregistré avec succès !");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur lors de la sauvegarde.");
      }
    });
  };

  // Local rows math helpers
  const resolvedItems = useMemo(() => {
    return items.map((item, idx) => {
      const prod = products.find(p => p.id === item.product_id);
      const isTransformed = item.is_transformed !== false;
      
      // Landed cost lookup
      const sps = supplierProducts.filter(sp => sp.product_id === item.product_id);
      
      const computedLandedCost = sps.length > 0
        ? Math.min(...sps.map(sp => {
            const spYield = sp.yield_rate ? parseFloat(String(sp.yield_rate)) : 1.0;
            const yieldRate = isTransformed 
              ? (spYield !== 1.0 ? spYield : parseFloat(String(prod?.default_yield_rate ?? '1.0')))
              : 1.0;
            const handlingCost = isTransformed ? parseFloat(String(sp.handling_cost ?? 0.0)) : 0.0;
            
            const purchase = parseFloat(String(sp.current_purchase_price ?? 0));
            const conv = parseFloat(String(sp.conversion_factor ?? 1.0));
            if (conv <= 0) return parseFloat(String(sp.current_landed_cost || 0));
            
            const baseUnitCost = purchase / conv;
            const usableUnitCost = baseUnitCost / yieldRate;
            
            const transport = parseFloat(String(sp.transport_cost ?? 0));
            const otherFixed = parseFloat(String(sp.other_fixed_cost ?? 0));
            const otherPct = parseFloat(String(sp.other_cost_percent ?? 0));
            
            const percentCost = usableUnitCost * otherPct;
            const landedCost = usableUnitCost + transport + handlingCost + otherFixed + percentCost;
            return landedCost;
          }))
        : 0;

      const landedCost = isDraft ? computedLandedCost : (item.landed_cost_snapshot ?? computedLandedCost);

      // Target margin resolution
      const targetMargin = item.target_margin_rate ?? PricingEngine.resolveMarginRule(
        {
          productId: item.product_id,
          categoryId: prod?.vat_rate ? String(prod.vat_rate) : null, // CategoryId or Vat
          customerId: quote.customer_id,
          referenceDate: quote.issue_date,
        },
        marginRules.map(r => ({
          id: r.id,
          scope: r.scope,
          customer_id: r.customer_id,
          category_id: r.category_id,
          product_id: r.product_id,
          target_margin_rate: typeof r.target_margin_rate === 'string' ? parseFloat(r.target_margin_rate) : r.target_margin_rate,
          valid_from: r.valid_from,
          valid_to: r.valid_to,
        })),
        orgSettings.defaultMarginRate
      ).targetMarginRate.toNumber();

      // Recommended price
      const recPrice = item.recommended_price ?? PricingEngine.calculateRecommendedPrice(
        landedCost,
        targetMargin,
        orgSettings.defaultRoundingRule
      ).recommendedPrice.toNumber();

      const unitPrice = item.unit_price || recPrice;
      const netUnitPrice = unitPrice * (1 - (item.discount_rate || 0));
      const marginCalculations = PricingEngine.calculateMargin(netUnitPrice, landedCost);
      const marginRate = marginCalculations.marginRate ? marginCalculations.marginRate.toNumber() : 0;
      
      const lineSubtotal = item.quantity !== null && item.quantity !== undefined
        ? netUnitPrice * item.quantity
        : null;

      const isBelowTarget = marginRate < targetMargin;

      return {
        ...item,
        position: idx + 1,
        productName: prod?.name || item.product_snapshot?.name || 'Produit',
        sku: prod?.internal_sku || item.product_snapshot?.internal_sku || 'N/A',
        salesUnit: prod?.sales_unit || 'kg',
        landedCost,
        targetMargin,
        recommendedPrice: recPrice,
        unit_price: unitPrice,
        netUnitPrice,
        marginRate,
        lineSubtotal,
        isBelowTarget,
      };
    });
  }, [items, products, supplierProducts, marginRules, quote.customer_id, orgSettings, isDraft, quote.issue_date]);

  // Totals calculations
  const totals = useMemo(() => {
    let subtotal = 0;
    let hasComplete = true;

    resolvedItems.forEach(item => {
      if (item.line_subtotal !== null && item.line_subtotal !== undefined) {
        subtotal += item.line_subtotal;
      } else {
        hasComplete = false;
      }
    });

    const tax = subtotal * 0.06; // informative 6%
    const totalTtc = subtotal + tax;

    return { subtotal, tax, totalTtc, hasComplete };
  }, [resolvedItems]);

  // Edit actions on rows
  const handleAddRow = () => {
    if (products.length === 0) return;
    const defaultProduct = products[0];

    setItems(prev => [
      ...prev,
      {
        product_id: defaultProduct.id,
        position: prev.length + 1,
        description: '',
        quantity: 1,
        unit_price: 0,
        discount_rate: 0,
        override_justification: '',
      }
    ]);
  };

  const handleUpdateRow = <K extends keyof QuoteItem>(idx: number, field: K, val: QuoteItem[K]) => {
    setItems(prev => prev.map((item, i) => {
      if (i === idx) {
        return { ...item, [field]: val };
      }
      return item;
    }));
  };

  const handleDuplicateRow = (idx: number) => {
    setItems(prev => {
      const copy = { ...prev[idx], id: undefined };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next.map((item, i) => ({ ...item, position: i + 1 }));
    });
  };

  const handleDeleteRow = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx).map((item, i) => ({ ...item, position: i + 1 })));
  };

  // Save Items to Database
  const handleSaveItems = async () => {
    setError(null);
    setSuccess(null);

    // Frontend pre-check for margin justifications
    for (let i = 0; i < resolvedItems.length; i++) {
      const item = resolvedItems[i];
      if (item.isBelowTarget) {
        const cannotOverride = !isManagerOrAdmin && !salesCanOverride;
        if (cannotOverride) {
          setError(
            `Ligne ${i + 1} (${item.productName}) : Votre marge est sous le seuil cible. Seuls les managers/administrateurs peuvent valider cette ligne.`
          );
          return;
        }
        if (!item.override_justification) {
          setError(
            `Ligne ${i + 1} (${item.productName}) : La marge est sous la cible de ${(item.targetMargin * 100).toFixed(0)}%. Une justification est obligatoire.`
          );
          return;
        }
      }
    }

    startTransition(async () => {
      try {
        const res = await saveQuoteItems(
          orgSlug,
          quoteId,
          resolvedItems.map((it, idx) => ({
            product_id: it.product_id,
            quantity: it.quantity === null || isNaN(Number(it.quantity)) ? null : Number(it.quantity),
            unit_price: Number(it.unit_price),
            discount_rate: Number(it.discount_rate),
            override_justification: it.override_justification || null,
            position: idx + 1,
            description: it.description || null,
            is_transformed: it.is_transformed !== false,
          }))
        );

        if (res.error) throw new Error(res.error);
        setSuccess("Les lignes du devis ont été sauvegardées et recalculées avec succès !");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement des articles.");
      }
    });
  };

  // Lock and generate token for quote sharing
  const handleLockAndSend = async () => {
    setError(null);
    setSuccess(null);

    // Frontend pre-check for margin justifications
    for (let i = 0; i < resolvedItems.length; i++) {
      const item = resolvedItems[i];
      if (item.isBelowTarget) {
        const cannotOverride = !isManagerOrAdmin && !salesCanOverride;
        if (cannotOverride) {
          setError(
            `Ligne ${i + 1} (${item.productName}) : Votre marge est sous le seuil cible. Seuls les managers/administrateurs peuvent valider cette ligne.`
          );
          return;
        }
        if (!item.override_justification) {
          setError(
            `Ligne ${i + 1} (${item.productName}) : La marge est sous la cible de ${(item.targetMargin * 100).toFixed(0)}%. Une justification est obligatoire.`
          );
          return;
        }
      }
    }

    startTransition(async () => {
      try {
        // Save current items first to persist them in DB and recalculate quote totals
        const saveRes = await saveQuoteItems(
          orgSlug,
          quoteId,
          resolvedItems.map((it, idx) => ({
            product_id: it.product_id,
            quantity: it.quantity === null || isNaN(Number(it.quantity)) ? null : Number(it.quantity),
            unit_price: Number(it.unit_price),
            discount_rate: Number(it.discount_rate),
            override_justification: it.override_justification || null,
            position: idx + 1,
            description: it.description || null,
            is_transformed: it.is_transformed !== false,
          }))
        );

        if (saveRes.error) throw new Error(saveRes.error);

        // Once saved, lock and finalize the quote
        const res = await lockAndSendQuote(orgSlug, quoteId);
        if (res.error) throw new Error(res.error);
        
        setSuccess("Devis finalisé, sauvegardé et verrouillé avec succès ! Le devis est à présent immuable.");
        if (res.token) {
          setPublicToken(res.token);
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur lors du verrouillage.");
      }
    });
  };

  // Clone/revision triggers
  const handleConfirmRevision = async () => {
    setError(null);
    setSuccess(null);
    setIsRevisionModalOpen(false);
    startTransition(async () => {
      try {
        const res = await reviseQuote(orgSlug, quoteId, refreshCostsOnRevision);
        if (res.error) throw new Error(res.error);
        
        setSuccess("Nouvelle révision créée ! Redirection vers le brouillon...");
        if (res.newQuoteId) {
          router.push(`/${orgSlug}/quotes/${res.newQuoteId}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur lors de la révision.");
      }
    });
  };

  const handleConfirmDuplication = async () => {
    setError(null);
    setSuccess(null);
    if (!duplicateCustomerId) {
      setError("Veuillez sélectionner un client.");
      return;
    }
    setIsDuplicateModalOpen(false);
    startTransition(async () => {
      try {
        const res = await duplicateQuote(orgSlug, quoteId, duplicateCustomerId);
        if (res.error) throw new Error(res.error);

        setSuccess("Devis dupliqué avec succès pour le nouveau client ! Redirection...");
        if (res.newQuoteId) {
          router.push(`/${orgSlug}/quotes/${res.newQuoteId}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur lors de la duplication.");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <button 
            onClick={() => router.push(`/${orgSlug}/quotes`)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors font-medium mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {"Retour à la liste"}
          </button>
          
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              {`Devis : ${quote.quote_number}`}
            </h2>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-650 border border-slate-200">
              {`Révision ${quote.revision}`}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
              quote.status === 'draft' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-250'
            }`}>
              {quote.status === 'draft' ? 'Brouillon' : 'Verrouillé'}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {"Client : "}
            <span className="font-semibold text-slate-700">{quote.customers?.legal_name}</span>
          </p>
        </div>

        {/* Top actions */}
        <div className="flex flex-wrap gap-2">
          {!isDraft && (
            <>
              <Button
                variant="outline"
                onClick={() => setIsRevisionModalOpen(true)}
                className="text-xs text-slate-700 cursor-pointer font-semibold"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                {"Réviser / Nouvelle Version"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setDuplicateCustomerId('');
                  setIsDuplicateModalOpen(true);
                }}
                className="text-xs text-slate-700 cursor-pointer font-semibold"
              >
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                {"Dupliquer pour un autre client"}
              </Button>
              
              <a 
                href={`/api/quotes/${quoteId}/pdf${publicToken ? `?token=${publicToken}` : ""}`}
                download
                className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
              >
                <FileText className="h-3.5 w-3.5 mr-1.5 text-red-500" />
                {"Télécharger le PDF"}
              </a>

              <a 
                href={`/api/quotes/${quoteId}/xlsx?type=client`}
                download
                className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5 text-green-600" />
                {"XLSX Client"}
              </a>

              {canViewCosts && (
                <a 
                  href={`/api/quotes/${quoteId}/xlsx?type=internal`}
                  download
                  className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
                  {"XLSX Interne"}
                </a>
              )}
            </>
          )}

          {isDraft && (
            <>
              <Button
                onClick={handleSaveItems}
                disabled={isPending || items.length === 0}
                className="bg-primary hover:bg-primary/95 text-white font-semibold text-xs cursor-pointer shadow-xs"
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {"Sauvegarder les lignes"}
              </Button>
              <Button
                onClick={handleLockAndSend}
                disabled={isPending || items.length === 0}
                className="bg-emerald-600 hover:bg-emerald-650 text-white font-semibold text-xs cursor-pointer shadow-xs"
              >
                <Lock className="h-3.5 w-3.5 mr-1.5" />
                {"Finaliser & Verrouiller"}
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-850 text-sm font-medium">
          {success}
        </div>
      )}

      {/* Share / Public access notification panel */}
      {publicToken && (
        <div className="p-4 rounded-xl bg-sky-50 border border-sky-200 text-sky-850 text-sm space-y-2 shadow-xs">
          <div className="flex items-center gap-2 font-bold text-sky-900">
            <Share2 className="h-5 w-5 text-sky-600" />
            <span>{"Lien public de partage généré !"}</span>
          </div>
          <p className="text-xs text-sky-700">
            {"Vous pouvez envoyer ce lien de consultation directe à votre client. Le devis est également téléchargeable en PDF."}
          </p>
          <div className="flex items-center gap-2 pt-1.5">
            <input 
              readOnly 
              value={`${window.location.origin}/q/${publicToken}`} 
              className="bg-white border border-sky-200 rounded-md px-3 py-1 text-xs font-mono text-slate-800 w-full max-w-lg select-all"
            />
            <Button
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/q/${publicToken}`);
                setSuccess("Lien copié dans le presse-papier !");
              }}
              className="text-xs bg-sky-600 hover:bg-sky-650 text-white font-semibold cursor-pointer"
            >
              {"Copier"}
            </Button>
          </div>
        </div>
      )}

      {/* Main Grid: Header metadata and items */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        
        {/* LEFT/MAIN: ITEMS GRID TABLE */}
        <div className="xl:col-span-3 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm">{"Articles et tarification de l'offre"}</h3>
              {isDraft && (
                <Button 
                  size="sm" 
                  onClick={handleAddRow}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-250 text-xs font-semibold cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {"Ajouter une ligne"}
                </Button>
              )}
            </div>

            {items.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-sm font-medium">
                {"Aucune ligne d'article dans ce devis."}
                {isDraft && (
                  <div className="mt-3">
                    <Button 
                      size="sm" 
                      onClick={handleAddRow}
                      className="bg-primary hover:bg-primary/90 text-white font-semibold text-xs cursor-pointer shadow-xs"
                    >
                      {"Créer la première ligne"}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="w-12 text-center">{"N°"}</TableHead>
                    <TableHead className="w-48">{"Produit"}</TableHead>
                    <TableHead className="w-32">{"Notes"}</TableHead>
                    <TableHead className="w-20 text-right">{"Quantité"}</TableHead>
                    {isManagerOrAdmin && <TableHead className="w-24 text-right">{"Coût rendu"}</TableHead>}
                    <TableHead className="w-24 text-center">{"Marge Cible"}</TableHead>
                    <TableHead className="w-24 text-right">{"Conseillé"}</TableHead>
                    <TableHead className="w-24 text-right">{"Prix HT *"}</TableHead>
                    <TableHead className="w-20 text-center">{"Remise"}</TableHead>
                    <TableHead className="w-24 text-right">{"Marge Réelle"}</TableHead>
                    {isDraft && <TableHead className="w-24 text-right">{"Actions"}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resolvedItems.map((item, idx) => (
                    <React.Fragment key={idx}>
                      <TableRow className={`hover:bg-slate-50/50 ${item.isBelowTarget ? 'bg-amber-50/30' : ''}`}>
                        <TableCell className="text-center font-mono text-xs text-slate-400">
                          {item.position}
                        </TableCell>

                        {/* Product selection */}
                        <TableCell>
                          {isDraft ? (
                            <>
                              <select
                                value={item.product_id}
                                onChange={(e) => handleUpdateRow(idx, 'product_id', e.target.value)}
                                className="flex h-8 w-full rounded-md border border-slate-200 bg-transparent px-2 py-0.5 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                              >
                                {products.map(p => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                              <div className="flex items-center gap-1.5 mt-1.5">
                                <span className="text-[10px] text-slate-500 font-medium">Préparation :</span>
                                <select
                                  value={item.is_transformed !== false ? 'filet' : 'entier'}
                                  onChange={(e) => handleUpdateRow(idx, 'is_transformed', e.target.value === 'filet')}
                                  className="h-6 rounded border border-slate-200 bg-transparent px-1 text-[10px] shadow-xs cursor-pointer focus-visible:outline-hidden"
                                >
                                  <option value="filet">Filet / Transformé</option>
                                  <option value="entier">Entier / Brut</option>
                                </select>
                              </div>
                            </>
                          ) : (
                            <>
                              <span className="font-semibold text-slate-800 text-xs block">{item.productName}</span>
                              <span className="text-[10px] text-slate-500 block mt-1">
                                {item.is_transformed !== false ? 'Filet / Transformé' : 'Entier / Brut'}
                              </span>
                            </>
                          )}
                          <span className="text-[10px] text-slate-400 font-mono block mt-0.5">{`SKU: ${item.sku}`}</span>
                        </TableCell>

                        {/* Line details / Note */}
                        <TableCell>
                          {isDraft ? (
                            <Input
                              placeholder="Note/Calibre..."
                              value={item.description || ''}
                              onChange={(e) => handleUpdateRow(idx, 'description', e.target.value)}
                              className="h-8 text-xs"
                            />
                          ) : (
                            <span className="text-xs text-slate-500">{item.description || '-'}</span>
                          )}
                        </TableCell>

                        {/* Quantity */}
                        <TableCell className="text-right">
                          {isDraft ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <input
                                type="number"
                                step="any"
                                placeholder="Catalogue"
                                value={item.quantity === null ? '' : item.quantity}
                                onChange={(e) => handleUpdateRow(idx, 'quantity', e.target.value === '' ? null : parseFloat(e.target.value))}
                                className="w-16 h-8 text-right rounded-md border border-slate-200 bg-transparent px-2 py-0.5 text-xs shadow-xs"
                              />
                              <span className="text-[10px] text-slate-400">{item.salesUnit}</span>
                            </div>
                          ) : (
                            <span className="text-xs font-mono font-medium">
                              {item.quantity !== null ? `${item.quantity} ${item.salesUnit}` : <span className="text-slate-400 italic">{"Tarif"}</span>}
                            </span>
                          )}
                        </TableCell>

                        {/* Landed Cost (Admin/Manager only) */}
                        {isManagerOrAdmin && (
                          <TableCell className="text-right font-mono text-xs text-slate-600">
                            {`${item.landedCost.toFixed(2)} €`}
                          </TableCell>
                        )}

                        {/* Target Margin */}
                        <TableCell className="text-center font-mono text-xs text-slate-500">
                          {`${(item.targetMargin * 100).toFixed(0)}%`}
                        </TableCell>

                        {/* Recommended Price */}
                        <TableCell className="text-right font-mono text-xs font-semibold text-slate-700">
                          {`${item.recommendedPrice.toFixed(2)} €`}
                        </TableCell>

                        {/* Unit price */}
                        <TableCell className="text-right">
                          {isDraft ? (
                            <input
                              type="number"
                              step="0.01"
                              value={item.unit_price}
                              onChange={(e) => handleUpdateRow(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                              className="w-16 h-8 text-right rounded-md border border-slate-200 bg-transparent px-2 py-0.5 text-xs shadow-xs font-mono font-medium border-primary/50"
                            />
                          ) : (
                            <span className="text-xs font-mono font-semibold text-slate-800">{`${item.unit_price.toFixed(2)} €`}</span>
                          )}
                        </TableCell>

                        {/* Discount */}
                        <TableCell className="text-center">
                          {isDraft ? (
                            <select
                              value={item.discount_rate}
                              onChange={(e) => handleUpdateRow(idx, 'discount_rate', parseFloat(e.target.value))}
                              className="flex h-8 w-16 mx-auto rounded-md border border-slate-200 bg-transparent px-1.5 py-0.5 text-xs shadow-xs text-center"
                            >
                              <option value="0">{"0%"}</option>
                              <option value="0.02">{"2%"}</option>
                              <option value="0.05">{"5%"}</option>
                              <option value="0.07">{"7%"}</option>
                              <option value="0.10">{"10%"}</option>
                              <option value="0.15">{"15%"}</option>
                            </select>
                          ) : (
                            <span className="text-xs font-mono">{item.discount_rate ? `${(item.discount_rate * 100).toFixed(0)}%` : '0%'}</span>
                          )}
                        </TableCell>

                        {/* Real Margin */}
                        <TableCell className="text-right font-mono text-xs font-bold">
                          <span className={`${item.isBelowTarget ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {`${(item.marginRate * 100).toFixed(1)}%`}
                          </span>
                        </TableCell>

                        {/* Actions */}
                        {isDraft && (
                          <TableCell className="text-right">
                            <div className="flex justify-end items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDuplicateRow(idx)}
                                title="Dupliquer la ligne"
                                className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700 cursor-pointer"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteRow(idx)}
                                title="Supprimer la ligne"
                                className="h-7 w-7 p-0 text-destructive/70 hover:text-destructive hover:bg-destructive/5 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>

                      {/* Override justification row (only shown if margin below target) */}
                      {item.isBelowTarget && (
                        <TableRow className="bg-amber-50/20 hover:bg-amber-50/20">
                          <TableCell colSpan={isManagerOrAdmin ? 11 : 10} className="py-2.5 px-6 border-b border-slate-100">
                            <div className="flex items-center gap-4 text-xs">
                              <div className="flex items-center gap-1 text-amber-700 font-bold shrink-0">
                                <AlertTriangle className="h-4 w-4" />
                                <span>{"Justification dérogation marge cible :"}</span>
                              </div>
                              {isDraft ? (
                                <Input
                                  placeholder="Justifiez la baisse de prix (ex: Alignement concurrence, volume client...)"
                                  value={item.override_justification || ''}
                                  onChange={(e) => handleUpdateRow(idx, 'override_justification', e.target.value)}
                                  required
                                  disabled={!isManagerOrAdmin && !salesCanOverride}
                                  className="h-8 max-w-lg border-amber-300 focus-visible:ring-amber-500 bg-white"
                                />
                              ) : (
                                <span className="text-slate-650 italic font-medium">{item.override_justification || 'Aucune justification fournie.'}</span>
                              )}
                              {!isManagerOrAdmin && !salesCanOverride && isDraft && (
                                <span className="text-rose-600 font-semibold">{"Basse de marge interdite pour les commerciaux."}</span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Pricing calculations footer summaries */}
          <div className="flex flex-col md:flex-row gap-6 justify-between items-start bg-slate-50 border border-slate-200/80 rounded-xl p-6 shadow-xs">
            <div className="space-y-1.5 text-xs text-slate-500 max-w-md">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <Info className="h-4 w-4 text-primary shrink-0" />
                <span>{"Informations sur le calcul des prix"}</span>
              </div>
              <p>
                {"La marge cible résolue est issue de la hiérarchie des règles (Client+Produit -> Client+Catégorie -> Client global -> Organisation+Catégorie -> Organisation par défaut)."}
              </p>
              <p>
                {"L'arrondi appliqué sur les prix recommandés respecte la politique de l'organisation ("}
                <span className="font-semibold text-slate-600">{orgSettings.defaultRoundingRule}</span>
                {")."}
              </p>
            </div>

            {totals.hasComplete ? (
              <div className="w-full md:w-64 space-y-2 text-xs font-semibold text-slate-650 divide-y divide-slate-200/50">
                <div className="flex justify-between py-1.5">
                  <span>{"Total Brut HT"}</span>
                  <span className="text-slate-800 font-mono">{`${totals.subtotal.toFixed(2)} €`}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span>{"TVA Informative (6%)"}</span>
                  <span className="text-slate-800 font-mono">{`${totals.tax.toFixed(2)} €`}</span>
                </div>
                <div className="flex justify-between py-2 text-sm font-bold border-t border-slate-300">
                  <span className="text-primary">{"Total TTC"}</span>
                  <span className="text-primary font-mono">{`${totals.totalTtc.toFixed(2)} €`}</span>
                </div>
              </div>
            ) : (
              <div className="w-full md:max-w-xs p-3.5 bg-slate-100/80 border border-slate-200 rounded-lg text-[11px] text-slate-500 leading-normal flex gap-2">
                <FileText className="h-4 w-4 text-slate-450 shrink-0 mt-0.5" />
                <div>
                  {"Certains articles n'ont pas de quantité spécifiée. Le devis est configuré comme un "}
                  <span className="font-bold text-slate-700">{"catalogue ou tarif fixe"}</span>
                  {". Les totaux HT / TTC sont masqués sur le PDF client."}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SIDEBAR: HEADERS & METADATA CONFIG */}
        <div className="xl:col-span-1 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-6 space-y-6">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">{"Configuration du devis"}</h3>
              <p className="text-[11px] text-slate-400 mt-1">
                {"Définissez les dates d'effet, conditions de règlement et coordonnées de contact."}
              </p>
            </div>

            <div className="space-y-4">
              {/* Title */}
              <div className="grid gap-1">
                <Label htmlFor="title" className="text-xs font-semibold text-slate-700">{"Titre du devis *"}</Label>
                <Input
                  id="title"
                  value={header.title}
                  onChange={(e) => handleHeaderChange('title', e.target.value)}
                  disabled={!isDraft}
                  className="text-xs"
                />
              </div>

              {/* Location Selector */}
              <div className="grid gap-1">
                <Label htmlFor="location_id" className="text-xs font-semibold text-slate-700">{"Établissement lié"}</Label>
                <select
                  id="location_id"
                  value={header.location_id}
                  onChange={(e) => handleLocationChange(e.target.value)}
                  disabled={!isDraft}
                  className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-xs shadow-xs"
                >
                  <option value="">-- Aucun établissement --</option>
                  {locations.map(l => (
                    <option key={l.id} value={l.id}>{l.name} ({l.address.city})</option>
                  ))}
                </select>
              </div>

              {/* Contact Selector */}
              <div className="grid gap-1">
                <Label htmlFor="contact_id" className="text-xs font-semibold text-slate-700">{"Contact commercial lié"}</Label>
                <select
                  id="contact_id"
                  value={header.contact_id}
                  onChange={(e) => handleContactChange(e.target.value)}
                  disabled={!isDraft}
                  className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-xs shadow-xs"
                >
                  <option value="">-- Aucun contact --</option>
                  {contacts.map(c => (
                    <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                  ))}
                </select>
              </div>

              {/* Contact name */}
              <div className="grid gap-1">
                <Label htmlFor="contact_name" className="text-xs font-semibold text-slate-700">{"Nom du contact (Snapshot PDF)"}</Label>
                <Input
                  id="contact_name"
                  placeholder="Ex: M. Dupont"
                  value={header.contact_name}
                  onChange={(e) => handleHeaderChange('contact_name', e.target.value)}
                  disabled={!isDraft}
                  className="text-xs"
                />
              </div>

              {/* Contact email */}
              <div className="grid gap-1">
                <Label htmlFor="contact_email" className="text-xs font-semibold text-slate-700">{"Email du contact (Snapshot PDF)"}</Label>
                <Input
                  id="contact_email"
                  placeholder="Ex: dupont@restaurant.be"
                  value={header.contact_email}
                  onChange={(e) => handleHeaderChange('contact_email', e.target.value)}
                  disabled={!isDraft}
                  className="text-xs"
                />
              </div>

              {/* Expiration date */}
              <div className="grid gap-1">
                <Label htmlFor="expires_at" className="text-xs font-semibold text-slate-700">{"Date d'expiration"}</Label>
                <input
                  id="expires_at"
                  type="date"
                  value={header.expires_at}
                  onChange={(e) => handleHeaderChange('expires_at', e.target.value)}
                  disabled={!isDraft}
                  className="flex h-8 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-xs shadow-xs focus-visible:outline-hidden"
                />
              </div>

              {/* Terms */}
              <div className="grid gap-1">
                <Label htmlFor="terms" className="text-xs font-semibold text-slate-700">{"Conditions de paiement"}</Label>
                <textarea
                  id="terms"
                  rows={2}
                  placeholder="Ex: Paiement à 15 jours par virement."
                  value={header.terms}
                  onChange={(e) => handleHeaderChange('terms', e.target.value)}
                  disabled={!isDraft}
                  className="flex w-full rounded-md border border-slate-200 bg-transparent px-3 py-1.5 text-xs shadow-xs focus-visible:outline-hidden min-h-[50px]"
                />
              </div>

              {/* Notes public */}
              <div className="grid gap-1">
                <Label htmlFor="public_note" className="text-xs font-semibold text-slate-700">{"Note publique (sur PDF) :"}</Label>
                <textarea
                  id="public_note"
                  rows={2}
                  placeholder="Note visible pour le client..."
                  value={header.public_note}
                  onChange={(e) => handleHeaderChange('public_note', e.target.value)}
                  disabled={!isDraft}
                  className="flex w-full rounded-md border border-slate-200 bg-transparent px-3 py-1.5 text-xs shadow-xs focus-visible:outline-hidden min-h-[50px]"
                />
              </div>

              {/* Notes internes */}
              <div className="grid gap-1">
                <Label htmlFor="internal_note" className="text-xs font-semibold text-slate-700">{"Note interne (équipe) :"}</Label>
                <textarea
                  id="internal_note"
                  rows={2}
                  placeholder="Notes privées..."
                  value={header.internal_note}
                  onChange={(e) => handleHeaderChange('internal_note', e.target.value)}
                  disabled={!isDraft}
                  className="flex w-full rounded-md border border-slate-200 bg-transparent px-3 py-1.5 text-xs shadow-xs focus-visible:outline-hidden min-h-[50px]"
                />
              </div>
            </div>

            {isDraft && (
              <Button
                onClick={handleSaveHeader}
                disabled={isPending || !header.title}
                className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs py-2 flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Save className="h-3.5 w-3.5" />
                {"Sauvegarder l'en-tête"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ====================================================================== */}
      {/* MODAL: DUPLICATE QUOTE TO NEW CUSTOMER                                 */}
      {/* ====================================================================== */}
      {isDuplicateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
          <div className="relative w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden p-6 space-y-4">
            <h3 className="font-bold text-slate-900 text-base">{"Dupliquer le devis"}</h3>
            <p className="text-xs text-slate-500">
              {"Sélectionnez le nouveau client. Les marges cibles seront automatiquement recalculées d'après ses conditions."}
            </p>

            <div className="grid gap-1.5">
              <Label htmlFor="new-cust" className="text-xs font-semibold text-slate-700">{"Nouveau Client *"}</Label>
              <select
                id="new-cust"
                value={duplicateCustomerId}
                onChange={(e) => setDuplicateCustomerId(e.target.value)}
                required
                className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">{"Sélectionnez le client..."}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="ghost"
                onClick={() => setIsDuplicateModalOpen(false)}
                className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer font-semibold"
              >
                {"Annuler"}
              </Button>
              <Button
                onClick={handleConfirmDuplication}
                disabled={isPending || !duplicateCustomerId}
                className="bg-primary hover:bg-primary/95 text-white font-semibold text-xs cursor-pointer shadow-xs"
              >
                {"Dupliquer"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* MODAL: REVISE / NEW VERSION OF QUOTE                                   */}
      {/* ====================================================================== */}
      {isRevisionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
          <div className="relative w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden p-6 space-y-4">
            <h3 className="font-bold text-slate-900 text-base">{"Créer une nouvelle révision"}</h3>
            <p className="text-xs text-slate-500">
              {"Cela annulera l'offre existante pour créer un nouveau brouillon révisé (version incrémentée)."}
            </p>

            <div className="flex items-start gap-2.5 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <input
                id="refresh-cost"
                type="checkbox"
                checked={refreshCostsOnRevision}
                onChange={(e) => setRefreshCostsOnRevision(e.target.checked)}
                className="h-4 w-4 rounded-sm border-slate-300 mt-0.5"
              />
              <div className="text-xs">
                <Label htmlFor="refresh-cost" className="font-bold text-slate-800 select-none cursor-pointer">
                  {"Actualiser les coûts de revient"}
                </Label>
                <p className="text-slate-500 mt-0.5">
                  {"Si coché, les coûts de revient de chaque ligne seront mis à jour avec les derniers prix d'achat de votre catalogue."}
                </p>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="ghost"
                onClick={() => setIsRevisionModalOpen(false)}
                className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer font-semibold"
              >
                {"Annuler"}
              </Button>
              <Button
                onClick={handleConfirmRevision}
                disabled={isPending}
                className="bg-primary hover:bg-primary/95 text-white font-semibold text-xs cursor-pointer shadow-xs"
              >
                {"Créer la révision"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
