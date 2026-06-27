'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  AlertTriangle, Check, CheckCircle2, ChevronLeft, ChevronRight, 
  Eye, Info, RefreshCw, ShieldAlert, Trash2
} from 'lucide-react';
import { updateAlertStatus, bulkUpdateAlertStatus } from '@/actions/alerts';

interface Alert {
  id: string;
  type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'unread' | 'read' | 'resolved' | 'ignored';
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
}

interface AlertsPageClientProps {
  orgSlug: string;
  initialAlerts: Alert[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  filters: {
    priority: string;
    status: string;
    type: string;
  };
}

export default function AlertsPageClient({
  orgSlug,
  initialAlerts,
  totalCount,
  currentPage,
  totalPages,
  filters,
}: AlertsPageClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  
  // Selection state for bulk actions
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Local alert lists to avoid full reload delay
  const [alerts, setAlerts] = useState<Alert[]>(initialAlerts);

  // Sync state if initialAlerts changes
  React.useEffect(() => {
    setAlerts(initialAlerts);
    setSelectedIds([]);
  }, [initialAlerts]);

  // Relative date helper
  const formatDateRelative = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / (60 * 1000));
    const hours = Math.floor(diff / (3600 * 1000));
    const days = Math.floor(diff / (24 * 3600 * 1000));

