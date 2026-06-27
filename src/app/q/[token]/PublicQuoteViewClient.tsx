'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { 
  Check, X, FileDown, 
  CheckCircle2, AlertCircle, 
  Clock, Info 
} from 'lucide-react';
import { submitPublicDecision } from '@/actions/publicQuotes';

interface QuoteItem {
  id: string;
  position: number;
  product_snapshot: { name: string; internal_sku: string; barcode: string | null } | null;
  description: string | null;
  sales_unit: string | null;
  quantity: number | null;
  unit_price: number;
  discount_rate: number;
  net_unit_price: number;
  tax_rate: number | null;
  line_subtotal: number | null;
}

interface Quote {
  id: string;
  quote_number: string;
  revision: number;
  title: string;
  status: string;
  issue_date: string;
  expires_at: string | null;
  public_note: string | null;
  terms: string | null;
  subtotal: number | null;
  tax_total: number | null;
  grand_total: number | null;
  has_complete_quantities: boolean | null;
  contact_name: string | null;
  contact_email: string | null;
  customers: { legal_name: string; primary_email: string | null } | null;
  accepted_at: string | null;
  rejected_at: string | null;
  viewed_at: string | null;
  sent_at: string | null;
}

interface Organization {
  name: string;
  logo_path: string | null;
  phone: string | null;
  commercial_email: string | null;
  address: any;
}

interface PublicQuoteViewClientProps {
  quote: Quote;
  items: QuoteItem[];
  organization: Organization;
  token: string;
}

