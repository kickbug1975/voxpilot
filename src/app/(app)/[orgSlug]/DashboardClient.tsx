'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Percent, AlertTriangle, ShieldAlert, CheckCircle2, 
  Clock, ArrowRight, FileText, Check, X,
  TrendingUp, TrendingDown, RefreshCw, Info, UserCheck, Plus
} from 'lucide-react';
import { markAlertStatus } from '@/actions/dashboard';

interface DashboardStats {
  averageMargin: number;
  atRiskCount: number;
  potentialProtectedUnitMargin: number;
  potentialProtectedQuoteMargin: number;
  activeQuotesCount: number;
}

interface Alert {
  id: string;
  type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: string;
  title: string;
  message: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
}

interface CostVariation {
  id: string;
  productName: string;
  supplierName: string;
  sku: string;
  landedCost: number;
  purchasePrice: number;
  createdAt: string;
}

interface Quote {
  id: string;
  quote_number: string;
  revision: number;
  title: string;
  status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired' | 'cancelled';
  grand_total: number | null;
  updated_at: string;
  customers: { legal_name: string } | null;
}

interface ChecklistState {
  orgCreated: boolean;
  demoLoaded: boolean;
  importCompleted: boolean;
  quoteCreated: boolean;
  quoteShared: boolean;
}

interface DashboardClientProps {
  orgSlug: string;
  orgName: string;
  stats: DashboardStats;
  initialAlerts: Alert[];
  variations: CostVariation[];
  quotes: Quote[];
  checklist: ChecklistState;
}