    if (minutes < 1) return "À l'instant";
    if (minutes < 60) return `Il y a ${minutes} min`;
    if (hours < 24) return `Il y a ${hours} h`;
    if (days === 1) return "Hier";
    return `Il y a ${days} jours`;
  };

  // Build filter navigation URL
  const navigateWithFilters = (newFilters: { priority?: string; status?: string; type?: string; page?: number }) => {
    const p = newFilters.priority !== undefined ? newFilters.priority : filters.priority;
    const s = newFilters.status !== undefined ? newFilters.status : filters.status;
    const t = newFilters.type !== undefined ? newFilters.type : filters.type;
    const pg = newFilters.page !== undefined ? newFilters.page : 1;

    router.push(`/${orgSlug}/alerts?priority=${p}&status=${s}&type=${t}&page=${pg}`);
  };

  // Status handlers
  const handleUpdateStatus = async (alertId: string, nextStatus: 'read' | 'resolved') => {
    startTransition(async () => {
      const res = await updateAlertStatus(orgSlug, alertId, nextStatus);
      if (res.error) {
        alert(res.error);
      } else {
        // Optimistic update
        setAlerts(prev => 
          prev.map(a => a.id === alertId ? { ...a, status: nextStatus } : a)
        );
        router.refresh();
      }
    });
  };

  // Bulk actions handlers
  const handleBulkAction = async (nextStatus: 'read' | 'resolved') => {
    if (selectedIds.length === 0) return;
    
    startTransition(async () => {
      const res = await bulkUpdateAlertStatus(orgSlug, selectedIds, nextStatus);
      if (res.error) {
        alert(res.error);
      } else {
        // Optimistic update
        setAlerts(prev => 
          prev.map(a => selectedIds.includes(a.id) ? { ...a, status: nextStatus } : a)
        );
        setSelectedIds([]);
        router.refresh();
      }
    });
  };

  // Toggle selection
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      // only select alerts that don't match the target status already
      const selectable = alerts.map(a => a.id);
      setSelectedIds(selectable);
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

  const getPriorityColor = (priority: Alert['priority']) => {
    switch (priority) {
      case 'critical': return 'border-l-4 border-l-rose-600 bg-rose-50/10';
      case 'high': return 'border-l-4 border-l-amber-500 bg-amber-50/10';
      case 'medium': return 'border-l-4 border-l-yellow-450 bg-yellow-50/10';
      case 'low': return 'border-l-4 border-l-slate-300';
    }
  };

  const getPriorityBadgeColor = (priority: Alert['priority']) => {
    switch (priority) {
      case 'critical': return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'high': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'medium': return 'bg-yellow-50 text-yellow-750 border-yellow-250';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getPriorityLabel = (priority: Alert['priority']) => {
    switch (priority) {
      case 'critical': return 'Critique';
      case 'high': return 'Haute';
      case 'medium': return 'Moyenne';
      case 'low': return 'Basse';
    }
  };

  const getStatusLabel = (status: Alert['status']) => {
    switch (status) {
      case 'unread': return 'Non lue';
      case 'read': return 'Lue';
      case 'resolved': return 'Résolue';
      case 'ignored': return 'Ignorée';
    }
  };

  const getStatusBadgeColor = (status: Alert['status']) => {
    switch (status) {
      case 'unread': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'read': return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'resolved': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default: return 'bg-slate-50 text-slate-500 border-slate-100';
    }
  };

  // Unread count in filtered list
  const unreadFilteredCount = alerts.filter(a => a.status === 'unread').length;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Centre d'Alertes</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {`Suivi et audit des anomalies de marge, hausses de coûts fournisseur et décisions clients.`}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => {
            startTransition(() => {
              router.refresh();
            });
          }}
          className="text-xs font-semibold border-slate-200 hover:bg-slate-50 cursor-pointer self-start md:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isPending ? 'animate-spin' : ''}`} />
          {"Actualiser"}
        </Button>
      </div>

      {/* Filter panel */}
      <Card className="p-4 border-slate-200 bg-white rounded-xl shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{"Priorité"}</label>
            <select
              value={filters.priority}
              onChange={(e) => navigateWithFilters({ priority: e.target.value })}
              className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm transition-colors focus-visible:outline-hidden"
            >
              <option value="all">{"Toutes les priorités"}</option>
              <option value="critical">{"Critique"}</option>
              <option value="high">{"Haute"}</option>
              <option value="medium">{"Moyenne"}</option>
              <option value="low">{"Basse"}</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{"Statut"}</label>
            <select
              value={filters.status}
              onChange={(e) => navigateWithFilters({ status: e.target.value })}
              className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm transition-colors focus-visible:outline-hidden"
            >
              <option value="unread">{"Non résolues (Non lues / Lues)"}</option>
              <option value="all">{"Tous les statuts"}</option>
              <option value="read">{"Lues"}</option>
              <option value="resolved">{"Résolues"}</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{"Type d'anomalie"}</label>
            <select
              value={filters.type}
              onChange={(e) => navigateWithFilters({ type: e.target.value })}
              className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm transition-colors focus-visible:outline-hidden"
            >
              <option value="all">{"Tous les types"}</option>
              <option value="cost_increase">{"Hausses de coûts fournisseur"}</option>
              <option value="margin_under_target">{"Marges sous seuil cible"}</option>
              <option value="quote_accepted">{"Devis acceptés"}</option>
              <option value="quote_rejected">{"Devis refusés"}</option>
              <option value="floor_override">{"Dérogations de prix"}</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Bulk actions bar */}
      {selectedIds.length > 0 && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-lg flex items-center justify-between text-xs font-semibold animate-fade-in">
          <div className="flex items-center gap-2">
            <Info className="h-4.5 w-4.5 text-indigo-600" />
            <span>{`${selectedIds.length} alertes sélectionnées`}</span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => handleBulkAction('read')}
              className="h-8 border-indigo-200 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] cursor-pointer"
            >
              <Eye className="h-3.5 w-3.5 mr-1" />
              {"Marquer comme lues"}
            </Button>
            <Button
              size="sm"
              disabled={isPending}
              onClick={() => handleBulkAction('resolved')}
              className="h-8 bg-indigo-650 hover:bg-indigo-750 text-white font-bold text-[11px] cursor-pointer"
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              {"Marquer comme résolues"}
            </Button>
          </div>
        </div>
      )}

      {/* Alerts list */}
      <Card className="border-slate-200 shadow-xs bg-white rounded-2xl overflow-hidden">
        {alerts.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            <h3 className="font-bold text-slate-800 text-sm">{"Aucune alerte trouvée"}</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
              {"Aucune alerte ne correspond à vos filtres. Tout est sous contrôle et les marges sont préservées !"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {/* Header / Select all */}
            <div className="px-6 py-3 bg-slate-50/50 flex items-center gap-4 text-xs font-bold text-slate-400">
              <input
                type="checkbox"
                checked={alerts.length > 0 && selectedIds.length === alerts.length}
                onChange={(e) => handleSelectAll(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer shrink-0"
              />
              <span>{"Sélectionner toutes les alertes de la page"}</span>
              <span className="ml-auto text-[10px] text-slate-400">
                {`${totalCount} alertes au total`}
              </span>
            </div>

            {/* List items */}
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`px-6 py-4 flex gap-4 transition-colors hover:bg-slate-50/30 ${getPriorityColor(alert.priority)}`}
              >
                {/* Checkbox */}
                <div className="pt-0.5 shrink-0">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(alert.id)}
                    onChange={(e) => handleSelectOne(alert.id, e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                  />
                </div>

                {/* Details */}
                <div className="flex-1 space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={`text-[9px] border font-extrabold uppercase py-0.2 px-2 shrink-0 ${getPriorityBadgeColor(alert.priority)}`}>
                      {getPriorityLabel(alert.priority)}
                    </Badge>
                    <Badge className={`text-[9px] border font-bold py-0.2 px-2 shrink-0 ${getStatusBadgeColor(alert.status)}`}>
                      {getStatusLabel(alert.status)}
                    </Badge>
                    <span className="text-[10px] text-slate-400 font-medium ml-auto">
                      {formatDateRelative(alert.created_at)}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <h4 className="font-extrabold text-slate-900 text-xs tracking-tight">{alert.title}</h4>
                    <p className="text-xs text-slate-500 leading-normal max-w-4xl">{alert.message}</p>
                  </div>

                  {/* Actions footer */}
                  <div className="flex flex-wrap gap-2 pt-1 items-center">
                    {/* Mark read/resolved buttons */}
                    {alert.status === 'unread' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isPending}
                        onClick={() => handleUpdateStatus(alert.id, 'read')}
                        className="h-6 text-[10px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                      >
                        {"Marquer lu"}
                      </Button>
                    )}
                    {alert.status !== 'resolved' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isPending}
                        onClick={() => handleUpdateStatus(alert.id, 'resolved')}
                        className="h-6 text-[10px] font-bold text-emerald-650 hover:text-emerald-800 hover:bg-emerald-50 cursor-pointer"
                      >
                        <Check className="h-3 w-3 mr-0.5" />
                        {"Résoudre"}
                      </Button>
                    )}

                    {/* Context links */}
                    {alert.entity_type === 'quotes' && alert.entity_id && (
                      <Link href={`/${orgSlug}/quotes/${alert.entity_id}`}>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[10px] font-bold text-primary cursor-pointer hover:bg-sky-50"
                        >
                          {"Consulter l'Offre"}
                        </Button>
                      </Link>
                    )}
                    {alert.entity_type === 'products' && alert.entity_id && (
                      <Link href={`/${orgSlug}/products/${alert.entity_id}`}>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[10px] font-bold text-primary cursor-pointer hover:bg-sky-50"
                        >
                          {"Fiche Produit"}
                        </Button>
                      </Link>
                    )}
                    {alert.entity_type === 'price_imports' && alert.entity_id && (
                      <Link href={`/${orgSlug}/imports/${alert.entity_id}`}>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[10px] font-bold text-primary cursor-pointer hover:bg-sky-50"
                        >
                          {"Voir l'Import"}
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 text-xs">
          <span className="text-slate-400">
            {`Affichage de la page `}
            <span className="font-semibold text-slate-800">{currentPage}</span>
            {` sur `}
            <span className="font-semibold text-slate-800">{totalPages}</span>
          </span>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage <= 1 || isPending}
              onClick={() => navigateWithFilters({ page: currentPage - 1 })}
              className="h-8 w-8 p-0 cursor-pointer border-slate-200 hover:bg-slate-50 disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage >= totalPages || isPending}
              onClick={() => navigateWithFilters({ page: currentPage + 1 })}
              className="h-8 w-8 p-0 cursor-pointer border-slate-200 hover:bg-slate-50 disabled:opacity-50"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
