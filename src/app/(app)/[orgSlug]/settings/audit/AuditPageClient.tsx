'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, Search, Eye, Terminal, 
  User, Calendar, Globe, Monitor 
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface AuditLog {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_prefix: string | null;
  user_agent_family: string | null;
  profiles: { full_name: string | null } | null;
}

interface AuditPageClientProps {
  orgSlug: string;
  orgName: string;
  logs: AuditLog[];
}

export default function AuditPageClient({ orgSlug, orgName, logs }: AuditPageClientProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const formatAction = (action: string) => {
    switch (action) {
      case 'update_settings': return 'Paramètres mis à jour';
      case 'invite_member': return 'Collaborateur invité';
      case 'resend_invite': return 'Invitation renvoyée';
      case 'revoke_invite': return 'Invitation révoquée';
      case 'update_member_role': return 'Rôle de membre modifié';
      case 'update_member_status': return 'Statut de membre modifié';
      case 'accept_invite': return 'Invitation acceptée';
      case 'import_confirmed': return 'Importation de tarifs confirmée';
      case 'quote_sent': return 'Devis envoyé au client';
      case 'quote_revised': return 'Nouvelle révision de devis';
      case 'quote_accepted': return 'Devis accepté par le client';
      case 'quote_rejected': return 'Devis refusé par le client';
      case 'margin_rule_created': return 'Règle de marge créée';
      case 'margin_rule_updated': return 'Règle de marge modifiée';
      case 'margin_rule_deleted': return 'Règle de marge supprimée';
      default: return action;
    }
  };

  const getEntityLabel = (type: string | null) => {
    if (!type) return '-';
    switch (type) {
      case 'organizations': return 'Organisation';
      case 'price_imports': return 'Import de prix';
      case 'quotes': return 'Devis / Offre';
      case 'margin_rules': return 'Règle de marge';
      case 'organization_memberships': return 'Membre d\'équipe';
      case 'organization_invitations': return 'Invitation';
      default: return type;
    }
  };

  // Filter logs based on search
  const filteredLogs = logs.filter(log => {
    const term = searchTerm.toLowerCase();
    const actionLabel = formatAction(log.action).toLowerCase();
    const actorName = (log.profiles?.full_name || 'Système / Client').toLowerCase();
    const entityType = (getEntityLabel(log.entity_type)).toLowerCase();
    const ip = (log.ip_prefix || '').toLowerCase();
    
    return actionLabel.includes(term) || 
           actorName.includes(term) || 
           entityType.includes(term) || 
           ip.includes(term);
  });

  return (
    <div className="space-y-6">
      {/* Header breadcrumbs */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Link href={`/${orgSlug}/settings`} className="hover:text-slate-900 transition-colors">
              {"Paramètres"}
            </Link>
            <span>{"/"}</span>
            <span className="text-slate-900 font-medium">{"Journal d'audit"}</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-955 tracking-tight">
            {"Journal d'audit de sécurité"}
          </h2>
          <p className="text-xs text-slate-500">
            {`Actions d'administration et d'écriture enregistrées pour l'organisation ${orgName}`}
          </p>
        </div>

        <Link
          href={`/${orgSlug}/settings`}
          className="inline-flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-lg px-3 py-1.5 text-xs transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {"Retour aux paramètres"}
        </Link>
      </div>

      {/* Filter and stats */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Filtrer par action, acteur, objet, IP..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 w-full text-xs bg-slate-50/50 hover:bg-slate-50 focus:bg-white border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 transition-all placeholder-slate-400"
            />
          </div>
          <span className="text-slate-400 text-xs font-medium">
            {`${filteredLogs.length} événement(s) trouvé(s)`}
          </span>
        </div>

        {/* Desktop Table View */}
        <div className="overflow-x-auto border border-slate-100 rounded-lg">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                <th className="px-4 py-3">{"Date / Heure"}</th>
                <th className="px-4 py-3">{"Acteur"}</th>
                <th className="px-4 py-3">{"Action"}</th>
                <th className="px-4 py-3">{"Objet ciblé"}</th>
                <th className="px-4 py-3">{"Réseau (IP)"}</th>
                <th className="px-4 py-3">{"Appareil / UA"}</th>
                <th className="px-4 py-3 text-right">{"Détails"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    {"Aucun événement trouvé."}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500 font-medium">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        {new Date(log.created_at).toLocaleString('fr-FR')}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-slate-400" />
                        {log.profiles?.full_name || 'Système / Client'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {formatAction(log.action)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-600">
                      {getEntityLabel(log.entity_type)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-500">
                      <div className="flex items-center gap-1">
                        <Globe className="h-3.5 w-3.5 text-slate-400" />
                        {log.ip_prefix || 'Interne'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 truncate max-w-[150px]" title={log.user_agent_family || ''}>
                      <div className="flex items-center gap-1">
                        <Monitor className="h-3.5 w-3.5 text-slate-400" />
                        {log.user_agent_family || 'Inconnu'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="inline-flex items-center justify-center p-1.5 text-slate-450 hover:text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-md cursor-pointer transition-colors shadow-3xs"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details dialog */}
      <Dialog open={selectedLog !== null} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-lg w-full bg-white border border-slate-200 shadow-2xl rounded-2xl p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <Terminal className="h-4.5 w-4.5 text-brand-700 shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  {"Métadonnées d'audit"}
                </h4>
                <p className="text-[10px] text-slate-450 mt-0.5">
                  {`ID Action: ${selectedLog?.id}`}
                </p>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <span className="font-semibold text-slate-500">{"Événement :"}</span>
                <span className="col-span-2 text-slate-900 font-semibold">
                  {selectedLog ? formatAction(selectedLog.action) : ''}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="font-semibold text-slate-500">{"Acteur :"}</span>
                <span className="col-span-2 text-slate-900">
                  {selectedLog?.profiles?.full_name || 'Système / Client'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="font-semibold text-slate-500">{"Date / Heure :"}</span>
                <span className="col-span-2 text-slate-800">
                  {selectedLog ? new Date(selectedLog.created_at).toLocaleString('fr-FR') : ''}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-700">{"Contenu (JSON) :"}</span>
              <pre className="p-3 bg-slate-950 text-slate-200 rounded-lg text-[10px] font-mono overflow-auto max-h-[220px] shadow-inner select-all">
                {selectedLog ? JSON.stringify(selectedLog.metadata, null, 2) : '{}'}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer transition-colors animate-none"
              >
                {"Fermer"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
