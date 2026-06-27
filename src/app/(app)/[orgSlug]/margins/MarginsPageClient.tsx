'use client';

import React, { useState, useTransition } from 'react';
import { 
  createMarginRule, 
  deleteMarginRule, 
  updateMarginRule 
} from '@/actions/margins';
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
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogClose
} from '@/components/ui/dialog';
import { PricingEngine, MarginRule } from '@/domain/PricingEngine';
import { Plus, Trash2, ShieldAlert, Sparkles, Sliders, CheckCircle } from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  segment: string;
}

interface Product {
  id: string;
  name: string;
  internal_sku: string;
  category_id: string | null;
  sales_unit: string;
  default_yield_rate: string;
}

interface Category {
  id: string;
  name: string;
}

interface ExtendedMarginRule extends MarginRule {
  customers?: { name: string } | null;
  products?: { name: string; internal_sku: string } | null;
  product_categories?: { name: string } | null;
  created_at?: string;
}

interface MarginsPageClientProps {
  orgSlug: string;
  initialRules: ExtendedMarginRule[];
  customers: Customer[];
  products: Product[];
  categories: Category[];
  defaultOrgMarginRate: number;
  defaultRoundingRule: string;
  error: string | null;
}

const renderValidity = (validFrom?: string | null, validTo?: string | null) => {
  if (!validFrom && !validTo) {
    return <span className="text-slate-400">{"Toujours"}</span>;
  }
  
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  };

  if (validFrom && validTo) {
    return <span className="whitespace-nowrap">{`Du ${formatDate(validFrom)} au ${formatDate(validTo)}`}</span>;
  }
  if (validFrom) {
    return <span className="whitespace-nowrap">{`À partir du ${formatDate(validFrom)}`}</span>;
  }
  return <span className="whitespace-nowrap">{`Jusqu'au ${formatDate(validTo)}`}</span>;
};

