'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { createSupplier, deleteSupplier } from '@/actions/suppliers';
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

interface Supplier {
  id: string;
  name: string;
  code: string | null;
  email: string | null;
  phone: string | null;
  payment_terms: string | null;
  is_active: boolean;
  default_transport_cost?: number | string | null;
  default_handling_cost?: number | string | null;
  default_other_fixed_cost?: number | string | null;
  default_other_cost_percent?: number | string | null;
  default_category_id?: string | null;
}

interface Category {
  id: string;
  name: string;
  parent_id: string | null;
}

interface SuppliersPageClientProps {
  orgSlug: string;
  initialSuppliers: Supplier[];
  categories: Category[];
  error: string | null;
}

export default function SuppliersPageClient({ 
  orgSlug, 
  initialSuppliers, 
  categories,
  error: fetchError 
}: SuppliersPageClientProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(fetchError);
  const [isPending, startTransition] = useTransition();

  // Filter suppliers based on search
  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    (s.code && s.code.toLowerCase().includes(search.toLowerCase()))
  );

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const result = await createSupplier(orgSlug, formData);
        if (result.error) {
          throw new Error(result.error);
        }
        if (result.data) {
          setSuppliers(prev => [...prev, result.data as Supplier].sort((a, b) => a.name.localeCompare(b.name)));
          setIsCreateOpen(false);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Une erreur est survenue.';
        setError(errMsg);
      }
    });
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le fournisseur "${name}" ?`)) return;

    try {
      const result = await deleteSupplier(orgSlug, id);
      if (result.error) {
        throw new Error(result.error);
      }
      setSuppliers(prev => prev.filter(s => s.id !== id));
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Impossible de supprimer le fournisseur.';
      setError(errMsg);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Fournisseurs</h2>
          <p className="text-sm text-slate-500">
            {"Gérez vos fournisseurs de marée, leurs conditions de paiement et leurs codes d'import."}
          </p>
        </div>

        {/* Create Supplier Dialog */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger
            render={
              <Button className="bg-primary hover:bg-primary/90 text-white font-semibold cursor-pointer">
                <Plus className="h-4 w-4 mr-1.5" />
                Nouveau fournisseur
              </Button>
            }
          />
          <DialogContent className="sm:max-w-md bg-white border border-slate-200 shadow-xl rounded-xl">
            <form onSubmit={handleCreate}>
              <DialogHeader>
                <DialogTitle className="text-lg font-bold text-slate-900">Ajouter un fournisseur</DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Remplissez les informations ci-dessous pour créer un nouveau fournisseur.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="grid gap-1">
                  <Label htmlFor="name" className="text-xs font-semibold text-slate-700">Nom du fournisseur *</Label>
                  <Input id="name" name="name" placeholder="ex: OceanNord Import" required className="border-slate-200" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1">
                    <Label htmlFor="code" className="text-xs font-semibold text-slate-700">Code Fournisseur</Label>
                    <Input id="code" name="code" placeholder="ex: SU-OCEAN" className="border-slate-200" />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="phone" className="text-xs font-semibold text-slate-700">Téléphone</Label>
                    <Input id="phone" name="phone" placeholder="ex: +32 2..." className="border-slate-200" />
                  </div>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="email" className="text-xs font-semibold text-slate-700">Adresse E-mail</Label>
                  <Input id="email" name="email" type="email" placeholder="contact@fournisseur.com" className="border-slate-200" />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="paymentTerms" className="text-xs font-semibold text-slate-700">Conditions de paiement</Label>
                  <Input id="paymentTerms" name="paymentTerms" placeholder="ex: 30 jours fin de mois" className="border-slate-200" />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="notes" className="text-xs font-semibold text-slate-700">Notes</Label>
                  <Input id="notes" name="notes" placeholder="Notes particulières..." className="border-slate-200" />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="defaultCategoryId" className="text-xs font-semibold text-slate-700">Catégorie par défaut</Label>
                  <select
                    id="defaultCategoryId"
                    name="defaultCategoryId"
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
                      <Input id="defaultTransportCost" name="defaultTransportCost" type="number" step="0.0001" min="0" placeholder="0.00" className="border-slate-200" />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="defaultHandlingCost" className="text-xs font-semibold text-slate-700">Manutention (€/u.v.)</Label>
                      <Input id="defaultHandlingCost" name="defaultHandlingCost" type="number" step="0.0001" min="0" placeholder="0.00" className="border-slate-200" />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="defaultOtherFixedCost" className="text-xs font-semibold text-slate-700">Autre fixe (€/u.v.)</Label>
                      <Input id="defaultOtherFixedCost" name="defaultOtherFixedCost" type="number" step="0.0001" min="0" placeholder="0.00" className="border-slate-200" />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="defaultOtherCostPercent" className="text-xs font-semibold text-slate-700">Autre proportionnel (%)</Label>
                      <Input id="defaultOtherCostPercent" name="defaultOtherCostPercent" type="number" step="0.01" min="0" placeholder="0.00" className="border-slate-200" />
                    </div>
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
            placeholder="Rechercher par nom ou code fournisseur..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-none bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 placeholder-slate-400 p-0 text-sm max-w-sm"
          />
        </div>

        {/* Suppliers Table */}
        {filteredSuppliers.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            Aucun fournisseur trouvé.
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="font-semibold text-slate-700 w-1/4">Nom</TableHead>
                <TableHead className="font-semibold text-slate-700">Code</TableHead>
                <TableHead className="font-semibold text-slate-700">E-mail</TableHead>
                <TableHead className="font-semibold text-slate-700">Téléphone</TableHead>
                <TableHead className="font-semibold text-slate-700">Conditions</TableHead>
                <TableHead className="font-semibold text-slate-700 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSuppliers.map((supplier) => (
                <TableRow key={supplier.id} className="hover:bg-slate-50/50">
                  <TableCell className="font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${supplier.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      {supplier.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600 font-mono text-xs">
                    {supplier.code || '-'}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {supplier.email || '-'}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {supplier.phone || '-'}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {supplier.payment_terms || '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-2">
                      <Link href={`/${orgSlug}/suppliers/${supplier.id}`}>
                        <Button variant="ghost" size="icon-xs" className="text-slate-500 hover:text-primary">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button 
                        variant="ghost" 
                        size="icon-xs" 
                        className="text-slate-400 hover:text-destructive"
                        onClick={() => handleDelete(supplier.id, supplier.name)}
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
