'use client';

import React, { useState, useEffect } from 'react';
import { Bell, Loader2, Send, Sparkles, RefreshCw, MessageSquare, AlertCircle, CheckCircle2 } from 'lucide-react';

interface RelanceItem {
  customerId: string;
  customerName: string;
  tradeName: string | null;
  phone: string | null;
  dayName: string;
  orderCountOnThisDay: number;
  topProducts: string[];
  message: string;
}

interface RelancesWidgetProps {
  orgSlug: string;
}

export default function RelancesWidget({ orgSlug }: RelancesWidgetProps) {
  const [relances, setRelances] = useState<RelanceItem[]>([]);
  const [dayName, setDayName] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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
    } finally {
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
              Clients réguliers n'ayant pas encore passé commande aujourd'hui.
            </p>
          </div>
        </div>

        <button
          onClick={fetchRelances}
          disabled={isLoading}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 font-semibold px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {relances.map((r) => {
            const displayName = r.tradeName || r.customerName;
            return (
              <div key={r.customerId} className="bg-slate-50 border border-slate-200/70 rounded-xl p-4 space-y-3 hover:border-indigo-200 transition-all duration-150 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">{displayName}</h4>
                      {r.tradeName && r.tradeName !== r.customerName && (
                        <p className="text-[10px] text-slate-400 font-medium">Légal : {r.customerName}</p>
                      )}
                    </div>
                    <span className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-indigo-100 shrink-0">
                      Habitué du {r.dayName}
                    </span>
                  </div>

                  {r.topProducts.length > 0 && (
                    <div className="text-[11px] text-slate-500 font-medium">
                      Habituel : <span className="text-slate-800 font-semibold">{r.topProducts.join(', ')}</span>
                    </div>
                  )}

                  <textarea
                    value={r.message}
                    onChange={(e) => handleUpdateMessage(r.customerId, e.target.value)}
                    rows={3}
                    className="w-full text-slate-700 bg-white border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus:border-indigo-500 transition-colors resize-none leading-relaxed"
                  />
                </div>

                <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-200/50">
                  <span className="text-[10px] font-mono text-slate-400">
                    Tel : {r.phone || 'Non configuré'}
                  </span>
                  <button
                    onClick={() => handleSendWhatsApp(r.phone, r.message)}
                    disabled={!r.phone}
                    className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm transition-colors cursor-pointer"
                  >
                    <Send className="h-3 w-3 fill-white" />
                    Relancer
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
