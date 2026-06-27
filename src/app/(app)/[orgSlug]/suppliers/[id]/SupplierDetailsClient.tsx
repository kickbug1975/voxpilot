'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { updateSupplier, applySupplierDefaultsToProducts } from '@/actions/suppliers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { ChevronLeft, Save, FileText, ShieldAlert, RefreshCw } from 'lucide-react';

interface SupplierProduct {
  id: string;
  supplier_sku: string | null;
  purchase_unit: string;
  current_purchase_price: string;
  current_landed_cost: string;
  product_id: string;
  products: {
    name: string;
    internal_sku: string;
  } | null;
}

interface Category {
  id: string;
  name: string;
  parent_id: string | null;
}

interface Supplier {
  id: string;
  name: string;
  code: string | null;
  email: string | null;
  phone: string | null;
  payment_terms: string | null;
  notes: string | null;
  is_active: boolean;
  products: SupplierProduct[];
  default_transport_cost?: number | string | null;
  default_handling_cost?: number | string | null;
  default_other_fixed_cost?: number | string | null;
  default_other_cost_percent?: number | string | null;
  default_category_id?: string | null;
}

interface SupplierDetailsClientProps {
  orgSlug: string;
  supplierId: string;
  initialSupplier: Supplier | null;
  categories: Category[];
  error: string | null;
}

