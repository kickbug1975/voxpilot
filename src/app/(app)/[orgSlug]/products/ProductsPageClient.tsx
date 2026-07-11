'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { createProduct, deleteProduct, bulkUpdateYieldRate } from '@/actions/products';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Search, Plus, Eye, Trash2, ShieldAlert } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  internal_sku: string;
  barcode: string | null;
  sales_unit: string;
  default_yield_rate: string;
  is_active: boolean;
}

interface ProductsPageClientProps {
  orgSlug: string;
  initialProducts: Product[];
  error: string | null;
}

export default function ProductsPageClient({ 
  orgSlug, 
  initialProducts, 
  error: fetchError 
}: ProductsPageClientProps) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(fetchError);
  const [isPending, startTransition] = useTransition();

  // États pour la sélection multiple et l'édition en masse
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [yieldValue, setYieldValue] = useState<string>('1.0');

  // Filtrer les produits basés sur la recherche
  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.internal_sku.toLowerCase().includes(search.toLowerCase()) ||
    (p.barcode && p.barcode.toLowerCase().includes(search.toLowerCase()))
  );

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredProducts.map(p => p.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(x => x !== id));
    }
  };

  const handleBulkUpdate = () => {
    const parsedYield = parseFloat(yieldValue);
    if (isNaN(parsedYield) || parsedYield < 0 || parsedYield > 1) {
      alert('Veuillez saisir un rendement valide entre 0 et 1.');
      return;
    }

    startTransition(async () => {
      try {
        const res = await bulkUpdateYieldRate(orgSlug, selectedIds, parsedYield);
        if (res.error) {
          throw new Error(res.error);
        }
        
        // Mettre à jour localement
        setProducts(prev => 
          prev.map(p => 
            selectedIds.includes(p.id) 
              ? { ...p, default_yield_rate: String(parsedYield) } 
              : p
          )
        );
        setSelectedIds([]);
        setIsBulkOpen(false);
      } catch (err: any) {
        alert(err.message || 'Impossible de modifier les rendements.');
      }
    });
  };


  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const result = await createProduct(orgSlug, formData);
        if (result.error) {
          throw new Error(result.error);
        }
        if (result.data) {
          setProducts(prev => [...prev, result.data as Product].sort((a, b) => a.name.localeCompare(b.name)));
          setIsCreateOpen(false);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Une erreur est survenue.';
        setError(errMsg);
      }
    });
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le produit "${name}" ?`)) return;

    try {
      const result = await deleteProduct(orgSlug, id);
      if (result.error) {
        throw new Error(result.error);
      }
      setProducts(prev => prev.filter(p => p.id !== id));
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Impossible de supprimer le produit.';
      setError(errMsg);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Produits Internes</h2>
          <p className="text-sm text-slate-500">
            Gérez vos fiches produits internes, leurs codes SKU et leurs coefficients de rendement matière.
          </p>
        </div>

        {/* Create Product Dialog */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger
            render={
              <Button className="bg-primary hover:bg-primary/90 text-white font-semibold cursor-pointer">
                <Plus className="h-4 w-4 mr-1.5" />
                Nouveau produit
              </Button>
            }
          />
          <DialogContent className="sm:max-w-md bg-white border border-slate-200 shadow-xl rounded-xl">
            <form onSubmit={handleCreate}>
              <DialogHeader>
                <DialogTitle className="text-lg font-bold text-slate-900">Ajouter un produit</DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Remplissez les informations ci-dessous pour créer une nouvelle fiche produit.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="grid gap-1">
                  <Label htmlFor="name" className="text-xs font-semibold text-slate-700">Nom du produit *</Label>
                  <Input id="name" name="name" placeholder="ex: Saumon Atlantique Pavé" required className="border-slate-200" />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="internal_sku" className="text-xs font-semibold text-slate-700">SKU Interne *</Label>
                  <Input id="internal_sku" name="internal_sku" placeholder="ex: PR-SAUMON-PAVE" required className="border-slate-200" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1">
                    <Label htmlFor="barcode" className="text-xs font-semibold text-slate-700">Code EAN / Code-barres</Label>
                    <Input id="barcode" name="barcode" placeholder="ex: 5412345678901" className="border-slate-200" />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="sales_unit" className="text-xs font-semibold text-slate-700">Unité de vente *</Label>
                    <Input id="sales_unit" name="sales_unit" placeholder="ex: kg" defaultValue="kg" required className="border-slate-200" />
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
                    placeholder="ex: 0.92" 
                    defaultValue="1" 
                    required 
                    className="border-slate-200" 
                  />
                  <p className="text-[10px] text-slate-400">
                    ex: 0.920 pour un saumon avec 8% de perte au parage (rendement de 92%).
                  </p>
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
                  {isPending ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Global Alert */}
      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Search and Table Area */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {/* Search Bar */}
        <div className="p-4 border-b border-slate-200 flex items-center gap-2 bg-slate-50/50">
          <Search className="h-4 w-4 text-slate-400" />
          <Input 
            type="text" 
            placeholder="Rechercher par nom, SKU ou code-barres..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-none bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 placeholder-slate-400 p-0 text-sm max-w-sm"
          />
        </div>

        {/* Products Table */}
        {filteredProducts.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            Aucun produit trouvé.
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="w-10 px-4">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === filteredProducts.length && filteredProducts.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                  />
                </TableHead>
                <TableHead className="font-semibold text-slate-700 w-1/3">Nom du produit</TableHead>
                <TableHead className="font-semibold text-slate-700">SKU Interne</TableHead>
                <TableHead className="font-semibold text-slate-700">Code EAN</TableHead>
                <TableHead className="font-semibold text-slate-700">Unité de vente</TableHead>
                <TableHead className="font-semibold text-slate-700 text-right">Rendement de base</TableHead>
                <TableHead className="font-semibold text-slate-700 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => (
                <TableRow 
                  key={product.id} 
                  className={`hover:bg-slate-50/50 transition-colors ${
                    selectedIds.includes(product.id) ? 'bg-indigo-50/20' : ''
                  }`}
                >
                  <TableCell className="px-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(product.id)}
                      onChange={(e) => handleSelectOne(product.id, e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                    />
                  </TableCell>
                  <TableCell className="font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${product.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      {product.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600 font-mono text-xs font-semibold">
                    {product.internal_sku}
                  </TableCell>
                  <TableCell className="text-slate-500 font-mono text-xs">
                    {product.barcode || '-'}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {product.sales_unit}
                  </TableCell>
                  <TableCell className="text-right text-slate-900 font-medium">
                    {(parseFloat(product.default_yield_rate) * 100).toFixed(1)} %
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-2">
                      <Link href={`/${orgSlug}/products/${product.id}`}>
                        <Button variant="ghost" size="icon-xs" className="text-slate-500 hover:text-primary">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button 
                        variant="ghost" 
                        size="icon-xs" 
                        className="text-slate-400 hover:text-destructive"
                        onClick={() => handleDelete(product.id, product.name)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* 🛒 BARRE D'ACTIONS GROUPÉES FLOTTANTE */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white rounded-2xl px-6 py-4 shadow-2xl flex items-center gap-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-2">
            <span className="h-5 w-5 bg-indigo-600 text-[11px] font-bold rounded-full flex items-center justify-center">
              {selectedIds.length}
            </span>
            <span className="text-xs font-semibold text-slate-200">sélectionnés</span>
          </div>
          
          <div className="h-4 w-px bg-slate-800" />
          
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setSelectedIds([])}
              className="text-slate-400 hover:text-white hover:bg-slate-800 text-xs py-1 h-8"
            >
              Annuler
            </Button>
            <Button 
              size="sm"
              onClick={() => {
                setYieldValue('1.0');
                setIsBulkOpen(true);
              }}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-1 h-8"
            >
              Modifier rendement
            </Button>
          </div>
        </div>
      )}

      {/* 🎛️ MODAL D'ÉDITION DE RENDEMENT EN MASSE */}
      <Dialog open={isBulkOpen} onOpenChange={setIsBulkOpen}>
        <DialogContent className="sm:max-w-md bg-white border border-slate-200 shadow-xl rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Rendement de la sélection ({selectedIds.length} produits)
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Saisissez le taux de rendement matière par défaut (entre 0 et 1) à appliquer pour les articles sélectionnés.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Saisie personnalisée */}
            <div className="grid gap-1">
              <Label htmlFor="bulk_yield_rate" className="text-xs font-semibold text-slate-700">
                Taux de rendement matière (ex: 1 pour entier, 0.5 pour filet, 0.4 pour dos)
              </Label>
              <Input 
                id="bulk_yield_rate"
                type="number"
                step="0.001"
                min="0"
                max="1"
                value={yieldValue}
                onChange={(e) => setYieldValue(e.target.value)}
                placeholder="ex: 0.52"
                className="border-slate-200 font-mono text-sm"
              />
              <p className="text-[10px] text-slate-400">
                ex: 0.500 pour appliquer 50% de rendement (50% de perte au parage).
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setIsBulkOpen(false)}
              className="border-slate-200"
            >
              Annuler
            </Button>
            <Button 
              onClick={handleBulkUpdate}
              disabled={isPending} 
              className="bg-primary text-white hover:bg-primary/90"
            >
              {isPending ? 'Mise à jour...' : 'Appliquer aux produits'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
