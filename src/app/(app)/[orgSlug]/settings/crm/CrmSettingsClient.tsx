'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Sparkles, ArrowLeft, AlertTriangle, CheckCircle2, 
  ShieldAlert, Settings, Clock, HelpCircle, Eye, EyeOff 
} from 'lucide-react';
import { updateCrmSettings, CrmSettingsInput } from '@/actions/settings';

interface CrmSettingsClientProps {
  orgSlug: string;
  org: any; // organization row
}

export default function CrmSettingsClient({ orgSlug, org }: CrmSettingsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  // Form states
  const [visibilityMode, setVisibilityMode] = useState<'all_customers' | 'assigned_customers'>(
    org.crm_visibility_mode || 'all_customers'
  );
  const [followUpDelay, setFollowUpDelay] = useState<number>(org.default_quote_follow_up_delay_days ?? 3);
  const [inactivityDelay, setInactivityDelay] = useState<number>(org.inactive_customer_delay_days ?? 30);
  const [requireNextAction, setRequireNextAction] = useState<boolean>(org.require_next_action_after_activity ?? false);
  const [allowSalesReassignment, setAllowSalesReassignment] = useState<boolean>(org.allow_sales_reassignment ?? false);
  const [outcomesEnabled, setOutcomesEnabled] = useState<boolean>(org.crm_activity_outcomes_enabled ?? true);
  const [autoFollowUp, setAutoFollowUp] = useState<boolean>(org.auto_create_quote_follow_up_task ?? true);
  const [requireLostReason, setRequireLostReason] = useState<boolean>(org.require_lost_reason ?? true);

  // Show warning state if visibility mode is changed to 'assigned_customers'
  const [showVisibilityWarning, setShowVisibilityWarning] = useState<boolean>(false);

  const handleVisibilityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as 'all_customers' | 'assigned_customers';
    setVisibilityMode(value);
    if (value === 'assigned_customers' && org.crm_visibility_mode !== 'assigned_customers') {
      setShowVisibilityWarning(true);
    } else {
      setShowVisibilityWarning(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const input: CrmSettingsInput = {
      crm_visibility_mode: visibilityMode,
      default_quote_follow_up_delay_days: Number(followUpDelay),
      inactive_customer_delay_days: Number(inactivityDelay),
      require_next_action_after_activity: requireNextAction,
      allow_sales_reassignment: allowSalesReassignment,
      crm_activity_outcomes_enabled: outcomesEnabled,
      auto_create_quote_follow_up_task: autoFollowUp,
      require_lost_reason: requireLostReason
    };

    startTransition(async () => {
      const res = await updateCrmSettings(orgSlug, input);
      if (res.error) {
        setError(res.error);
      } else {
        setSuccess(true);
        setShowVisibilityWarning(false);
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link 
              href={`/${orgSlug}/settings`} 
              className="text-slate-500 hover:text-slate-700 transition-colors inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200 bg-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
              Paramètres CRM Lite
            </h2>
          </div>
          <p className="text-sm text-slate-500 ml-10">
            Configurez les automatisations de relance client et la visibilité commerciale.
          </p>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold flex items-start gap-2.5">
          <ShieldAlert className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p>Erreur lors de la mise à jour</p>
            <p className="text-xs text-rose-500 font-normal">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-250 text-emerald-800 text-sm font-semibold flex items-center gap-2.5">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>Paramètres CRM mis à jour avec succès.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Card 1: Visibility & Portfolios */}
        <Card className="p-6 border-slate-200 shadow-xs bg-white rounded-2xl space-y-6">
          <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-1.5">
            <Settings className="h-4.5 w-4.5 text-primary" />
            <span>Mode de visibilité et attribution</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 space-y-1.5">
              <Label htmlFor="crmVisibilityMode" className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Visibilité commerciale
              </Label>
              <select
                id="crmVisibilityMode"
                value={visibilityMode}
                onChange={handleVisibilityChange}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none h-10 focus:border-primary shadow-3xs"
              >
                <option value="all_customers">Tout le portefeuille (Tous les clients)</option>
                <option value="assigned_customers">Portefeuilles affectés uniquement</option>
              </select>
            </div>

            <div className="md:col-span-2 text-xs text-slate-500 flex flex-col justify-center space-y-2 leading-relaxed">
              <div className="flex gap-2 items-start bg-slate-50 p-3 rounded-lg border border-slate-100">
                <HelpCircle className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                <p>
                  <strong>Portefeuilles affectés :</strong> Les commerciaux ne verront que les clients/prospects dont ils sont responsables commerciaux, ou ceux pour lesquels ils possèdent une offre active.
                </p>
              </div>
            </div>
          </div>

          {showVisibilityWarning && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium space-y-2">
              <div className="flex items-center gap-2 text-amber-700 font-bold">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <span>Attention : restriction de portefeuille active</span>
              </div>
              <p className="leading-relaxed">
                En basculant la visibilité sur <strong>Portefeuilles affectés uniquement</strong>, vos commerciaux perdront instantanément l'accès aux fiches clients et opportunités qui ne leur sont pas affectées. Assurez-vous d'avoir affecté des commerciaux responsables à toutes vos fiches clients.
              </p>
            </div>
          )}
        </Card>

        {/* Card 2: Delays & Reminders */}
        <Card className="p-6 border-slate-200 shadow-xs bg-white rounded-2xl space-y-6">
          <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-1.5">
            <Clock className="h-4.5 w-4.5 text-primary" />
            <span>Délais d'activité et relance</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <Label htmlFor="followUpDelay" className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Délai de relance des offres par défaut (Jours)
              </Label>
              <Input
                id="followUpDelay"
                type="number"
                min="0"
                max="365"
                value={followUpDelay}
                onChange={(e) => setFollowUpDelay(Math.max(0, parseInt(e.target.value) || 0))}
                className="border-slate-200 h-10 shadow-3xs text-sm"
              />
              <p className="text-[11px] text-slate-400">
                Nombre de jours après l'envoi d'une offre pour créer une tâche automatique de suivi (ex: 3 jours).
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inactivityDelay" className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Délai de détection d'inactivité client (Jours)
              </Label>
              <Input
                id="inactivityDelay"
                type="number"
                min="1"
                max="365"
                value={inactivityDelay}
                onChange={(e) => setInactivityDelay(Math.max(1, parseInt(e.target.value) || 30))}
                className="border-slate-200 h-10 shadow-3xs text-sm"
              />
              <p className="text-[11px] text-slate-400">
                Nombre de jours sans interaction après lequel un client est considéré comme dormant / inactif (ex: 30 jours).
              </p>
            </div>
          </div>
        </Card>

        {/* Card 3: CRM Logic & Requirements */}
        <Card className="p-6 border-slate-200 shadow-xs bg-white rounded-2xl space-y-6">
          <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-1.5">
            <Sparkles className="h-4.5 w-4.5 text-primary" />
            <span>Processus & Règles de gouvernance CRM</span>
          </h3>

          <div className="space-y-4">
            {/* Auto-create quote followup */}
            <div className="flex items-start gap-3">
              <input
                id="autoFollowUp"
                type="checkbox"
                checked={autoFollowUp}
                onChange={(e) => setAutoFollowUp(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary mt-1 cursor-pointer"
              />
              <div className="space-y-0.5">
                <Label htmlFor="autoFollowUp" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Tâches automatiques de relance à l'envoi
                </Label>
                <p className="text-[11px] text-slate-400">
                  Créer automatiquement une tâche de suivi lorsqu'un devis est envoyé au client (`statut Envoyé`).
                </p>
              </div>
            </div>

            {/* Require next action after activity */}
            <div className="flex items-start gap-3 pt-3 border-t border-slate-100">
              <input
                id="requireNextAction"
                type="checkbox"
                checked={requireNextAction}
                onChange={(e) => setRequireNextAction(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary mt-1 cursor-pointer"
              />
              <div className="space-y-0.5">
                <Label htmlFor="requireNextAction" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Forcer la planification de l'action suivante
                </Label>
                <p className="text-[11px] text-slate-400">
                  Exiger la création d'une tâche de relance après chaque interaction commerciale enregistrée dans la fiche client.
                </p>
              </div>
            </div>

            {/* Require lost reason */}
            <div className="flex items-start gap-3 pt-3 border-t border-slate-100">
              <input
                id="requireLostReason"
                type="checkbox"
                checked={requireLostReason}
                onChange={(e) => setRequireLostReason(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary mt-1 cursor-pointer"
              />
              <div className="space-y-0.5">
                <Label htmlFor="requireLostReason" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Motif de perte obligatoire pour les clients perdus
                </Label>
                <p className="text-[11px] text-slate-400">
                  Exiger la saisie d'un motif explicite lorsque le statut CRM d'un client passe à Perdu.
                </p>
              </div>
            </div>

            {/* Allow sales reassignment */}
            <div className="flex items-start gap-3 pt-3 border-t border-slate-100">
              <input
                id="allowSalesReassignment"
                type="checkbox"
                checked={allowSalesReassignment}
                onChange={(e) => setAllowSalesReassignment(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary mt-1 cursor-pointer"
              />
              <div className="space-y-0.5">
                <Label htmlFor="allowSalesReassignment" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Permettre aux commerciaux de réattribuer la fiche
                </Label>
                <p className="text-[11px] text-slate-400">
                  Autoriser les rôles commerciaux à réattribuer un client à un autre collègue (sinon, réservé aux managers/admins).
                </p>
              </div>
            </div>

            {/* Outcomes enabled */}
            <div className="flex items-start gap-3 pt-3 border-t border-slate-100">
              <input
                id="outcomesEnabled"
                type="checkbox"
                checked={outcomesEnabled}
                onChange={(e) => setOutcomesEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary mt-1 cursor-pointer"
              />
              <div className="space-y-0.5">
                <Label htmlFor="outcomesEnabled" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Activer le choix des résultats d'interactions
                </Label>
                <p className="text-[11px] text-slate-400">
                  Afficher le sélecteur de résultat (Échange fructueux, pas de réponse, répondeur, etc.) lors de la journalisation d'activités.
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3">
          <Link 
            href={`/${orgSlug}/settings`}
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-3xs cursor-pointer"
          >
            Annuler
          </Link>
          <Button
            type="submit"
            disabled={isPending}
            className="bg-primary hover:bg-primary/95 text-white font-bold text-xs px-4 py-2 cursor-pointer shadow-xs shrink-0"
          >
            {isPending ? 'Enregistrement...' : 'Enregistrer les paramètres'}
          </Button>
        </div>
      </form>
    </div>
  );
}