export default function PublicQuoteViewClient({
  quote,
  items,
  organization,
  token,
}: PublicQuoteViewClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Interactive decision panel states
  const [action, setAction] = useState<'accept' | 'reject' | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientRole, setClientRole] = useState('');
  const [comment, setComment] = useState('');
  const [consentChecked, setConsentChecked] = useState(false);

  // Helper to format currency
  const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '-';
    return new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(val);
  };

  // Helper to format date
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const handleDecisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!action) return;

    if (!clientName.trim()) {
      setError("Veuillez renseigner votre nom complet.");
      return;
    }

    if (action === 'accept' && !consentChecked) {
      setError("Vous devez cocher la case d'intention commerciale pour accepter l'offre.");
      return;
    }

    if (action === 'reject' && !comment.trim()) {
      setError("Veuillez renseigner le motif de votre refus.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await submitPublicDecision(
          token,
          action === 'accept' ? 'accepted' : 'rejected',
          clientName,
          clientRole,
          comment
        );

        if (res.error) {
          throw new Error(res.error);
        }

        setSuccess(
          action === 'accept'
            ? "Merci ! L'offre a été acceptée avec succès. Votre conseiller a été informé."
            : "Merci. Votre refus a été enregistré avec le motif indiqué."
        );
        
        setAction(null);
        // Refresh server component data
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Une erreur est survenue lors de l'enregistrement.");
      }
    });
  };

  const isFinalised = quote.status === 'accepted' || quote.status === 'rejected';

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* 1. STATUS HEADER NOTIFICATION CARD */}
      {quote.status === 'accepted' && (
        <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-850 flex items-start gap-4 shadow-xs">
          <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-emerald-900 text-base">{"Offre acceptée"}</h4>
            <p className="text-sm">
              {`Cette offre commerciale a été validée le `}
              <strong>{formatDate(quote.accepted_at)}</strong>
              {`. Un e-mail de confirmation contenant le devis PDF a été envoyé aux parties prenantes.`}
            </p>
          </div>
        </div>
      )}

      {quote.status === 'rejected' && (
        <div className="p-5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-850 flex items-start gap-4 shadow-xs">
          <div className="h-10 w-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200">
            <X className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-rose-900 text-base">{"Offre déclinée"}</h4>
            <p className="text-sm">
              {`Cette offre a été refusée le `}
              <strong>{formatDate(quote.rejected_at)}</strong>
              {`. Le vendeur a été alerté pour ajuster la proposition si nécessaire.`}
            </p>
          </div>
        </div>
      )}

      {/* 2. ACTIONS PANEL FOR SENT/VIEWED STATUS */}
      {!isFinalised && (
        <Card className="border border-slate-200 shadow-sm rounded-2xl overflow-hidden bg-white">
          <div className="p-6 border-b border-slate-150 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Clock className="h-4.5 w-4.5 text-slate-500" />
                <span>{"Proposition en attente de décision"}</span>
              </h3>
              <p className="text-xs text-slate-500">
                {"Prenez connaissance du devis et validez-le en ligne en quelques clics."}
              </p>
            </div>
            
            <div className="flex items-center gap-3 self-start md:self-auto">
              <Button
                variant="outline"
                onClick={() => {
                  setAction('reject');
                  setError(null);
                  setSuccess(null);
                }}
                className="text-xs border-slate-250 text-slate-650 hover:bg-slate-50 cursor-pointer font-semibold"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                {"Décliner l'offre"}
              </Button>
              <Button
                onClick={() => {
                  setAction('accept');
                  setError(null);
                  setSuccess(null);
                }}
                className="text-xs bg-emerald-600 hover:bg-emerald-650 text-white cursor-pointer font-semibold"
              >
                <Check className="h-3.5 w-3.5 mr-1" />
                {"Accepter l'offre"}
              </Button>
            </div>
          </div>

          {/* Form submission card */}
          {action && (
            <div className="p-6 bg-slate-50/30 border-t border-slate-100 space-y-4 animate-slide-down">
              <h4 className="font-bold text-slate-900 text-sm">
                {action === 'accept' ? "Valider et accepter la proposition" : "Raison du refus de la proposition"}
              </h4>

              <form onSubmit={handleDecisionSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Client Name */}
                  <div className="grid gap-1.5">
                    <Label htmlFor="client-name" className="text-xs font-semibold text-slate-700">
                      {"Votre Nom complet *"}
                    </Label>
                    <Input
                      id="client-name"
                      required
                      placeholder="Ex: Dimitri Dupont"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      className="bg-white border-slate-200 text-sm h-9"
                    />
                  </div>

                  {/* Client Role */}
                  <div className="grid gap-1.5">
                    <Label htmlFor="client-role" className="text-xs font-semibold text-slate-700 flex justify-between">
                      <span>{"Votre Fonction"}</span>
                      <span className="text-slate-400 font-normal text-[10px]">{"(Optionnel)"}</span>
                    </Label>
                    <Input
                      id="client-role"
                      placeholder="Ex: Responsable Achats, Gérant"
                      value={clientRole}
                      onChange={(e) => setClientRole(e.target.value)}
                      className="bg-white border-slate-200 text-sm h-9"
                    />
                  </div>
                </div>

                {/* Comment / Motif */}
                <div className="grid gap-1.5">
                  <Label htmlFor="client-comment" className="text-xs font-semibold text-slate-700 flex justify-between">
                    <span>
                      {action === 'accept' ? "Commentaire facultatif" : "Motif de refus *"}
                    </span>
                    {action === 'accept' && (
                      <span className="text-slate-400 font-normal text-[10px]">{"(Optionnel)"}</span>
                    )}
                  </Label>
                  <textarea
                    id="client-comment"
                    required={action === 'reject'}
                    placeholder={
                      action === 'accept'
                        ? "Ajoutez une consigne, une précision ou une remarque..."
                        : "Indiquez les raisons du refus (prix trop élevé, quantités incorrectes, etc.)..."
                    }
                    rows={3}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="flex w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>

                {/* Consent checked for Acceptance */}
                {action === 'accept' && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        id="consent-check"
                        checked={consentChecked}
                        onChange={(e) => setConsentChecked(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded-sm border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <label htmlFor="consent-check" className="text-xs text-slate-600 leading-normal select-none cursor-pointer">
                        <strong>{"Je confirme mon intention commerciale."}</strong>{" J'accepte les conditions générales de vente ainsi que les tarifs détaillés dans cette offre."}
                      </label>
                    </div>

                    <div className="p-3 bg-amber-50 border border-amber-200 text-amber-850 rounded-lg text-xs leading-normal flex gap-2">
                      <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        <strong>{"Mention légale :"}</strong>{" Cette action confirme votre intention commerciale et ne constitue pas une signature électronique qualifiée au sens européen."}
                      </span>
                    </div>
                  </div>
                )}

                {/* Submit controls */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setAction(null)}
                    disabled={isPending}
                    className="text-xs cursor-pointer text-slate-500 hover:text-slate-700"
                  >
                    {"Annuler"}
                  </Button>
                  <Button
                    type="submit"
                    disabled={isPending}
                    className={`text-xs text-white font-semibold cursor-pointer ${
                      action === 'accept' ? 'bg-emerald-600 hover:bg-emerald-650' : 'bg-rose-600 hover:bg-rose-650'
                    }`}
                  >
                    {isPending ? "Traitement..." : action === 'accept' ? "Confirmer l'acceptation" : "Soumettre le refus"}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </Card>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium flex items-center gap-2">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-250 text-emerald-800 text-sm font-medium flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* 3. QUOTE DOCUMENT BLOCK */}
      <Card className="border border-slate-200 shadow-sm rounded-2xl overflow-hidden bg-white">
        
        {/* Quote branding block header */}
        <div className="p-6 md:p-8 border-b border-slate-150 flex flex-col md:flex-row justify-between gap-6">
          <div className="space-y-4">
            {/* Organisation branding */}
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-1.5">
                <span className="h-6 w-6 rounded bg-brand-900 text-white flex items-center justify-center text-xs font-bold shrink-0">
                  M
                </span>
                <span>{organization.name}</span>
              </h2>
              {organization.address && (
                <p className="text-xs text-slate-400 mt-1 whitespace-pre-line max-w-xs">
                  {typeof organization.address === 'string' 
                    ? organization.address 
                    : `${organization.address.street || ''}\n${organization.address.postal_code || ''} ${organization.address.city || ''}`}
                </p>
              )}
            </div>

            {/* Client billing block */}
            <div className="pt-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{"Destinataire :"}</p>
              <h4 className="font-bold text-slate-800 text-sm">{quote.customers?.legal_name || 'Client'}</h4>
              {quote.contact_name && (
                <p className="text-xs text-slate-600 mt-0.5">
                  {"À l'attention de : "}
                  <span className="font-semibold">{quote.contact_name}</span>
                </p>
              )}
              {quote.contact_email && (
                <p className="text-xs text-slate-400">{quote.contact_email}</p>
              )}
            </div>
          </div>

          <div className="flex flex-col md:items-end justify-between gap-4">
            {/* Quote details right block */}
            <div className="md:text-right space-y-1">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                {`Révision ${quote.revision}`}
              </span>
              <h1 className="text-lg font-black text-slate-900 tracking-tight">{`Offre commerciale ${quote.quote_number}`}</h1>
              <p className="text-xs text-slate-500">
                {`Émise le : `}
                <span className="font-semibold text-slate-700">{formatDate(quote.issue_date)}</span>
              </p>
              {quote.expires_at && (
                <p className="text-xs text-slate-500">
                  {`Valable jusqu'au : `}
                  <span className="font-bold text-slate-750">{formatDate(quote.expires_at)}</span>
                </p>
              )}
            </div>

            {/* Export buttons */}
            <div className="flex flex-col sm:flex-row gap-2 self-start md:self-auto w-full md:w-auto">
              <a 
                href={`/api/quotes/${quote.id}/pdf?token=${token}`}
                download={`BlueMargin_${quote.quote_number}_Rev${quote.revision}.pdf`}
                className="w-full sm:w-auto"
              >
                <Button
                  variant="outline"
                  className="text-xs border-slate-250 hover:bg-slate-50 font-semibold cursor-pointer w-full"
                >
                  <FileDown className="h-4 w-4 mr-1.5 text-slate-500" />
                  {"Télécharger en PDF"}
                </Button>
              </a>

              <a 
                href={`/api/quotes/${quote.id}/xlsx?token=${token}&type=client`}
                download={`BlueMargin_${quote.quote_number}_Rev${quote.revision}.xlsx`}
                className="w-full sm:w-auto"
              >
                <Button
                  variant="outline"
                  className="text-xs border-slate-250 hover:bg-slate-50 font-semibold cursor-pointer w-full"
                >
                  <FileDown className="h-4 w-4 mr-1.5 text-slate-500" />
                  {"Télécharger en XLSX"}
                </Button>
              </a>
            </div>
          </div>
        </div>

        {/* Content detail - title */}
        <div className="px-6 md:px-8 py-4 bg-slate-50/30 border-b border-slate-100">
          <p className="text-xs font-bold text-slate-450 uppercase tracking-wider">{"Objet de la proposition"}</p>
          <p className="text-sm font-semibold text-slate-800 mt-0.5">{quote.title}</p>
        </div>

        {/* Items Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-150 bg-slate-50/50 text-[10px] font-bold text-slate-450 uppercase tracking-wider">
                <th className="py-3 px-6 w-12 text-center">{"Pos"}</th>
                <th className="py-3 px-4">{"Désignation du produit"}</th>
                <th className="py-3 px-4 text-center w-24">{"Unité"}</th>
                {quote.has_complete_quantities && (
                  <th className="py-3 px-4 text-right w-24">{"Quantité"}</th>
                )}
                <th className="py-3 px-4 text-right w-36">{"Prix Unitaire HT"}</th>
                <th className="py-3 px-4 text-center w-24">{"Remise"}</th>
                <th className="py-3 px-6 text-right w-36">{"Total HT"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/40 transition-colors">
                  <td className="py-3 px-6 text-center text-xs font-medium text-slate-400">
                    {item.position}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-800">
                      {item.product_snapshot?.name || 'Produit'}
                    </div>
                    {item.description && (
                      <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center text-xs font-medium text-slate-650">
                    {item.sales_unit || 'kg'}
                  </td>
                  {quote.has_complete_quantities && (
                    <td className="py-3 px-4 text-right font-medium text-slate-800">
                      {item.quantity}
                    </td>
                  )}
                  <td className="py-3 px-4 text-right font-medium text-slate-800">
                    {formatCurrency(item.unit_price)}
                  </td>
                  <td className="py-3 px-4 text-center text-xs font-semibold text-slate-500">
                    {item.discount_rate > 0 ? `${(item.discount_rate * 100).toFixed(0)}%` : '0%'}
                  </td>
                  <td className="py-3 px-6 text-right font-bold text-slate-900">
                    {formatCurrency(item.line_subtotal || (item.net_unit_price * (item.quantity || 1)))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Section */}
        {quote.has_complete_quantities && quote.subtotal && (
          <div className="p-6 md:p-8 bg-slate-50/50 border-t border-slate-150 flex justify-end">
            <div className="w-full max-w-sm space-y-2 text-sm text-slate-650">
              <div className="flex justify-between">
                <span>{"Sous-total HT :"}</span>
                <span className="font-semibold text-slate-800">{formatCurrency(quote.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="flex items-center gap-1">
                  {"TVA Informative :"}
                  <span className="text-[10px] px-1.5 py-0.2 bg-slate-200 rounded font-semibold text-slate-550 border border-slate-250">
                    {"6%"}
                  </span>
                </span>
                <span className="font-semibold text-slate-800">{formatCurrency(quote.tax_total)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 text-base font-black text-slate-900">
                <span>{"Total TTC :"}</span>
                <span className="text-primary">{formatCurrency(quote.grand_total)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Public note */}
        {quote.public_note && (
          <div className="p-6 md:p-8 border-t border-slate-150 space-y-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">{"Instructions particulières / Notes"}</h4>
            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
              {quote.public_note}
            </p>
          </div>
        )}

        {/* Payment Terms */}
        {quote.terms && (
          <div className="p-6 md:p-8 border-t border-slate-100 bg-slate-50/20 space-y-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">{"Conditions de règlement"}</h4>
            <p className="text-xs text-slate-500 leading-normal">
              {quote.terms}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
