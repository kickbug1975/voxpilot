'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createCustomer } from '@/actions/customers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  ArrowLeft, 
  Building, 
  MapPin, 
  User, 
  FileText, 
  Check, 
  AlertTriangle 
} from 'lucide-react';
import Link from 'next/link';

interface Member {
  id: string;
  fullName: string;
}

interface NewCustomerClientProps {
  orgSlug: string;
  members: Member[];
  currentUserId: string;
}

export default function NewCustomerClient({ orgSlug, members, currentUserId }: NewCustomerClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'address' | 'contact' | 'additional'>('general');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
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
          router.push(`/${orgSlug}/customers/${result.data.id}`);
          router.refresh();
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Une erreur est survenue lors de la création.';
        setError(errMsg);
        // Switch to the general tab to show the error if it was a missing name, etc.
        setActiveTab('general');
      }
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Back navigation */}
      <div className="flex items-center gap-2">
        <Link href={`/${orgSlug}/customers`} className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Retour aux clients
        </Link>
      </div>

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Créer un nouveau prospect ou client</h2>
        <p className="text-sm text-slate-500">
          Enregistrez une nouvelle entreprise dans votre portefeuille CRM, avec son premier établissement et contact associés.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Form Card */}
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50/50">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`flex items-center gap-2 px-6 py-3.5 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'general'
                ? 'border-primary text-primary bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <Building className="h-4 w-4" />
            Informations Générales *
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('address')}
            className={`flex items-center gap-2 px-6 py-3.5 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'address'
                ? 'border-primary text-primary bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <MapPin className="h-4 w-4" />
            Établissement (Adresse)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('contact')}
            className={`flex items-center gap-2 px-6 py-3.5 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'contact'
                ? 'border-primary text-primary bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <User className="h-4 w-4" />
            Contact Principal
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('additional')}
            className={`flex items-center gap-2 px-6 py-3.5 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'additional'
                ? 'border-primary text-primary bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <FileText className="h-4 w-4" />
            Facturation & Notes
          </button>
        </div>

        {/* Tab Content Panels */}
        <div className="p-6">
          {/* Panel: General */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="name" className="text-xs font-semibold text-slate-700">Nom légal de l'entreprise</Label>
                  <Input id="name" name="name" placeholder="ex: SAS Pêcheries Belges" className="border-slate-200" />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="tradeName" className="text-xs font-semibold text-slate-700">Nom commercial / Enseigne</Label>
                  <Input id="tradeName" name="tradeName" placeholder="ex: Poissonnerie du Nord" className="border-slate-200" />
                </div>
              </div>
              <p className="text-[11px] text-slate-400 italic mt-1">* Veuillez renseigner au moins le nom légal ou le nom commercial / l'enseigne.</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="code" className="text-xs font-semibold text-slate-700">Code Client (unique)</Label>
                  <Input id="code" name="code" placeholder="ex: CLI-BELGE" className="border-slate-200" />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="vatNumber" className="text-xs font-semibold text-slate-700">Numéro de TVA</Label>
                  <Input id="vatNumber" name="vatNumber" placeholder="ex: BE 0123.456.789" className="border-slate-200" />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="segment" className="text-xs font-semibold text-slate-700">Segment *</Label>
                  <select 
                    id="segment" 
                    name="segment" 
                    defaultValue="retail" 
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="retail">Détail (Poissonnerie, Marché)</option>
                    <option value="grossiste">Grossiste / Demi-gros</option>
                    <option value="horeca">Horeca (Hôtel, Resto, Café)</option>
                    <option value="collectivite">Collectivité (Cantine, Hôpital)</option>
                    <option value="autre">Autre</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="lifecycleStatus" className="text-xs font-semibold text-slate-700">Statut CRM *</Label>
                  <select 
                    id="lifecycleStatus" 
                    name="lifecycleStatus" 
                    defaultValue="prospect" 
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="prospect">Prospect (Besoin non confirmé)</option>
                    <option value="qualified">Prospect Qualifié</option>
                    <option value="customer">Client Actif</option>
                    <option value="dormant">Client Dormant</option>
                    <option value="lost">Opportunité Perdue</option>
                    <option value="blocked">Compte Bloqué</option>
                  </select>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="potentialLevel" className="text-xs font-semibold text-slate-700">Potentiel Commercial *</Label>
                  <select 
                    id="potentialLevel" 
                    name="potentialLevel" 
                    defaultValue="unknown" 
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="unknown">Non qualifié</option>
                    <option value="low">Faible</option>
                    <option value="medium">Moyen</option>
                    <option value="high">Élevé</option>
                    <option value="strategic">Stratégique</option>
                  </select>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="ownerUserId" className="text-xs font-semibold text-slate-700">Responsable Commercial *</Label>
                  <select 
                    id="ownerUserId" 
                    name="ownerUserId" 
                    defaultValue={currentUserId}
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {members.map(m => (
                      <option key={m.id} value={m.id}>{m.fullName}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="leadSource" className="text-xs font-semibold text-slate-700">Source du Prospect</Label>
                  <select 
                    id="leadSource" 
                    name="leadSource" 
                    defaultValue="" 
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">-- Sélectionner --</option>
                    <option value="website">Site internet / Formulaire</option>
                    <option value="referral">Recommandation</option>
                    <option value="cold_call">Prospection téléphonique / Terrain</option>
                    <option value="event">Événement / Salon</option>
                    <option value="inbound">Entrant direct</option>
                    <option value="other">Autre</option>
                  </select>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="leadSourceDetail" className="text-xs font-semibold text-slate-700">Détail de la source</Label>
                  <Input id="leadSourceDetail" name="leadSourceDetail" placeholder="ex: Recommandé par Client X, Salon Seafood 2026" className="border-slate-200" />
                </div>
              </div>
            </div>
          )}

          {/* Panel: Address */}
          {activeTab === 'address' && (
            <div className="space-y-6">
              <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4 text-xs text-blue-700 flex gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-blue-500" />
                <div>
                  <strong>Note technique :</strong> Si vous remplissez ces champs, le système créera automatiquement un établissement principal typé « Siège social / Principal » pour ce client.
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="line1" className="text-xs font-semibold text-slate-700">Adresse (Rue, numéro)</Label>
                  <Input id="line1" name="line1" placeholder="ex: 15 Rue de l'Entrepôt" className="border-slate-200" />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="line2" className="text-xs font-semibold text-slate-700">Complément d'adresse</Label>
                  <Input id="line2" name="line2" placeholder="ex: Boîte 4 / Hangar B" className="border-slate-200" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="postalCode" className="text-xs font-semibold text-slate-700">Code postal</Label>
                  <Input id="postalCode" name="postalCode" placeholder="ex: 1000" className="border-slate-200" />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="city" className="text-xs font-semibold text-slate-700">Ville</Label>
                  <Input id="city" name="city" placeholder="ex: Bruxelles" className="border-slate-200" />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="region" className="text-xs font-semibold text-slate-700">Région / Province</Label>
                  <Input id="region" name="region" placeholder="ex: Bruxelles-Capitale" className="border-slate-200" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="countryCode" className="text-xs font-semibold text-slate-700">Pays</Label>
                  <select 
                    id="countryCode" 
                    name="countryCode" 
                    defaultValue="BE" 
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="BE">Belgique</option>
                    <option value="FR">France</option>
                    <option value="NL">Pays-Bas</option>
                    <option value="DE">Allemagne</option>
                    <option value="LU">Luxembourg</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Panel: Contact */}
          {activeTab === 'contact' && (
            <div className="space-y-6">
              <div className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-4 text-xs text-emerald-700 flex gap-2">
                <User className="h-4 w-4 shrink-0 text-emerald-500" />
                <div>
                  <strong>Note technique :</strong> Si vous remplissez ces champs, le système créera automatiquement un contact principal lié à ce client (et à l'établissement ci-dessus s'il est créé).
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="contactFirstName" className="text-xs font-semibold text-slate-700">Prénom</Label>
                  <Input id="contactFirstName" name="contactFirstName" placeholder="Jean" className="border-slate-200" />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="contactLastName" className="text-xs font-semibold text-slate-700">Nom de famille</Label>
                  <Input id="contactLastName" name="contactLastName" placeholder="Dupont" className="border-slate-200" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="contactJobTitle" className="text-xs font-semibold text-slate-700">Fonction / Titre</Label>
                  <Input id="contactJobTitle" name="contactJobTitle" placeholder="ex: Acheteur Marée, Gérant" className="border-slate-200" />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="contactEmail" className="text-xs font-semibold text-slate-700">E-mail direct</Label>
                  <Input id="contactEmail" name="contactEmail" type="email" placeholder="jean.dupont@client.com" className="border-slate-200" />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="contactPhone" className="text-xs font-semibold text-slate-700">Téléphone Fixe</Label>
                  <Input id="contactPhone" name="contactPhone" placeholder="ex: +32 2 555 1234" className="border-slate-200" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="contactMobile" className="text-xs font-semibold text-slate-700">Téléphone Mobile</Label>
                  <Input id="contactMobile" name="contactMobile" placeholder="ex: +32 470 12 34 56" className="border-slate-200" />
                </div>
              </div>
            </div>
          )}

          {/* Panel: Additional */}
          {activeTab === 'additional' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="email" className="text-xs font-semibold text-slate-700">E-mail Général Entreprise</Label>
                  <Input id="email" name="email" type="email" placeholder="info@entreprise.com" className="border-slate-200" />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="phone" className="text-xs font-semibold text-slate-700">Téléphone Général Entreprise</Label>
                  <Input id="phone" name="phone" placeholder="ex: +32 2 123 45 67" className="border-slate-200" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="paymentTerms" className="text-xs font-semibold text-slate-700">Conditions de paiement</Label>
                  <Input id="paymentTerms" name="paymentTerms" placeholder="ex: 30 jours fin de mois, paiement comptant" className="border-slate-200" />
                </div>
              </div>

              <div className="grid gap-1">
                <Label htmlFor="notes" className="text-xs font-semibold text-slate-700">Notes publiques (apparaissent sur certains documents)</Label>
                <textarea 
                  id="notes" 
                  name="notes" 
                  placeholder="Notes visibles..." 
                  rows={3} 
                  className="flex min-h-[80px] w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none" 
                />
              </div>

              <div className="grid gap-1">
                <Label htmlFor="internalNotes" className="text-xs font-semibold text-slate-700">Notes internes (réservées aux collaborateurs de BlueMargin)</Label>
                <textarea 
                  id="internalNotes" 
                  name="internalNotes" 
                  placeholder="Notes confidentielles..." 
                  rows={3} 
                  className="flex min-h-[80px] w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none" 
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-200">
          <div className="text-xs text-slate-500">
            * Champs requis pour l'enregistrement du prospect.
          </div>
          <div className="flex gap-3">
            <Link href={`/${orgSlug}/customers`}>
              <Button type="button" variant="outline" className="border-slate-200 cursor-pointer">
                Annuler
              </Button>
            </Link>
            <Button type="submit" disabled={isPending} className="bg-primary hover:bg-primary/90 text-white font-semibold cursor-pointer">
              {isPending ? (
                'Création en cours...'
              ) : (
                <>
                  <Check className="h-4 w-4 mr-1.5" />
                  Créer le Prospect
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
