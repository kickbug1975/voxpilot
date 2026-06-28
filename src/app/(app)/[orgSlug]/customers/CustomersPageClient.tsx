'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { createCustomer, deleteCustomer } from '@/actions/customers';
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

interface Customer {
  id: string;
  name: string;
  code: string | null;
  segment: string;
  email: string | null;
  phone: string | null;
  payment_terms: string | null;
  is_active: boolean;
}

interface CustomersPageClientProps {
  orgSlug: string;
  initialCustomers: Customer[];
  error: string | null;
}

export default function CustomersPageClient({ 
  orgSlug, 
  initialCustomers, 
  error: fetchError 
}: CustomersPageClientProps) {
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(fetchError);
  const [isPending, startTransition] = useTransition();

  // Filter customers based on search
  const filteredCustomers = customers.filter(c => 
    (c.name && c.name.toLowerCase().includes(search.toLowerCase())) || 
    (c.code && c.code.toLowerCase().includes(search.toLowerCase())) ||
    (c.segment && c.segment.toLowerCase().includes(search.toLowerCase()))
  );

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const result = await createCustomer(orgSlug, formData);
        if (result.error) {
          throw new Error(result.error);
        }
        if (result.data) {
          setCustomers(prev => [...prev, result.data as Customer].sort((a, b) => a.name.localeCompare(b.name)));
          setIsCreateOpen(false);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Une erreur est survenue.';
        setError(errMsg);
      }
    });
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le client "${name}" ?`)) return;

    try {
      const result = await deleteCustomer(orgSlug, id);
      if (result.error) {
        throw new Error(result.error);
      }
      setCustomers(prev => prev.filter(c => c.id !== id));
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Impossible de supprimer le client.';
      setError(errMsg);
    }
  };

  // Convert segment label to French
  const getSegmentLabel = (segment: string | null | undefined) => {
    if (!segment) return 'Non spécifié';
    switch (segment) {
      case 'retail': return 'Détail (Poissonnerie, Marché)';
      case 'grossiste': return 'Grossiste / Demi-gros';
      case 'horeca': return 'Horeca (Hôtel, Resto, Café)';
      case 'collectivite': return 'Collectivité (Cantine, Hôpital)';
      case 'autre': return 'Autre';
      default: return segment;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Clients</h2>
          <p className="text-sm text-slate-500">
            Gérez votre base de clients, affectez-leur un segment pour les marges par défaut ou des règles spécifiques.
          </p>
        </div>

        {/* Create Customer Link */}
        <Link href={`/${orgSlug}/customers/new`}>
          <Button className="bg-primary hover:bg-primary/90 text-white font-semibold cursor-pointer">
            <Plus className="h-4 w-4 mr-1.5" />
            Nouveau client
          </Button>
        </Link>
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
            placeholder="Rechercher par nom, code ou segment..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-none bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 placeholder-slate-400 p-0 text-sm max-w-sm"
          />
        </div>

        {/* Customers Table */}
        {filteredCustomers.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            Aucun client trouvé.
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="font-semibold text-slate-700 w-1/4">Nom</TableHead>
                <TableHead className="font-semibold text-slate-700">Code</TableHead>
                <TableHead className="font-semibold text-slate-700">Segment</TableHead>
                <TableHead className="font-semibold text-slate-700">E-mail</TableHead>
                <TableHead className="font-semibold text-slate-700">Téléphone</TableHead>
                <TableHead className="font-semibold text-slate-700">Conditions</TableHead>
                <TableHead className="font-semibold text-slate-700 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.map((customer) => (
                <TableRow key={customer.id} className="hover:bg-slate-50/50">
                  <TableCell className="font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${customer.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      {customer.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600 font-mono text-xs">
                    {customer.code || '-'}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
                      {getSegmentLabel(customer.segment)}
                    </span>
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {customer.email || '-'}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {customer.phone || '-'}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {customer.payment_terms || '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-2">
                      <Link href={`/${orgSlug}/customers/${customer.id}`}>
                        <Button variant="ghost" size="icon-xs" className="text-slate-500 hover:text-primary">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button 
                        variant="ghost" 
                        size="icon-xs" 
                        className="text-slate-400 hover:text-destructive"
                        onClick={() => handleDelete(customer.id, customer.name)}
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
