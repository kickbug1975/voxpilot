'use client';

import React, { useState, useTransition, useMemo } from 'react';
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
  Search, Plus, ShieldAlert, CheckCircle2, 
  FileText, ChevronRight, Filter, RefreshCw 
} from 'lucide-react';
import { createQuote } from '@/actions/quotes';

interface Customer {
  id: string;
  name: string;
}

interface Quote {
  id: string;
  quote_number: string;
  revision: number;
  title: string;
  status: string;
  issue_date: string;
  expires_at: string | null;
  grand_total: number | null;
  has_complete_quantities: boolean | null;
  customers?: { legal_name: string } | null;
}

interface QuotesPageClientProps {
  orgSlug: string;
  initialQuotes: Quote[];
  customers: Customer[];
  error: string | null;
}

export default function QuotesPageClient({
  orgSlug,
  initialQuotes,
  customers,
  error: fetchError,
}: QuotesPageClientProps) {
  const router = useRouter();
  const [quotes] = useState<Quote[]>(initialQuotes);
  const [error, setError] = useState<string | null>(fetchError);
  const [success, setSuccess] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  // Create Quote Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [newQuoteTitle, setNewQuoteTitle] = useState('');

  // Filtering State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredQuotes = useMemo(() => {
    return quotes.filter((q) => {
      const matchesSearch = 
        q.quote_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (q.customers?.legal_name || '').toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || q.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [quotes, searchQuery, statusFilter]);

  const handleCreateQuoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!selectedCustomerId) {
      setError("Veuillez sélectionner un client.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await createQuote(orgSlug, selectedCustomerId, newQuoteTitle);
        if (result.error) {
          throw new Error(result.error);
        }
        setSuccess("Devis initialisé avec succès ! Redirection...");
        setIsModalOpen(false);
        if (result.quoteId) {
          router.push(`/${orgSlug}/quotes/${result.quoteId}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur lors de la création du devis.");
      }
    });
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-slate-100 text-slate-700 border border-slate-200';
      case 'sent': return 'bg-sky-50 text-sky-700 border border-sky-200';
      case 'viewed': return 'bg-indigo-50 text-indigo-700 border border-indigo-200';
      case 'accepted': return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      case 'rejected': return 'bg-rose-50 text-rose-700 border border-rose-200';
      case 'expired': return 'bg-amber-50 text-amber-700 border border-amber-200';
      case 'cancelled': return 'bg-slate-150 text-slate-400 border border-slate-250';
      default: return 'bg-slate-50 text-slate-500';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft': return 'Brouillon';
      case 'sent': return 'Envoyé';
      case 'viewed': return 'Visionné';
      case 'accepted': return 'Accepté';
      case 'rejected': return 'Refusé';
      case 'expired': return 'Expiré';
      case 'cancelled': return 'Annulé';
      default: return status;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">{"Offres & Devis"}</h2>
          <p className="text-sm text-slate-500">
            {"Générez, analysez et gérez vos offres de prix et catalogues de cotations client."}
          </p>
        </div>
        <Button 
          onClick={() => {
            setSelectedCustomerId('');
            setNewQuoteTitle('');
            setIsModalOpen(true);
          }}
          className="bg-primary hover:bg-primary/90 text-white font-semibold cursor-pointer shadow-xs self-start"
        >
          <Plus className="h-4 w-4 mr-2" />
          {"Nouveau Devis"}
        </Button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
        <div className="relative w-full md:max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Rechercher par n°, titre, client..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-sm"
          />
        </div>

        <div className="flex w-full md:w-auto items-center gap-2.5 self-stretch md:self-auto justify-end">
          <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 whitespace-nowrap">
            <Filter className="h-3.5 w-3.5" />
            {"Statut :"}
          </span>
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex h-9 w-full md:w-40 rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="all">{"Tous les devis"}</option>
            <option value="draft">{"Brouillons"}</option>
            <option value="sent">{"Envoyés"}</option>
            <option value="viewed">{"Visionnés"}</option>
            <option value="accepted">{"Acceptés"}</option>
            <option value="rejected">{"Refusés"}</option>
            <option value="expired">{"Expirés"}</option>
            <option value="cancelled">{"Annulés"}</option>
          </select>
        </div>
      </div>

      {/* Table grid */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {filteredQuotes.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm">
            <FileText className="h-10 w-10 text-slate-350 mx-auto mb-3" />
            <p className="font-semibold text-slate-700">{"Aucun devis trouvé"}</p>
            <p className="text-xs text-slate-400 mt-1">{"Créez un nouveau devis pour démarrer vos simulations."}</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="font-bold text-slate-700 w-36">{"Numéro"}</TableHead>
                <TableHead className="font-bold text-slate-700">{"Client"}</TableHead>
                <TableHead className="font-bold text-slate-700">{"Titre du devis"}</TableHead>
                <TableHead className="font-bold text-slate-700">{"Date d'émission"}</TableHead>
                <TableHead className="font-bold text-slate-700 text-center w-24">{"Révision"}</TableHead>
                <TableHead className="font-bold text-slate-700 text-center">{"Statut"}</TableHead>
                <TableHead className="font-bold text-slate-700 text-right">{"Montant (TTC)"}</TableHead>
                <TableHead className="font-bold text-slate-700 text-right w-24">{"Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredQuotes.map((q) => (
                <TableRow key={q.id} className="hover:bg-slate-50/50">
                  <TableCell className="font-semibold text-slate-900 font-mono text-xs">
                    {q.quote_number}
                  </TableCell>
                  <TableCell className="font-medium text-slate-900">
                    {q.customers?.legal_name || 'Client inconnu'}
                  </TableCell>
                  <TableCell className="text-slate-650 font-medium">
                    {q.title}
                  </TableCell>
                  <TableCell className="text-slate-500 text-xs">
                    {new Date(q.issue_date).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric'
                    })}
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs text-slate-600">
                    {`v${q.revision}`}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${getStatusBadgeClass(q.status)}`}>
                      {getStatusLabel(q.status)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-bold text-slate-800 text-xs font-mono">
                    {q.has_complete_quantities && q.grand_total !== null
                      ? `${q.grand_total.toFixed(2)} €`
                      : <span className="text-[10px] font-semibold text-slate-400 italic">{"Catalogue / Tarif"}</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/${orgSlug}/quotes/${q.id}`)}
                      className="text-primary hover:bg-primary/5 cursor-pointer font-semibold"
                    >
                      {q.status === 'draft' ? "Modifier" : "Voir"}
                      <ChevronRight className="h-4 w-4 ml-0.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* ====================================================================== */}
      {/* MODAL: INITIALIZE NEW QUOTE                                            */}
      {/* ====================================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
          <div className="relative w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden p-6 space-y-4">
            <h3 className="font-bold text-slate-900 text-lg">{"Créer un nouveau devis"}</h3>
            <p className="text-xs text-slate-500">
              {"Sélectionnez le client pour lequel vous souhaitez créer ce devis d'offre commerciale."}
            </p>

            <form onSubmit={handleCreateQuoteSubmit} className="space-y-4">
              <div className="grid gap-1.5">
                <Label htmlFor="cust-select" className="text-xs font-semibold text-slate-700">{"Client *"}</Label>
                <select
                  id="cust-select"
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  required
                  className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">{"Sélectionnez un client..."}</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="quote-title" className="text-xs font-semibold text-slate-700">{"Titre du devis (Optionnel)"}</Label>
                <Input
                  id="quote-title"
                  placeholder="Ex: Cotation Poissonnerie Juillet"
                  value={newQuoteTitle}
                  onChange={(e) => setNewQuoteTitle(e.target.value)}
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isPending}
                  className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer font-semibold"
                >
                  {"Annuler"}
                </Button>
                <Button
                  type="submit"
                  disabled={isPending || !selectedCustomerId}
                  className="bg-primary hover:bg-primary/95 text-white font-semibold text-xs cursor-pointer shadow-xs"
                >
                  {isPending ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin mr-1.5" />
                      {"Initialisation..."}
                    </>
                  ) : "Créer le brouillon"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
