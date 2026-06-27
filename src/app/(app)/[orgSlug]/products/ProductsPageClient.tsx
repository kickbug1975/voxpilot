'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { createProduct, deleteProduct } from '@/actions/products';
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

  // Filter products based on search
  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.internal_sku.toLowerCase().includes(search.toLowerCase()) ||
    (p.barcode && p.barcode.toLowerCase().includes(search.toLowerCase()))
  );

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
                <TableRow key={product.id} className="hover:bg-slate-50/50">
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
    </div>
  );
}