export default function DashboardClient({
  orgSlug,
  orgName,
  stats,
  initialAlerts,
  variations,
  quotes,
  checklist,
}: DashboardClientProps) {
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>(initialAlerts);
  const [isPending, startTransition] = useTransition();
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Format currency helper
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(val);
  };

  // Format percent helper
  const formatPercent = (val: number) => {
    return `${(val * 100).toFixed(1)}%`;
  };

  // Format date helper
  const formatDateRelative = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / (24 * 3600 * 1000));
    if (days === 0) return "Aujourd'hui";
    if (days === 1) return "Hier";
    return `Il y a ${days} jours`;
  };

  const handleResolveAlert = async (alertId: string) => {
    startTransition(async () => {
      try {
        const res = await markAlertStatus(orgSlug, alertId, 'resolved');
        if (res.error) throw new Error(res.error);
        
        setAlerts(prev => prev.filter(a => a.id !== alertId));
        router.refresh();
      } catch (err) {
        console.error("Error resolving alert:", err);
      }
    });
  };

  // Onboarding progress score
  const onboardingSteps = [
    { label: "Créer votre organisation", done: checklist.orgCreated, link: null },
    { label: "Charger les données de démo", done: checklist.demoLoaded, link: `#` },
    { label: "Importer un tarif fournisseur", done: checklist.importCompleted, link: `/${orgSlug}/imports` },
    { label: "Créer une première offre commerciale", done: checklist.quoteCreated, link: `/${orgSlug}/quotes` },
    { label: "Partager l'offre publique", done: checklist.quoteShared, link: `/${orgSlug}/quotes` },
  ];

  const stepsDone = onboardingSteps.filter(s => s.done).length;
  const progressPercent = Math.round((stepsDone / onboardingSteps.length) * 100);

  const getStatusBadgeColor = (status: Quote['status']) => {
    switch (status) {
      case 'draft': return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'sent': return 'bg-sky-50 text-sky-700 border-sky-200';
      case 'viewed': return 'bg-violet-50 text-violet-700 border-violet-200';
      case 'accepted': return 'bg-emerald-50 text-emerald-700 border-emerald-250';
      case 'rejected': return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'expired': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'cancelled': return 'bg-slate-100 text-slate-400 border-slate-200 line-through';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getStatusLabel = (status: Quote['status']) => {
    switch (status) {
      case 'draft': return 'Brouillon';
      case 'sent': return 'Envoyé';
      case 'viewed': return 'Consulté';
      case 'accepted': return 'Accepté';
      case 'rejected': return 'Refusé';
      case 'expired': return 'Expiré';
      case 'cancelled': return 'Annulé';
      default: return status;
    }
  };

  return (
    <div className="space-y-8">
      {/* Page header with quick stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Tableau de bord</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {`Suivi en temps réel de l'activité commerciale et de l'intégrité de vos marges pour `}
            <span className="font-bold text-slate-800">{orgName}</span>.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              startTransition(() => {
                router.refresh();
                setSuccessMsg("Indicateurs actualisés !");
                setTimeout(() => setSuccessMsg(null), 2000);
              });
            }}
            className="text-xs font-semibold border-slate-200 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isPending ? 'animate-spin' : ''}`} />
            {"Actualiser"}
          </Button>
          <Link href={`/${orgSlug}/quotes`}>
            <Button
              size="sm"
              className="text-xs bg-primary hover:bg-primary/95 text-white font-semibold cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {"Créer une offre"}
            </Button>
          </Link>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium rounded-lg flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* 1. FINANCIAL KPI GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI: Weighted average margin */}
        <Card className="p-5 border-slate-200 shadow-xs flex items-center justify-between bg-white">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <span>{"Marge catalogue"}</span>
              <span title="Moyenne simple des marges récurrentes du catalogue">
                <Info className="h-3 w-3" />
              </span>
            </p>
            <p className="text-3xl font-black text-slate-900">{formatPercent(stats.averageMargin)}</p>
            <p className="text-[10px] text-slate-400">{"Objectif global : 20.0%"}</p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-650 shrink-0">
            <Percent className="h-6 w-6" />
          </div>
        </Card>

        {/* KPI: Products under margin target (Risk count) */}
        <Card className="p-5 border-slate-200 shadow-xs flex items-center justify-between bg-white">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{"Produits sous seuil"}</p>
            <p className={`text-3xl font-black ${stats.atRiskCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
              {stats.atRiskCount}
            </p>
            <p className="text-[10px] text-slate-400">
              {stats.atRiskCount > 0 ? "Action corrective conseillée" : "Toutes les marges sont saines"}
            </p>
          </div>
          <div className={`h-12 w-12 rounded-xl border flex items-center justify-center shrink-0 ${
            stats.atRiskCount > 0 
              ? 'bg-rose-50 border-rose-100 text-rose-600' 
              : 'bg-slate-50 border-slate-100 text-slate-400'
          }`}>
            <AlertTriangle className="h-6 w-6" />
          </div>
        </Card>

        {/* KPI: Potential protected margin unit gain */}
        <Card className="p-5 border-slate-200 shadow-xs flex items-center justify-between bg-white">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <span>{"Marge protégée"}</span>
              <span title="Marge à récupérer si vous appliquez les prix recommandés sur les offres actives">
                <Info className="h-3 w-3" />
              </span>
            </p>
            <p className="text-3xl font-black text-emerald-650">
              {formatCurrency(stats.potentialProtectedQuoteMargin)}
            </p>
            <p className="text-[10px] text-slate-400">
              {`Potentiel unitaire cat. : +${stats.potentialProtectedUnitMargin.toFixed(2)} €`}
            </p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <TrendingUp className="h-6 w-6" />
          </div>
        </Card>

        {/* KPI: Active open quotes count */}
        <Card className="p-5 border-slate-200 shadow-xs flex items-center justify-between bg-white">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{"Offres actives"}</p>
            <p className="text-3xl font-black text-slate-900">{stats.activeQuotesCount}</p>
            <p className="text-[10px] text-slate-400">{"Statut Envoyé ou Consulté"}</p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-650 shrink-0">
            <FileText className="h-6 w-6" />
          </div>
        </Card>
      </div>

      {/* 2. ONBOARDING & GUIDANCE CHECKLIST */}
      {progressPercent < 100 && (
        <Card className="border border-brand-700/20 bg-gradient-to-br from-brand-900 to-brand-800 text-white rounded-2xl p-6 shadow-md">
          <div className="flex flex-col md:flex-row justify-between gap-6">
            <div className="space-y-4 max-w-xl">
              <div className="space-y-1.5">
                <h3 className="text-lg font-bold">{"Bienvenue sur VoxPilot ! Complétez votre onboarding"}</h3>
                <p className="text-xs text-slate-355 leading-relaxed">
                  {"Suivez ces étapes clés pour configurer votre catalogue, simuler vos marges, et éditer votre premier devis client."}
                </p>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-bold text-slate-300">
                  <span>{"Progression"}</span>
                  <span>{`${progressPercent}%`}</span>
                </div>
                <div className="h-2 w-full bg-brand-700/50 rounded-full overflow-hidden">
                  <div className="h-full bg-accent-500 transition-all duration-500" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
            </div>

            {/* Checklist items list */}
            <div className="w-full md:max-w-md bg-brand-850 border border-brand-700/30 rounded-xl p-4 space-y-2.5">
              {onboardingSteps.map((step, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 border ${
                      step.done 
                        ? 'bg-accent-500 border-accent-500 text-brand-900' 
                        : 'border-slate-500 text-slate-400'
                    }`}>
                      {step.done ? <Check className="h-3 w-3 stroke-[3]" /> : idx + 1}
                    </span>
                    <span className={`font-medium ${step.done ? 'text-slate-450 line-through' : 'text-slate-200'}`}>
                      {step.label}
                    </span>
                  </div>
                  {!step.done && step.link && (
                    <Link 
                      href={step.link} 
                      className="text-[10px] font-bold text-accent-400 hover:text-accent-300 hover:underline flex items-center gap-0.5 cursor-pointer"
                    >
                      {"Démarrer"}
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* 3. MAIN WORKSPACE GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* LEFT & CENTER: CRITICAL ALERTS & COST HIKES */}
        <div className="xl:col-span-2 space-y-6">
          
          {/* CRITICAL ALERTS BOX */}
          <Card className="border-slate-200 shadow-xs bg-white rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <ShieldAlert className="h-4.5 w-4.5 text-slate-500" />
                <span>{"Alertes de marge & hausses critiques"}</span>
              </h3>
              <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-[10px] font-bold">
                {`${alerts.length} en attente`}
              </Badge>
            </div>

            <div className="p-6 divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
                  <p className="text-xs font-bold text-slate-800">{"Aucune alerte en attente"}</p>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto">
                    {"Toutes vos marges sont sous contrôle et aucun tarif n'a subi de hausse non gérée."}
                  </p>
                </div>
              ) : (
                alerts.map((alert) => (
                  <div key={alert.id} className="py-4 first:pt-0 last:pb-0 flex items-start gap-4">
                    <span className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border ${
                      alert.priority === 'critical' || alert.priority === 'high'
                        ? 'bg-rose-50 border-rose-100 text-rose-600'
                        : 'bg-amber-50 border-amber-100 text-amber-600'
                    }`}>
                      <AlertTriangle className="h-4.5 w-4.5" />
                    </span>
                    <div className="flex-1 space-y-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <h4 className="font-bold text-slate-900 text-xs truncate">{alert.title}</h4>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">
                          {formatDateRelative(alert.created_at)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 leading-normal">{alert.message}</p>
                      <div className="flex gap-2 pt-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleResolveAlert(alert.id)}
                          className="h-6 text-[10px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                        >
                          {"Marquer comme résolu"}
                        </Button>
                        {alert.entity_type === 'quotes' && (
                          <Link href={`/${orgSlug}/quotes/${alert.entity_id}`}>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[10px] font-bold text-primary cursor-pointer"
                            >
                              {"Voir l'offre"}
                            </Button>
                          </Link>
                        )}
                        {alert.entity_type === 'products' && (
                          <Link href={`/${orgSlug}/products/${alert.entity_id}`}>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[10px] font-bold text-primary cursor-pointer"
                            >
                              {"Fiche produit"}
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* RECENT COST VARIATIONS BOX */}
          <Card className="border-slate-200 shadow-xs bg-white rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <TrendingDown className="h-4.5 w-4.5 text-slate-500" />
                <span>{"Hausses de coûts fournisseur récentes"}</span>
              </h3>
            </div>

            <div className="overflow-x-auto">
              {variations.length === 0 ? (
                <div className="text-center py-10 space-y-1">
                  <Info className="h-8 w-8 text-slate-350 mx-auto" />
                  <p className="text-xs font-bold text-slate-700">{"Aucune variation de coût enregistrée"}</p>
                  <p className="text-xs text-slate-400">{"Importez des fichiers Excel de tarifs pour enregistrer les nouveaux coûts."}</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/30 font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 px-6">{"Produit"}</th>
                      <th className="py-2.5 px-4">{"Fournisseur"}</th>
                      <th className="py-2.5 px-4 text-center w-24">{"SKU Fourn."}</th>
                      <th className="py-2.5 px-6 text-right w-36">{"Coût rendu unitaire"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-650">
                    {variations.map((v) => (
                      <tr key={v.id} className="hover:bg-slate-50/30 transition-colors">
                        <td className="py-3 px-6 font-bold text-slate-900">{v.productName}</td>
                        <td className="py-3 px-4">{v.supplierName}</td>
                        <td className="py-3 px-4 text-center font-mono text-slate-450">{v.sku}</td>
                        <td className="py-3 px-6 text-right font-semibold text-slate-900">
                          {formatCurrency(v.landedCost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>

        {/* RIGHT SIDE: RECENT QUOTES LIST */}
        <div className="space-y-6">
          <Card className="border-slate-200 shadow-xs bg-white rounded-2xl overflow-hidden h-full flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <FileText className="h-4.5 w-4.5 text-slate-500" />
                <span>{"Offres & devis récents"}</span>
              </h3>
              <Link 
                href={`/${orgSlug}/quotes`} 
                className="text-xs font-bold text-primary hover:underline flex items-center gap-0.5 cursor-pointer"
              >
                {"Voir tout"}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="p-6 divide-y divide-slate-100 flex-1 overflow-y-auto">
              {quotes.length === 0 ? (
                <div className="text-center py-16 space-y-3">
                  <FileText className="h-10 w-10 text-slate-300 mx-auto" />
                  <p className="text-xs font-bold text-slate-700">{"Aucune offre enregistrée"}</p>
                  <Link href={`/${orgSlug}/quotes`}>
                    <Button
                      size="sm"
                      className="text-xs bg-slate-100 hover:bg-slate-150 border-slate-200 text-slate-700 cursor-pointer font-bold mt-2"
                    >
                      {"Créer un devis"}
                    </Button>
                  </Link>
                </div>
              ) : (
                quotes.map((q) => (
                  <div key={q.id} className="py-4 first:pt-0 last:pb-0 space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <Link 
                          href={`/${orgSlug}/quotes/${q.id}`} 
                          className="font-bold text-slate-800 hover:text-primary transition-colors text-xs truncate block hover:underline"
                        >
                          {q.quote_number}
                        </Link>
                        <p className="text-[10px] text-slate-400 truncate">{q.customers?.legal_name || 'Client'}</p>
                      </div>
                      <Badge className={`text-[9px] font-bold py-0.2 px-2 border shrink-0 ${getStatusBadgeColor(q.status)}`}>
                        {getStatusLabel(q.status)}
                      </Badge>
                    </div>

                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[10px] text-slate-500 font-medium truncate max-w-[150px]">{q.title}</span>
                      <span className="font-extrabold text-slate-900 shrink-0">
                        {q.grand_total ? formatCurrency(q.grand_total) : '-'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
