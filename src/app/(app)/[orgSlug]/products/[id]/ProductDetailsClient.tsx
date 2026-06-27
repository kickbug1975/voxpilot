'use client';

import React, { useState, useTransition, useEffect } from 'react';
import Link from 'next/link';
import { updateProduct, linkSupplierToProduct, unlinkSupplierFromProduct } from '@/actions/products';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PricingEngine } from '@/domain/PricingEngine';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { ChevronLeft, Save, Truck, Link as LinkIcon, Trash2, ShieldAlert, BadgeInfo } from 'lucide-react';

interface SupplierProduct {
  id: string;
  supplier_id: string;
  supplier_sku: string | null;
  purchase_unit: string;
  current_purchase_price: string;
  current_landed_cost: string;
  transport_cost?: string | number | null;
  handling_cost?: string | number | null;
  other_fixed_cost?: string | number | null;
  other_cost_percent?: string | number | null;
  suppliers: {
    name: string;
  } | null;
}

interface Supplier {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  internal_sku: string;
  barcode: string | null;
  sales_unit: string;
  default_yield_rate: string;
  is_active: boolean;
  suppliers: SupplierProduct[];
}

interface ProductDetailsClientProps {
  orgSlug: string;
  productId: string;
  initialProduct: Product | null;
  suppliers: Supplier[];
  error: string | null;
}

// Unit factor parser helper
function parseUnitFactor(purchaseUnit: string): number {
  const match = purchaseUnit.match(/_(\d+)(?:kg|g|pc)?$/i);
  if (match) {
    return parseFloat(match[1]);
  }
  return 1;
}