export default function MarginsPageClient({
  orgSlug,
  initialRules,
  customers,
  products,
  categories,
  defaultOrgMarginRate,
  defaultRoundingRule,
  error: fetchError,
}: MarginsPageClientProps) {
  const [rules, setRules] = useState<ExtendedMarginRule[]>(initialRules);
  const [error, setError] = useState<string | null>(fetchError);
  const [success, setSuccess] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Create Form State
  const [scope, setScope] = useState<'customer_product' | 'customer_category' | 'customer' | 'organization_category'>('customer_product');
  const [targetMarginRatePercent, setTargetMarginRatePercent] = useState('25');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [priority, setPriority] = useState('0');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');

  // Simulator State
  const [simCustomerId, setSimCustomerId] = useState('');
  const [simProductId, setSimProductId] = useState('');
  const [simPurchasePrice, setSimPurchasePrice] = useState('10');
  const [simConversionFactor, setSimConversionFactor] = useState('1');
  const [simTransportCost, setSimTransportCost] = useState('0');
  const [simHandlingCost, setSimHandlingCost] = useState('0');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const rate = parseFloat(targetMarginRatePercent) / 100;
    if (isNaN(rate) || rate < 0 || rate > 0.95) {
      setError("Le taux de marge cible doit être compris entre 0% et 95%.");
      return;
    }

    const formData = new FormData();
    formData.append('scope', scope);
    formData.append('targetMarginRate', rate.toString());
    formData.append('priority', priority);
    formData.append('validFrom', validFrom);
    formData.append('validTo', validTo);

    if (scope.startsWith('customer')) {
      if (!selectedCustomerId) {
        setError("Veuillez sélectionner un client.");
        return;
      }
      formData.append('customerId', selectedCustomerId);
    }
    if (scope === 'customer_category' || scope === 'organization_category') {
      if (!selectedCategoryId) {
        setError("Veuillez sélectionner une catégorie.");
        return;
      }
      formData.append('categoryId', selectedCategoryId);
    }
    if (scope === 'customer_product') {
      if (!selectedProductId) {
        setError("Veuillez sélectionner un produit.");
        return;
      }
      formData.append('productId', selectedProductId);
    }

    startTransition(async () => {
      try {
        const result = await createMarginRule(orgSlug, formData);
        if (result.error) {
          throw new Error(result.error);
        }

        if (result.data) {
          const custName = customers.find(c => c.id === selectedCustomerId)?.name || '';
          const prodObj = products.find(p => p.id === selectedProductId);
          const catName = categories.find(c => c.id === selectedCategoryId)?.name || '';

          const newRule: ExtendedMarginRule = {
            ...result.data,
            customers: selectedCustomerId ? { name: custName } : null,
            products: selectedProductId ? { name: prodObj?.name || '', internal_sku: prodObj?.internal_sku || '' } : null,
            product_categories: selectedCategoryId ? { name: catName } : null,
          };

          setRules(prev => [newRule, ...prev]);
          setIsOpen(false);
          setSuccess("Règle de marge créée avec succès.");
          setTimeout(() => setSuccess(null), 3000);

          // Reset fields
          setSelectedCustomerId('');
          setSelectedCategoryId('');
          setSelectedProductId('');
          setTargetMarginRatePercent('25');
          setPriority('0');
          setValidFrom('');
          setValidTo('');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Impossible de créer la règle.';
        setError(message);
      }
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette règle de marge ?")) return;

    try {
      const result = await deleteMarginRule(orgSlug, id);
      if (result.error) {
        throw new Error(result.error);
      }
      setRules(prev => prev.filter(r => r.id !== id));
      setSuccess("Règle de marge supprimée.");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Impossible de supprimer la règle.';
      setError(message);
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    const formData = new FormData();
    const rule = rules.find(r => r.id === id);
    if (!rule) return;

    formData.append('targetMarginRate', rule.target_margin_rate.toString());
    formData.append('priority', (rule.priority || 0).toString());
    formData.append('isActive', (!currentActive).toString());
    formData.append('validFrom', rule.valid_from || '');
    formData.append('validTo', rule.valid_to || '');

    try {
      const result = await updateMarginRule(orgSlug, id, formData);
      if (result.error) {
        throw new Error(result.error);
      }
      setRules(prev => prev.map(r => r.id === id ? { ...r, is_active: !currentActive } : r));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Impossible de modifier le statut de la règle.';
      setError(message);
    }
  };

  // Run Real-time Pricing Engine Simulation
  const simulatePricing = () => {
    const product = products.find(p => p.id === simProductId);
    
    // Default fallback values if no product selected
    const yieldRate = product ? parseFloat(product.default_yield_rate) : 1.0;
    const categoryId = product ? product.category_id : null;
    
    try {
      // 1. Calculate Landed Cost
      const landed = PricingEngine.calculateLandedCost({
        purchasePrice: simPurchasePrice,
        conversionFactor: simConversionFactor,
        yieldRate,
        transportCostPerSalesUnit: simTransportCost,
        handlingCostPerSalesUnit: simHandlingCost,
      });

      // 2. Resolve Rule
      const resolved = PricingEngine.resolveMarginRule(
        {
          productId: simProductId || null,
          categoryId,
          customerId: simCustomerId || null,
        },
        rules,
        defaultOrgMarginRate
      );

      // 3. Recommended Price
      const recommended = PricingEngine.calculateRecommendedPrice(
        landed.landedCost,
        resolved.targetMarginRate,
        defaultRoundingRule
      );

      // 4. Margins
      const margin = PricingEngine.calculateMargin(
        recommended.recommendedPrice,
        landed.landedCost
      );

      return {
        landedCost: landed.landedCost,
        percentCost: landed.percentCost,
        targetMarginRate: resolved.targetMarginRate,
        source: resolved.source,
        recommendedRawPrice: recommended.recommendedRawPrice,
        recommendedPrice: recommended.recommendedPrice,
        grossMarginAmount: margin.grossMarginAmount,
        marginRate: margin.marginRate,
        yieldRate,
        salesUnit: product ? product.sales_unit : 'kg',
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Erreur de calcul' };
    }
  };

  const simResult = simulatePricing();

  const getScopeLabel = (scope: string) => {
    switch (scope) {
      case 'customer_product': return "Client + Produit";
      case 'customer_category': return "Client + Catégorie";
      case 'customer': return "Client global";
      case 'organization_category': return "Catégorie globale";
      default: return scope;
    }
  };

  const getScopeBadgeClass = (scope: string) => {
    switch (scope) {
      case 'customer_product': return "bg-teal-500/10 text-teal-600 border border-teal-500/20";
      case 'customer_category': return "bg-indigo-500/10 text-indigo-600 border border-indigo-500/20";
      case 'customer': return "bg-violet-500/10 text-violet-600 border border-violet-500/20";
      case 'organization_category': return "bg-amber-500/10 text-amber-600 border border-amber-500/20";
      default: return "bg-slate-100 text-slate-600";
    }
  };

  const getSourceLabel = (src: string) => {
    switch (src) {
      case 'customer_product': return "Client + Produit (Spécifique)";
      case 'customer_category': return "Client + Catégorie";
      case 'customer': return "Client Global";
      case 'organization_category': return "Catégorie Globale";
      case 'organization': return "Organisation Globale (Défaut)";
      case 'fallback': return "Secours technique (20%)";
      default: return src;
    }
  };

  return (
    <div className="space-y-6">
      {/* Title & Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">{"Règles de marge"}</h2>
          <p className="text-sm text-slate-500">
            {"Définissez les cibles de marge hiérarchiques appliquées pour vos clients, produits et catégories."}
          </p>
        </div>

        {/* Dialog Component for Adding Rules */}
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger
            render={
              <Button className="bg-primary text-white hover:bg-primary/90 font-semibold cursor-pointer">
                <Plus className="h-4 w-4 mr-2" />
                {"Ajouter une règle de marge"}
              </Button>
            }
          />
          <DialogContent className="sm:max-w-md bg-white border border-slate-200 shadow-xl rounded-xl">
            <form onSubmit={handleCreate}>
              <DialogHeader>
                <DialogTitle className="text-lg font-bold text-slate-900">{"Ajouter une règle de marge"}</DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  {"Remplissez les critères ci-dessous. Les règles plus spécifiques prévalent sur les règles générales."}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                {/* Scope selector */}
                <div className="grid gap-1">
                  <Label htmlFor="scope" className="text-xs font-semibold text-slate-700">{"Scope / Niveau d'application *"}</Label>
                  <select 
                    id="scope" 
                    value={scope}
                    onChange={(e) => {
                      setScope(e.target.value as typeof scope);
                      // Clear dependents
                      setSelectedCustomerId('');
                      setSelectedCategoryId('');
                      setSelectedProductId('');
                    }}
                    required
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="customer_product">{"Client + Produit (Niveau 1)"}</option>
                    <option value="customer_category">{"Client + Catégorie de produit (Niveau 2)"}</option>
                    <option value="customer">{"Client global (Niveau 3)"}</option>
                    <option value="organization_category">{"Catégorie globale (Niveau 4)"}</option>
                  </select>
                </div>

                {/* Conditional Fields based on Scope */}
                {scope.startsWith('customer') && (
                  <div className="grid gap-1">
                    <Label htmlFor="customerId" className="text-xs font-semibold text-slate-700">{"Client *"}</Label>
                    <select 
                      id="customerId" 
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                      required
                      className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">{"Sélectionnez un client"}</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.segment})</option>
                      ))}
                    </select>
                  </div>
                )}

                {(scope === 'customer_category' || scope === 'organization_category') && (
                  <div className="grid gap-1">
                    <Label htmlFor="categoryId" className="text-xs font-semibold text-slate-700">{"Catégorie de produit *"}</Label>
                    <select 
                      id="categoryId" 
                      value={selectedCategoryId}
                      onChange={(e) => setSelectedCategoryId(e.target.value)}
                      required
                      className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">{"Sélectionnez une catégorie"}</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {scope === 'customer_product' && (
                  <div className="grid gap-1">
                    <Label htmlFor="productId" className="text-xs font-semibold text-slate-700">{"Produit *"}</Label>
                    <select 
                      id="productId" 
                      value={selectedProductId}
                      onChange={(e) => setSelectedProductId(e.target.value)}
                      required
                      className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">{"Sélectionnez un produit"}</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.internal_sku})</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Target Margin Rate & Priority */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1">
                    <Label htmlFor="targetMarginRatePercent" className="text-xs font-semibold text-slate-700">{"Taux de marge cible (%) *"}</Label>
                    <Input 
                      id="targetMarginRatePercent" 
                      type="number"
                      min="0"
                      max="95"
                      step="0.1"
                      value={targetMarginRatePercent}
                      onChange={(e) => setTargetMarginRatePercent(e.target.value)}
                      required 
                      className="border-slate-200" 
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="priority" className="text-xs font-semibold text-slate-700">{"Priorité (Ordre)"}</Label>
                    <Input 
                      id="priority" 
                      type="number"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      className="border-slate-200" 
                    />
                  </div>
                </div>

                {/* Validity dates */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1">
                    <Label htmlFor="validFrom" className="text-xs font-semibold text-slate-700">{"Date de début"}</Label>
                    <Input 
                      id="validFrom" 
                      type="date"
                      value={validFrom}
                      onChange={(e) => setValidFrom(e.target.value)}
                      className="border-slate-200" 
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="validTo" className="text-xs font-semibold text-slate-700">{"Date de fin"}</Label>
                    <Input 
                      id="validTo" 
                      type="date"
                      value={validTo}
                      onChange={(e) => setValidTo(e.target.value)}
                      className="border-slate-200" 
                    />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <DialogClose
                  render={
                    <Button type="button" variant="outline" className="border-slate-200">
                      {"Annuler"}
                    </Button>
                  }
                />
                <Button type="submit" disabled={isPending} className="bg-primary text-white hover:bg-primary/90">
                  {isPending ? 'Création...' : 'Créer la règle'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Rules list */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {rules.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            {"Aucune règle de marge personnalisée n'est configurée pour le moment. Le taux par défaut est appliqué."}
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="font-semibold text-slate-700">{"Scope"}</TableHead>
                <TableHead className="font-semibold text-slate-700">{"Client"}</TableHead>
                <TableHead className="font-semibold text-slate-700">{"Critère technique"}</TableHead>
                <TableHead className="font-semibold text-slate-700">{"Validité"}</TableHead>
                <TableHead className="font-semibold text-slate-700 text-right">{"Marge Cible"}</TableHead>
                <TableHead className="font-semibold text-slate-700 text-right">{"Priorité"}</TableHead>
                <TableHead className="font-semibold text-slate-700 text-center">{"Statut"}</TableHead>
                <TableHead className="font-semibold text-slate-700 text-right">{"Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id} className="hover:bg-slate-50/50">
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${getScopeBadgeClass(rule.scope)}`}>
                      {getScopeLabel(rule.scope)}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium text-slate-900">
                    {rule.customers?.name || <span className="text-slate-400">{"Tous les clients"}</span>}
                  </TableCell>
                  <TableCell className="text-slate-600 text-sm">
                    {rule.scope === 'customer_product' && (
                      <span className="font-mono text-xs">
                        {"Produit : "}{rule.products?.name} ({rule.products?.internal_sku})
                      </span>
                    )}
                    {(rule.scope === 'customer_category' || rule.scope === 'organization_category') && (
                      <span>{"Catégorie : "}{rule.product_categories?.name}</span>
                    )}
                    {rule.scope === 'customer' && <span className="text-slate-400">{"-"}</span>}
                  </TableCell>
                  <TableCell className="text-slate-600 text-sm">
                    {renderValidity(rule.valid_from, rule.valid_to)}
                  </TableCell>
                  <TableCell className="text-right text-slate-900 font-bold">
                    {(parseFloat(rule.target_margin_rate.toString()) * 100).toFixed(1)}{"%"}
                  </TableCell>
                  <TableCell className="text-right text-slate-500 font-mono text-xs">
                    {rule.priority || 0}
                  </TableCell>
                  <TableCell className="text-center">
                    <button 
                      onClick={() => handleToggleActive(rule.id!, !!rule.is_active)}
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition-colors border ${rule.is_active ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}
                    >
                      {rule.is_active ? 'Actif' : 'Inactif'}
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="icon-xs" 
                      onClick={() => handleDelete(rule.id!)}
                      className="text-slate-400 hover:text-destructive cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Simulator Section */}
      <div className="bg-slate-900 text-white rounded-2xl shadow-xl overflow-hidden border border-slate-800">
        <div className="p-6 border-b border-slate-800 bg-slate-950/60 flex items-center gap-3">
          <Sparkles className="h-6 w-6 text-accent-500" />
          <div>
            <h3 className="font-bold text-lg text-white">{"Simulateur de Tarification Temps Réel"}</h3>
            <p className="text-xs text-slate-400">
              {"Testez en direct comment le PricingEngine résout les priorités et applique les marges et arrondis."}
            </p>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Simulator Controls */}
          <div className="lg:col-span-2 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-1">
                <Label htmlFor="simCustomer" className="text-xs font-semibold text-slate-350">{"Client cible (facultatif)"}</Label>
                <select
                  id="simCustomer"
                  value={simCustomerId}
                  onChange={(e) => setSimCustomerId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1 text-sm text-slate-200 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-accent-500"
                >
                  <option value="">{"Tous les clients / Aucun"}</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid gap-1">
                <Label htmlFor="simProduct" className="text-xs font-semibold text-slate-350">{"Produit cible (rendement & unité)"}</Label>
                <select
                  id="simProduct"
                  value={simProductId}
                  onChange={(e) => setSimProductId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1 text-sm text-slate-200 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-accent-500"
                >
                  <option value="">{"Sélectionnez un produit (Optionnel)"}</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.internal_sku})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="grid gap-1">
                <Label htmlFor="simPurchasePrice" className="text-xs font-semibold text-slate-355">{"Prix d'achat (€) *"}</Label>
                <Input
                  id="simPurchasePrice"
                  type="number"
                  step="0.01"
                  value={simPurchasePrice}
                  onChange={(e) => setSimPurchasePrice(e.target.value)}
                  className="bg-slate-950 border-slate-750 text-white"
                />
              </div>

              <div className="grid gap-1">
                <Label htmlFor="simConversionFactor" className="text-xs font-semibold text-slate-355">{"Facteur unité *"}</Label>
                <Input
                  id="simConversionFactor"
                  type="number"
                  min="1"
                  value={simConversionFactor}
                  onChange={(e) => setSimConversionFactor(e.target.value)}
                  className="bg-slate-950 border-slate-750 text-white"
                />
              </div>

              <div className="grid gap-1">
                <Label htmlFor="simTransportCost" className="text-xs font-semibold text-slate-355">{"Transport / unité"}</Label>
                <Input
                  id="simTransportCost"
                  type="number"
                  step="0.01"
                  value={simTransportCost}
                  onChange={(e) => setSimTransportCost(e.target.value)}
                  className="bg-slate-950 border-slate-750 text-white"
                />
              </div>

              <div className="grid gap-1">
                <Label htmlFor="simHandlingCost" className="text-xs font-semibold text-slate-355">{"Manutention / unité"}</Label>
                <Input
                  id="simHandlingCost"
                  type="number"
                  step="0.01"
                  value={simHandlingCost}
                  onChange={(e) => setSimHandlingCost(e.target.value)}
                  className="bg-slate-950 border-slate-750 text-white"
                />
              </div>
            </div>
          </div>

          {/* Simulator Outputs */}
          <div className="bg-slate-950 rounded-xl p-5 border border-slate-800 flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{"Résultats de calcul"}</span>
              <Sliders className="h-4 w-4 text-accent-500" />
            </div>

            {('error' in simResult) ? (
              <div className="py-6 text-center text-destructive text-sm font-medium">
                {simResult.error}
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">{"Rendement matière"}</span>
                  <span className="font-semibold text-white">{(simResult.yieldRate * 100).toFixed(0)}{"%"}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-400">{"Coût rendu unitaire"}</span>
                  <span className="font-semibold text-white">{simResult.landedCost.toFixed(2)}{" € / "}{simResult.salesUnit}</span>
                </div>

                <div className="flex justify-between items-center bg-slate-900/60 p-2 rounded-lg my-1">
                  <span className="text-slate-400">{"Règle résolue"}</span>
                  <div className="text-right">
                    <span className="font-bold text-accent-500">{(simResult.targetMarginRate.toNumber() * 100).toFixed(1)}{"%"}</span>
                    <span className="block text-[9px] text-slate-450">{getSourceLabel(simResult.source)}</span>
                  </div>
                </div>

                <div className="flex justify-between text-xs border-t border-slate-800 pt-2 text-slate-500">
                  <span>{"Recommandé Brut"}</span>
                  <span>{simResult.recommendedRawPrice.toFixed(2)}{" €"}</span>
                </div>

                <div className="flex justify-between items-baseline pt-2">
                  <span className="font-bold text-white text-base">{"Prix Recommandé"}</span>
                  <span className="text-2xl font-extrabold text-accent-500">{simResult.recommendedPrice.toFixed(2)}{" €"}</span>
                </div>

                <div className="flex justify-between text-xs text-emerald-400 bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                  <span>{"Marge brute estimée"}</span>
                  <span className="font-bold">{simResult.grossMarginAmount.toFixed(2)}{" € ("}{(simResult.marginRate ? simResult.marginRate.toNumber() * 100 : 0).toFixed(1)}{"%)"}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
