'use client';

import React, { useState, useEffect } from 'react';
import { Lightbulb, Plus, Sparkles, Loader2 } from 'lucide-react';

interface Suggestion {
  productName: string;
  avgQuantity: number;
  reasonText: string;
}

interface CrossSellWidgetProps {
  orgSlug: string;
  customerId?: string;
  currentProducts: string[];
  onAddProduct: (productName: string, quantity: number) => void;
}

export default function CrossSellWidget({
  orgSlug,
  customerId,
  currentProducts,
  onAddProduct
}: CrossSellWidgetProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (currentProducts.length === 0) {
      setSuggestions([]);
      return;
    }

    const fetchSuggestions = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/crm/cross-sell/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orgSlug, customerId, currentProducts })
        });

        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.suggestions || []);
        }
      } catch (err) {
        console.error('Failed to fetch cross-sell suggestions:', err);
      } finally {
        setIsLoading(false);
      }
    };

    const timer = setTimeout(() => {
      fetchSuggestions();
    }, 400);

    return () => clearTimeout(timer);
  }, [orgSlug, customerId, JSON.stringify(currentProducts)]);

  if (currentProducts.length === 0 || (suggestions.length === 0 && !isLoading)) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50/80 border border-amber-200/80 rounded-xl p-3.5 space-y-2 shadow-xs transition-all">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
          <Lightbulb className="h-4 w-4 text-amber-500 fill-amber-500 animate-pulse" />
          <span>Opportunités de Vente Additionnelle (Cross-Selling)</span>
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
        </div>
        {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />}
      </div>

      <div className="flex flex-wrap gap-2 pt-0.5">
        {suggestions.map((s, idx) => (
          <div
            key={idx}
            className="bg-white border border-amber-200 text-slate-800 rounded-lg p-2 text-xs flex items-center justify-between gap-3 shadow-2xs hover:border-amber-400 transition-all flex-1 min-w-[220px]"
          >
            <div>
              <p className="font-bold text-slate-900 leading-snug">{s.productName}</p>
              <p className="text-[10px] text-slate-500 font-medium">{s.reasonText}</p>
            </div>
            <button
              onClick={() => onAddProduct(s.productName, s.avgQuantity)}
              className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors shrink-0 cursor-pointer shadow-xs"
            >
              <Plus className="h-3 w-3 stroke-[3]" />
              + {s.avgQuantity} kg
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