export default function SupplierDetailsClient({
  orgSlug,
  supplierId,
  initialSupplier,
  categories,
  error: fetchError,
}: SupplierDetailsClientProps) {
  const [supplier, setSupplier] = useState<Supplier | null>(initialSupplier);
  const [error, setError] = useState<string | null>(fetchError);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isApplyingDefaults, setIsApplyingDefaults] = useState(false);
  const [applySuccess, setApplySuccess] = useState<string | null>(null);

  const handleApplyDefaultsToAll = async () => {
    setError(null);
    setApplySuccess(null);
    setIsApplyingDefaults(true);
    try {
      const result = await applySupplierDefaultsToProducts(orgSlug, supplierId);
      if (result.error) {
        throw new Error(result.error);
      }
      setApplySuccess(`Frais logistiques appliqués avec succès à ${result.count} article(s).`);
      setTimeout(() => setApplySuccess(null), 5000);
      
      // Refresh to pull new calculated landed costs in the associated products tab
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Une erreur est survenue.';
      setError(errMsg);
    } finally {
      setIsApplyingDefaults(false);
    }
  };

  if (!supplier) {
    return (
      <div className="space-y-4">
        <Link href={`/${orgSlug}/suppliers`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
          <ChevronLeft className="h-4 w-4" />
          Retour aux fournisseurs
        </Link>
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">
          Fournisseur introuvable.
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
        const result = await updateSupplier(orgSlug, supplierId, formData);
        if (result.error) {
          throw new Error(result.error);
        }
        if (result.data) {
          setSupplier(prev => ({
            ...prev!,
            ...result.data,
          }));
          setSuccess(true);
          // Hide success message after 3 seconds
          setTimeout(() => setSuccess(false), 3000);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Une erreur est survenue lors de la modification.';
        setError(errMsg);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Back button and page title */}
      <div className="flex flex-col gap-2">
        <Link 
          href={`/${orgSlug}/suppliers`} 
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-950 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Retour aux fournisseurs
        </Link>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            {supplier.name}
          </h2>
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${supplier.is_active ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-slate-100 text-slate-600'}`}>
            {supplier.is_active ? 'Actif' : 'Inactif'}
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
          Fiche fournisseur mise à jour avec succès !
        </div>
      )}

      <Tabs defaultValue="products" className="space-y-4">
        <TabsList className="bg-slate-100 p-1 border-b border-slate-200 w-full justify-start rounded-lg flex gap-1">
          <TabsTrigger value="products" className="rounded-md px-4 py-1.5 text-sm font-medium cursor-pointer">
            Produits associés ({supplier.products?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="edit" className="rounded-md px-4 py-1.5 text-sm font-medium cursor-pointer">
            Modifier la fiche
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Products list */}
        <TabsContent value="products" className="space-y-4 outline-none">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-500" />
              <h3 className="font-semibold text-slate-900 text-sm">Références tarifaires fournisseurs</h3>
            </div>

            {(!supplier.products || supplier.products.length === 0) ? (
              <div className="py-12 text-center text-slate-500 text-sm">
                {"Ce fournisseur n'a actuellement aucun produit associé."} <br />
                <span className="text-xs text-slate-400">
                  {"Associez des produits depuis l'écran « Produits » pour définir les tarifs et coûts de ce fournisseur."}
                </span>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="font-semibold text-slate-700">Produit Interne</TableHead>
                    <TableHead className="font-semibold text-slate-700">SKU Interne</TableHead>
                    <TableHead className="font-semibold text-slate-700">SKU Fournisseur</TableHead>
                    <TableHead className="font-semibold text-slate-700">{"Unité d'achat"}</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-right">{"Prix d'achat"}</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-right">Coût Rendu</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supplier.products.map((sp) => (
                    <TableRow key={sp.id} className="hover:bg-slate-50/50">
                      <TableCell className="font-medium text-slate-900">
                        {sp.products?.name || 'Produit inconnu'}
                      </TableCell>
                      <TableCell className="text-slate-500 font-mono text-xs">
                        {sp.products?.internal_sku || '-'}
                      </TableCell>
                      <TableCell className="text-slate-600 font-mono text-xs">
                        {sp.supplier_sku || '-'}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {sp.purchase_unit}
                      </TableCell>
                      <TableCell className="text-right text-slate-900 font-medium">
                        {sp.current_purchase_price ? `${parseFloat(sp.current_purchase_price).toFixed(2)} €` : '-'}
                      </TableCell>
                      <TableCell className="text-right text-slate-950 font-bold">
                        {sp.current_landed_cost ? `${parseFloat(sp.current_landed_cost).toFixed(2)} €` : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* Tab 2: Edit Form */}
        <TabsContent value="edit" className="outline-none">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden p-6 max-w-xl">
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="grid gap-1">
                <Label htmlFor="name" className="text-xs font-semibold text-slate-700">Nom du fournisseur *</Label>
                <Input 
                  id="name" 
                  name="name" 
                  defaultValue={supplier.name} 
                  required 
                  className="border-slate-200" 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="code" className="text-xs font-semibold text-slate-700">Code Fournisseur</Label>
                  <Input 
                    id="code" 
                    name="code" 
                    defaultValue={supplier.code || ''} 
                    className="border-slate-200" 
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="phone" className="text-xs font-semibold text-slate-700">Téléphone</Label>
                  <Input 
                    id="phone" 
                    name="phone" 
                    defaultValue={supplier.phone || ''} 
                    className="border-slate-200" 
                  />
                </div>
              </div>

              <div className="grid gap-1">
                <Label htmlFor="email" className="text-xs font-semibold text-slate-700">Adresse E-mail</Label>
                <Input 
                  id="email" 
                  name="email" 
                  type="email" 
                  defaultValue={supplier.email || ''} 
                  className="border-slate-200" 
                />
              </div>

              <div className="grid gap-1">
                <Label htmlFor="paymentTerms" className="text-xs font-semibold text-slate-700">Conditions de paiement</Label>
                <Input 
                  id="paymentTerms" 
                  name="paymentTerms" 
                  defaultValue={supplier.payment_terms || ''} 
                  className="border-slate-200" 
                />
              </div>

              <div className="grid gap-1">
                <Label htmlFor="notes" className="text-xs font-semibold text-slate-700">Notes</Label>
                <Input 
                  id="notes" 
                  name="notes" 
                  defaultValue={supplier.notes || ''} 
                  className="border-slate-200" 
                />
              </div>

              <div className="grid gap-1">
                <Label htmlFor="defaultCategoryId" className="text-xs font-semibold text-slate-700">Catégorie par défaut</Label>
                <select
                  id="defaultCategoryId"
                  name="defaultCategoryId"
                  defaultValue={supplier.default_category_id || ''}
                  className="flex h-8 w-full rounded-lg border border-slate-200 bg-transparent px-2.5 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Sélectionnez une catégorie...</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="border-t border-slate-100 pt-3 mt-1">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">Frais logistiques par défaut</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1">
                    <Label htmlFor="defaultTransportCost" className="text-xs font-semibold text-slate-700">Transport (€/u.v.)</Label>
                    <Input 
                      id="defaultTransportCost" 
                      name="defaultTransportCost" 
                      type="number" 
                      step="0.0001" 
                      min="0" 
                      placeholder="0.00" 
                      defaultValue={supplier.default_transport_cost !== undefined && supplier.default_transport_cost !== null ? String(supplier.default_transport_cost) : ''}
                      className="border-slate-200" 
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="defaultHandlingCost" className="text-xs font-semibold text-slate-700">Manutention (€/u.v.)</Label>
                    <Input 
                      id="defaultHandlingCost" 
                      name="defaultHandlingCost" 
                      type="number" 
                      step="0.0001" 
                      min="0" 
                      placeholder="0.00" 
                      defaultValue={supplier.default_handling_cost !== undefined && supplier.default_handling_cost !== null ? String(supplier.default_handling_cost) : ''}
                      className="border-slate-200" 
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="defaultOtherFixedCost" className="text-xs font-semibold text-slate-700">Autre fixe (€/u.v.)</Label>
                    <Input 
                      id="defaultOtherFixedCost" 
                      name="defaultOtherFixedCost" 
                      type="number" 
                      step="0.0001" 
                      min="0" 
                      placeholder="0.00" 
                      defaultValue={supplier.default_other_fixed_cost !== undefined && supplier.default_other_fixed_cost !== null ? String(supplier.default_other_fixed_cost) : ''}
                      className="border-slate-200" 
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="defaultOtherCostPercent" className="text-xs font-semibold text-slate-700">Autre proportionnel (%)</Label>
                    <Input 
                      id="defaultOtherCostPercent" 
                      name="defaultOtherCostPercent" 
                      type="number" 
                      step="0.01" 
                      min="0" 
                      placeholder="0.00" 
                      defaultValue={supplier.default_other_cost_percent !== undefined && supplier.default_other_cost_percent !== null ? String(parseFloat(String(supplier.default_other_cost_percent)) * 100) : ''}
                      className="border-slate-200" 
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleApplyDefaultsToAll}
                  disabled={isApplyingDefaults || isPending}
                  className="w-full border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 h-auto"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isApplyingDefaults ? 'animate-spin' : ''}`} />
                  {isApplyingDefaults ? 'Application en cours...' : 'Appliquer ces frais et la catégorie à tous les articles existants'}
                </Button>
                <p className="text-[10px] text-slate-500 mt-1">
                  {"* Met à jour en bloc tous les articles associés à ce fournisseur avec les frais et la catégorie par défaut ci-dessus (enregistrez d'abord s'ils ont été modifiés) et recalcule leurs coûts rendus."}
                </p>
              </div>

              {applySuccess && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium mt-2">
                  {applySuccess}
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="isActive" 
                  name="isActive" 
                  value="true"
                  defaultChecked={supplier.is_active} 
                  className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4" 
                />
                <Label htmlFor="isActive" className="text-sm text-slate-700 font-medium cursor-pointer">
                  Fournisseur actif
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