export default function ProductDetailsClient({
  orgSlug,
  productId,
  initialProduct,
  suppliers,
  error: fetchError,
}: ProductDetailsClientProps) {
  const [product, setProduct] = useState<Product | null>(initialProduct);
  const [error, setError] = useState<string | null>(fetchError);
  const [success, setSuccess] = useState(false);
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Dialog State
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [supplierSku, setSupplierSku] = useState('');
  const [purchaseUnit, setPurchaseUnit] = useState('kg');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [landedCost, setLandedCost] = useState('');
  const [transportCost, setTransportCost] = useState('0');
  const [handlingCost, setHandlingCost] = useState('0');
  const [otherFixedCost, setOtherFixedCost] = useState('0');
  const [otherCostPercent, setOtherCostPercent] = useState('0');

  const yieldRateNum = parseFloat(product?.default_yield_rate || '1.0');
  const unitFactor = parseUnitFactor(purchaseUnit);

  useEffect(() => {
    const pPrice = parseFloat(purchasePrice);
    if (!isNaN(pPrice) && pPrice > 0) {
      try {
        const result = PricingEngine.calculateLandedCost({
          purchasePrice: pPrice,
          conversionFactor: unitFactor,
          yieldRate: yieldRateNum,
          transportCostPerSalesUnit: parseFloat(transportCost) || 0,
          handlingCostPerSalesUnit: parseFloat(handlingCost) || 0,
          otherFixedCostPerSalesUnit: parseFloat(otherFixedCost) || 0,
          otherCostPercent: (parseFloat(otherCostPercent) || 0) / 100,
        });
        setLandedCost(result.landedCost.toFixed(2));
      } catch (err) {
        setLandedCost('');
      }
    } else {
      setLandedCost('');
    }
  }, [purchasePrice, purchaseUnit, transportCost, handlingCost, otherFixedCost, otherCostPercent, yieldRateNum, unitFactor]);

  if (!product) {
    return (
      <div className="space-y-4">
        <Link href={`/${orgSlug}/products`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
          <ChevronLeft className="h-4 w-4" />
          Retour aux produits
        </Link>
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">
          Produit introuvable.
        </div>
      </div>
    );
  }

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const result = await updateProduct(orgSlug, productId, formData);
        if (result.error) {
          throw new Error(result.error);
        }
        if (result.data) {
          setProduct(prev => ({
            ...prev!,
            ...result.data,
          }));
          setSuccess(true);
          setTimeout(() => setSuccess(false), 3000);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Une erreur est survenue lors de la modification.';
        setError(message);
      }
    });
  };

  const handleLinkSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedSupplierId || !purchasePrice || !landedCost) {
      setError('Veuillez remplir tous les champs obligatoires.');
      return;
    }

    startTransition(async () => {
      try {
        const result = await linkSupplierToProduct(
          orgSlug,
          productId,
          selectedSupplierId,
          purchaseUnit,
          parseFloat(purchasePrice),
          parseFloat(landedCost),
          supplierSku,
          parseFloat(transportCost || '0'),
          parseFloat(handlingCost || '0'),
          parseFloat(otherFixedCost || '0'),
          parseFloat(otherCostPercent || '0') / 100
        );

        if (result.error) {
          throw new Error(result.error);
        }

        // Refresh product details
        if (result.data) {
          const supplierName = suppliers.find(s => s.id === selectedSupplierId)?.name || 'Fournisseur';
          const newRef: SupplierProduct = {
            id: result.data.id,
            supplier_id: selectedSupplierId,
            supplier_sku: supplierSku || null,
            purchase_unit: purchaseUnit,
            current_purchase_price: purchasePrice,
            current_landed_cost: landedCost,
            transport_cost: transportCost,
            handling_cost: handlingCost,
            other_fixed_cost: otherFixedCost,
            other_cost_percent: (parseFloat(otherCostPercent) / 100).toString(),
            suppliers: { name: supplierName }
          };

          setProduct(prev => ({
            ...prev!,
            suppliers: [...(prev?.suppliers || []), newRef]
          }));

          setIsLinkOpen(false);
          // Reset form fields
          setSelectedSupplierId('');
          setSupplierSku('');
          setPurchaseUnit('kg');
          setPurchasePrice('');
          setLandedCost('');
          setTransportCost('0');
          setHandlingCost('0');
          setOtherFixedCost('0');
          setOtherCostPercent('0');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Impossible d\'associer le fournisseur.';
        setError(message);
      }
    });
  };

  const handleUnlink = async (supplierProductId: string, supplierName: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir dissocier le fournisseur "${supplierName}" ?`)) return;

    try {
      const result = await unlinkSupplierFromProduct(orgSlug, productId, supplierProductId);
      if (result.error) {
        throw new Error(result.error);
      }
      setProduct(prev => ({
        ...prev!,
        suppliers: prev!.suppliers.filter(sp => sp.id !== supplierProductId)
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Impossible de dissocier le fournisseur.';
      setError(message);
    }
  };



  return (
    <div className="space-y-6">
      {/* Back button and page title */}
      <div className="flex flex-col gap-2">
        <Link 
          href={`/${orgSlug}/products`} 
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-950 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Retour aux produits
        </Link>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            {product.name}
          </h2>
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${product.is_active ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-slate-100 text-slate-600'}`}>
            {product.is_active ? 'Actif' : 'Inactif'}
          </span>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium">
          Fiche produit mise à jour avec succès !
        </div>
      )}

      <Tabs defaultValue="suppliers" className="space-y-4">
        <TabsList className="bg-slate-100 p-1 border-b border-slate-200 w-full justify-start rounded-lg flex gap-1">
          <TabsTrigger value="suppliers" className="rounded-md px-4 py-1.5 text-sm font-medium cursor-pointer">
            Coûts Fournisseurs ({product.suppliers?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="edit" className="rounded-md px-4 py-1.5 text-sm font-medium cursor-pointer">
            Modifier la fiche
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Suppliers prices list */}
        <TabsContent value="suppliers" className="space-y-4 outline-none">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-slate-500" />
                <h3 className="font-semibold text-slate-900 text-sm">{"Tarifs d'achat et Rendement Matière"}</h3>
              </div>

              {/* Link Supplier Dialog */}
              <Dialog open={isLinkOpen} onOpenChange={setIsLinkOpen}>
                <DialogTrigger
                  render={
                    <Button variant="outline" size="sm" className="border-slate-200 cursor-pointer">
                      <LinkIcon className="h-3.5 w-3.5 mr-1.5" />
                      {"Associer un fournisseur"}
                    </Button>
                  }
                />
                <DialogContent className="sm:max-w-md bg-white border border-slate-200 shadow-xl rounded-xl">
                  <form onSubmit={handleLinkSupplier}>
                    <DialogHeader>
                      <DialogTitle className="text-lg font-bold text-slate-900">{"Associer un fournisseur"}</DialogTitle>
                      <DialogDescription className="text-xs text-slate-500">
                        {"Définissez le prix d'achat et le coût rendu d'un fournisseur pour ce produit."}
                      </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                      <div className="grid gap-1">
                        <Label htmlFor="supplier" className="text-xs font-semibold text-slate-700">Fournisseur *</Label>
                        <select 
                          id="supplier" 
                          value={selectedSupplierId}
                          onChange={(e) => setSelectedSupplierId(e.target.value)}
                          required
                          className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="">Sélectionnez un fournisseur</option>
                          {suppliers.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-1">
                          <Label htmlFor="supplierSku" className="text-xs font-semibold text-slate-700">SKU Fournisseur</Label>
                          <Input 
                            id="supplierSku" 
                            placeholder="ex: OCEAN-SAUM-12" 
                            value={supplierSku}
                            onChange={(e) => setSupplierSku(e.target.value)}
                            className="border-slate-200" 
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label htmlFor="purchaseUnit" className="text-xs font-semibold text-slate-700">{"Unité d'achat *"}</Label>
                          <select
                            id="purchaseUnit"
                            value={purchaseUnit}
                            onChange={(e) => setPurchaseUnit(e.target.value)}
                            required
                            className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                          >
                            <option value="kg">kg</option>
                            <option value="box_5kg">Caisse 5 kg (box_5kg)</option>
                            <option value="box_10kg">Caisse 10 kg (box_10kg)</option>
                            <option value="tub_2kg">Bac 2 kg (tub_2kg)</option>
                            <option value="piece">Pièce</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-1">
                          <Label htmlFor="purchasePrice" className="text-xs font-semibold text-slate-700">{"Prix d'achat unitaire (€) *"}</Label>
                          <Input 
                            id="purchasePrice" 
                            type="number" 
                            step="0.01" 
                            placeholder="ex: 120.50" 
                            value={purchasePrice}
                            onChange={(e) => setPurchasePrice(e.target.value)}
                            required 
                            className="border-slate-200" 
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label htmlFor="landedCost" className="text-xs font-semibold text-slate-700">Coût rendu calculé (€/unité de vente)</Label>
                          <Input 
                            id="landedCost" 
                            type="text" 
                            readOnly 
                            disabled
                            placeholder="Calculé automatiquement" 
                            value={landedCost ? `${landedCost} €` : ''} 
                            className="border-slate-200 bg-slate-50 cursor-not-allowed font-medium text-slate-700" 
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-1">
                          <Label htmlFor="transportCost" className="text-xs font-semibold text-slate-700">{"Frais de transport (€/unité de vente)"}</Label>
                          <Input 
                            id="transportCost" 
                            type="number" 
                            step="0.01" 
                            placeholder="0.00" 
                            value={transportCost}
                            onChange={(e) => setTransportCost(e.target.value)}
                            className="border-slate-200" 
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label htmlFor="handlingCost" className="text-xs font-semibold text-slate-700">{"Main-d'œuvre / Façon (€/unité de vente)"}</Label>
                          <Input 
                            id="handlingCost" 
                            type="number" 
                            step="0.01" 
                            placeholder="0.00" 
                            value={handlingCost}
                            onChange={(e) => setHandlingCost(e.target.value)}
                            className="border-slate-200" 
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-1">
                          <Label htmlFor="otherFixedCost" className="text-xs font-semibold text-slate-700">{"Autres frais fixes (€/unité de vente)"}</Label>
                          <Input 
                            id="otherFixedCost" 
                            type="number" 
                            step="0.01" 
                            placeholder="0.00" 
                            value={otherFixedCost}
                            onChange={(e) => setOtherFixedCost(e.target.value)}
                            className="border-slate-200" 
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label htmlFor="otherCostPercent" className="text-xs font-semibold text-slate-700">{"Autres frais variables (%)"}</Label>
                          <Input 
                            id="otherCostPercent" 
                            type="number" 
                            step="0.01" 
                            placeholder="0.00" 
                            value={otherCostPercent}
                            onChange={(e) => setOtherCostPercent(e.target.value)}
                            className="border-slate-200" 
                          />
                        </div>
                      </div>
                    </div>

                    <DialogFooter>
                      <DialogClose
                        render={
                          <Button type="button" variant="outline" className="border-slate-200">
                            Annuler
                          </Button>
                        }
                      />
                      <Button type="submit" disabled={isPending} className="bg-primary text-white hover:bg-primary/90">
                        {isPending ? 'Association...' : 'Associer'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {(!product.suppliers || product.suppliers.length === 0) ? (
              <div className="py-12 text-center text-slate-500 text-sm">
                {"Aucun fournisseur n'est associé à ce produit pour le moment."}
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="font-semibold text-slate-700">{"Fournisseur"}</TableHead>
                    <TableHead className="font-semibold text-slate-700">{"SKU Fournisseur"}</TableHead>
                    <TableHead className="font-semibold text-slate-700">{"Unité d'achat"}</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-right">Coût Rendu Brut</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-right">Rendu/unité de vente</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-right bg-slate-100/50">
                      Coût Matière Net (Rendement)
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {product.suppliers.map((sp) => {
                    const unitFactor = parseUnitFactor(sp.purchase_unit);
                    const rawPurchasePrice = parseFloat(sp.current_purchase_price);

                    const transport = parseFloat(String(sp.transport_cost || 0));
                    const handling = parseFloat(String(sp.handling_cost || 0));
                    const otherFixed = parseFloat(String(sp.other_fixed_cost || 0));
                    const otherPct = parseFloat(String(sp.other_cost_percent || 0));

                    // 1. Coût Rendu Brut (Rendement = 1.0)
                    const rawLandedResult = PricingEngine.calculateLandedCost({
                      purchasePrice: rawPurchasePrice,
                      conversionFactor: unitFactor,
                      yieldRate: 1.0,
                      transportCostPerSalesUnit: transport,
                      handlingCostPerSalesUnit: handling,
                      otherFixedCostPerSalesUnit: otherFixed,
                      otherCostPercent: otherPct,
                    });
                    const landedCostPerSalesUnit = rawLandedResult.landedCost.toNumber();
                    const landedCostPerPurchaseUnit = landedCostPerSalesUnit * unitFactor;

                    // 2. Coût Matière Net (Rendement = yieldRateNum)
                    const yieldLandedResult = PricingEngine.calculateLandedCost({
                      purchasePrice: rawPurchasePrice,
                      conversionFactor: unitFactor,
                      yieldRate: yieldRateNum,
                      transportCostPerSalesUnit: transport,
                      handlingCostPerSalesUnit: handling,
                      otherFixedCostPerSalesUnit: otherFixed,
                      otherCostPercent: otherPct,
                    });
                    const yieldAdjustedCost = yieldLandedResult.landedCost.toNumber();

                    const hasBreakdown = 
                      parseFloat(String(sp.transport_cost || 0)) > 0 || 
                      parseFloat(String(sp.handling_cost || 0)) > 0 || 
                      parseFloat(String(sp.other_fixed_cost || 0)) > 0 || 
                      parseFloat(String(sp.other_cost_percent || 0)) > 0;

                    return (
                      <TableRow key={sp.id} className="hover:bg-slate-50/50">
                        <TableCell className="font-medium text-slate-900">
                          {sp.suppliers?.name || 'Fournisseur inconnu'}
                        </TableCell>
                        <TableCell className="text-slate-500 font-mono text-xs">
                          {sp.supplier_sku || '-'}
                        </TableCell>
                        <TableCell className="text-slate-600">
                          {sp.purchase_unit}
                        </TableCell>
                        <TableCell className="text-right text-slate-600 text-xs">
                          <div className="font-medium text-slate-800">{landedCostPerPurchaseUnit.toFixed(2)} € / unit</div>
                          <div className="text-[10px] text-slate-400">({rawPurchasePrice.toFixed(2)} € achat)</div>
                        </TableCell>
                        <TableCell className="text-right text-slate-900 font-medium">
                          <div>{landedCostPerSalesUnit.toFixed(2)} € / {product.sales_unit}</div>
                          {hasBreakdown && (
                            <div className="text-[10px] text-slate-500 mt-1 space-y-0.5 border-t border-slate-100 pt-1 text-left inline-block w-full">
                              {parseFloat(String(sp.transport_cost || 0)) > 0 && (
                                <div>• Transp.: {parseFloat(String(sp.transport_cost)).toFixed(2)} €/{product.sales_unit}</div>
                              )}
                              {parseFloat(String(sp.handling_cost || 0)) > 0 && (
                                <div>• Main d'œ.: {parseFloat(String(sp.handling_cost)).toFixed(2)} €/{product.sales_unit}</div>
                              )}
                              {parseFloat(String(sp.other_fixed_cost || 0)) > 0 && (
                                <div>• F. Fixes: {parseFloat(String(sp.other_fixed_cost)).toFixed(2)} €/{product.sales_unit}</div>
                              )}
                              {parseFloat(String(sp.other_cost_percent || 0)) > 0 && (
                                <div>• F. Var.: {(parseFloat(String(sp.other_cost_percent)) * 100).toFixed(1)} %</div>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-primary font-bold bg-slate-50/50">
                          {yieldAdjustedCost.toFixed(2)} € / {product.sales_unit}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="icon-xs" 
                            className="text-slate-400 hover:text-destructive cursor-pointer"
                            onClick={() => handleUnlink(sp.id, sp.suppliers?.name || 'Fournisseur')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Info Card on Yield Calculations */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3 text-sm text-slate-600 max-w-2xl">
            <BadgeInfo className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-semibold text-slate-900">Comment le Coût Matière Net est-il calculé ?</h4>
              <p className="text-xs leading-normal">
                {"1. Nous ramenons le **Coût Rendu** à l'unité de vente interne ("}{product.sales_unit}{") selon le facteur d'unité d'achat (ex: caisse de 10kg = diviser par 10)."} <br />
                {"2. Nous appliquons le **Taux de rendement matière** (actuellement "}{(yieldRateNum * 100).toFixed(0)}{"%) pour compenser la perte au parage ou à la découpe."} <br />
                <span className="font-semibold text-primary">{"Formule : Coût Matière Net = Coût Rendu unitaire / Taux Rendement"}</span>
              </p>
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Edit Form */}
        <TabsContent value="edit" className="outline-none">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden p-6 max-w-xl">
            <form 
              key={`${product.id}-${product.name}-${product.internal_sku}-${product.sales_unit}-${product.default_yield_rate}-${product.is_active}`}
              onSubmit={handleUpdate} 
              className="space-y-4"
            >
              <div className="grid gap-1">
                <Label htmlFor="name" className="text-xs font-semibold text-slate-700">Nom du produit *</Label>
                <Input 
                  id="name" 
                  name="name" 
                  defaultValue={product.name} 
                  required 
                  className="border-slate-200" 
                />
              </div>

              <div className="grid gap-1">
                <Label htmlFor="internal_sku" className="text-xs font-semibold text-slate-700">SKU Interne *</Label>
                <Input 
                  id="internal_sku" 
                  name="internal_sku" 
                  defaultValue={product.internal_sku} 
                  required 
                  className="border-slate-200" 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="barcode" className="text-xs font-semibold text-slate-700">Code EAN / Code-barres</Label>
                  <Input 
                    id="barcode" 
                    name="barcode" 
                    defaultValue={product.barcode || ''} 
                    className="border-slate-200" 
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="sales_unit" className="text-xs font-semibold text-slate-700">Unité de vente *</Label>
                  <Input 
                    id="sales_unit" 
                    name="sales_unit" 
                    defaultValue={product.sales_unit} 
                    required 
                    className="border-slate-200" 
                  />
                </div>
              </div>

              <div className="grid gap-1">
                <Label htmlFor="default_yield_rate" className="text-xs font-semibold text-slate-700">Taux de rendement matière (0 à 1) *</Label>
                <Input 
                  id="default_yield_rate" 
                  name="default_yield_rate" 
                  type="number" 
                  step="0.001" 
                  min="0" 
                  max="1" 
                  defaultValue={product.default_yield_rate} 
                  required 
                  className="border-slate-200" 
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="isActive" 
                  name="isActive" 
                  value="true"
                  defaultChecked={product.is_active} 
                  className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4" 
                />
                <Label htmlFor="isActive" className="text-sm text-slate-700 font-medium cursor-pointer">
                  Produit actif
                </Label>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <Button type="submit" disabled={isPending} className="bg-primary hover:bg-primary/90 text-white font-semibold">
                  <Save className="h-4 w-4 mr-1.5" />
                  {isPending ? 'Enregistrement...' : 'Enregistrer les modifications'}
                </Button>
              </div>
            </form>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
