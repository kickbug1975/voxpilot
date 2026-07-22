'use client';

import React, { useState, useEffect } from 'react';
import { 
  Bell, Loader2, Send, Sparkles, RefreshCw, MessageSquare, 
  AlertCircle, CheckCircle2, Plus, Smile, Maximize2, Wand2 
} from 'lucide-react';

interface RelanceItem {
  customerId: string;
  customerName: string;
  tradeName: string | null;
  phone: string | null;
  dayName: string;
  orderCountOnThisDay: number;
  topProducts: string[];
  message: string;
  customInstruction?: string;
  isRegenerating?: boolean;
}

interface RelancesWidgetProps {
  orgSlug: string;
}

export default function RelancesWidget({ orgSlug }: RelancesWidgetProps) {
  const [relances, setRelances] = useState<RelanceItem[]>([]);
  const [dayName, setDayName] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  const fetchRelances = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/crm/relances/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgSlug })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Erreur lors du chargement des relances.');
      }

      const data = await res.json();
      setRelances(data.relances || []);
      setDayName(data.dayName || '');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Une erreur est survenue.');
    } fontinally: {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRelances();
  }, [orgSlug]);

  const handleUpdateMessage = (customerId: string, newMessage: string) => {
    setRelances(prev =>
      prev.map(r => (r.customerId === customerId ? { ...r, message: newMessage } : r))
    );
  };

  const handleAppendText = (customerId: string, textToAppend: string) => {
    setRelances(prev =>
      prev.map(r => {
        if (r.customerId === customerId) {
          const current = r.message.trim();
          const separator = current.endsWith('.') || current.endsWith('!') || current.endsWith('?') ? ' ' : ' ';
          return { ...r, message: `${current}${separator}${textToAppend}` };
        }
        return r;
      })
    );
  };

  const handleRegenerateWithInstruction = async (customerId: string, instruction: string) => {
    if (!instruction.trim()) return;

    setRelances(prev =>
      prev.map(r => (r.customerId === customerId ? { ...r, isRegenerating: true } : r))
    );

    try {
      const target = relances.find(r => r.customerId === customerId);
      if (!target) return;

      const res = await fetch('/api/crm/relances/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgSlug,
          singleCustomerId: customerId,
          customInstruction: instruction,
          currentMessage: target.message
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.relanceMessage) {
          setRelances(prev =>
            prev.map(r =>
              r.customerId === customerId
                ? { ...r, message: data.relanceMessage, isRegenerating: false, customInstruction: '' }
                : r
            )
          );
          return;
        }
      }
    } catch (err) {
      console.error(err);
    }

    setRelances(prev =>
      prev.map(r => (r.customerId === customerId ? { ...r, isRegenerating: false } : r))
    );
  };

  const handleSendWhatsApp = (phone: string | null, message: string) => {
    if (!phone) {
      alert("Ce client n'a pas de numéro de téléphone renseigné.");
      return;
    }
    const cleanPhone = phone.replace(/\D/g, '');
    const encodedText = encodeURIComponent(message);
    window.open(`https://wa.me/${cleanPhone}?text=${encodedText}`, '_blank');
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-md space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-blue-600 text-white rounded-xl shadow-sm">
            <Bell className="h-5 w-5 animate-bounce" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              Relances Prédictives du Jour {dayName ? `(${dayName})` : ''}
              <Sparkles className="h-4 w-4 text-indigo-500 fill-indigo-500" />
            </h3>
            <p className="text-slate-500 text-xs mt-0.5">
              Clients réguliers à relancer. Personnalisez le message avant l'envoi WhatsApp.
            </p>
          </div>
        </div>

        <button
          onClick={fetchRelances}
          disabled={isLoading}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 font-semibold px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
          Actualiser
        </button>
      </div>

      {/* Content Body */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-8 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-2" />
          <p className="text-xs font-medium">Analyse des habitudes d'achat et génération des rappels IA...</p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 text-rose-600 rounded-xl text-xs font-medium border border-rose-100">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {!isLoading && !error && relances.length === 0 && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-100 text-xs font-medium">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>Tous vos clients réguliers du jour ont déjà repassé leur commande ou aucune relance n'est requise. Bravo ! 🎉</span>
        </div>
      )}

      {!isLoading && !error && relances.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
          {relances.map((r) => {
            const displayName = r.tradeName || r.customerName;
            const isExpanded = expandedCardId === r.customerId;

            return (
              <div 
                key={r.customerId} 
                className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-4 space-y-3 hover:border-indigo-300 transition-all duration-150 flex flex-col justify-between"
              >
                <div className="space-y-2.5">
                  {/* Top info row */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                        {displayName}
                      </h4>
                      {r.tradeName && r.tradeName !== r.customerName && (
                        <p className="text-[10px] text-slate-400 font-medium">Légal : {r.customerName}</p>
                      )}
                    </div>
                    <span className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-indigo-100 shrink-0">
                      Habitué du {r.dayName}
                    </span>
                  </div>

                  {/* Product habits badge */}
                  {r.topProducts.length > 0 && (
                    <div className="text-[11px] text-slate-500 font-medium">
                      Produits habituels : <span className="text-slate-800 font-semibold">{r.topProducts.join(', ')}</span>
                    </div>
                  )}

                  {/* Message Textarea (Editable & Customizable) */}
                  <div className="relative">
                    <textarea
                      value={r.message}
                      onChange={(e) => handleUpdateMessage(r.customerId, e.target.value)}
                      rows={isExpanded ? 6 : 3}
                      className="w-full text-slate-800 bg-white border border-slate-200 rounded-lg p-3 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-none leading-relaxed font-sans shadow-inner"
                      placeholder="Personnalisez votre message ici..."
                    />
                    <button
                      onClick={() => setExpandedCardId(isExpanded ? null : r.customerId)}
                      title={isExpanded ? "Réduire l'éditeur" : "Agrandir l'éditeur"}
                      className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded transition-colors"
                    >
                      <Maximize2 className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Quick-add Chips for rapid customization */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ajoûts rapides en 1 clic :</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => handleAppendText(r.customerId, "PS : Arrivage de saumon fumé d'exception aujourd'hui ! 🐟")}
                        className="text-[10px] bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 px-2 py-1 rounded-md transition-colors flex items-center gap-1 cursor-pointer font-medium"
                      >
                        <Plus className="h-2.5 w-2.5" /> + Saumon Fumé
                      </button>

                      <button
                        onClick={() => handleAppendText(r.customerId, "Prix promo spécial sur le cabillaud cette semaine ! 🏷️")}
                        className="text-[10px] bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 px-2 py-1 rounded-md transition-colors flex items-center gap-1 cursor-pointer font-medium"
                      >
                        <Plus className="h-2.5 w-2.5" /> + Promo Cabillaud
                      </button>

                      <button
                        onClick={() => handleAppendText(r.customerId, "Dis-moi si tu as besoin d'une livraison ce matin. 🚚")}
                        className="text-[10px] bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 px-2 py-1 rounded-md transition-colors flex items-center gap-1 cursor-pointer font-medium"
                      >
                        <Plus className="h-2.5 w-2.5" /> + Créneau Horaire
                      </button>
                    </div>
                  </div>

                  {/* Custom AI Prompt Input */}
                  <div className="flex items-center gap-1.5 pt-1">
                    <input
                      type="text"
                      value={r.customInstruction || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRelances(prev =>
                          prev.map(item => (item.customerId === r.customerId ? { ...item, customInstruction: val } : item))
                        );
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && r.customInstruction) {
                          handleRegenerateWithInstruction(r.customerId, r.customInstruction);
                        }
                      }}
                      placeholder="Instruction IA (ex: Ajouter une offre sur les moules)..."
                      className="flex-1 text-[11px] bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-400 placeholder:text-slate-400"
                    />
                    <button
                      onClick={() => r.customInstruction && handleRegenerateWithInstruction(r.customerId, r.customInstruction)}
                      disabled={!r.customInstruction || r.isRegenerating}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors shrink-0 cursor-pointer"
                    >
                      {r.isRegenerating ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Wand2 className="h-3 w-3" />
                      )}
                      IA
                    </button>
                  </div>
                </div>

                {/* Footer action bar */}
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200/60 mt-2">
                  <span className="text-[10px] font-mono text-slate-400">
                    Tel : {r.phone || 'Non renseigné'}
                  </span>
                  <button
                    onClick={() => handleSendWhatsApp(r.phone, r.message)}
                    disabled={!r.phone}
                    className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm transition-colors cursor-pointer"
                  >
                    <Send className="h-3 w-3 fill-white" />
                    Envoyer sur WhatsApp
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
