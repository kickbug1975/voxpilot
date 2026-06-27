'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { 
  Search, Package, Users, Truck, FileText, 
  RefreshCw, XCircle, CornerDownLeft
} from 'lucide-react';
import { globalSearch, SearchResultItem, SearchResults } from '@/actions/search';
import { cn } from '@/lib/utils';

interface HeaderSearchProps {
  orgSlug: string;
}

type GroupedType = 'products' | 'customers' | 'suppliers' | 'quotes';

interface FlatItem extends SearchResultItem {
  type: GroupedType;
}

export default function HeaderSearch({ orgSlug }: HeaderSearchProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>({
    products: [],
    customers: [],
    suppliers: [],
    quotes: [],
  });
  
  const [loading, setLoading] = useState(false);

  // Keyboard navigation index
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Platform detection for keyboard shortcut label
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    const isMacPlatform = typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    setIsMac(isMacPlatform);
  }, []);

  // Handle Ctrl+K / Cmd+K globally
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Debounce search input
  useEffect(() => {
    if (!isOpen) return;
    
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults({ products: [], customers: [], suppliers: [], quotes: [] });
      setLoading(false);
      setHighlightedIndex(-1);
      return;
    }

    setLoading(true);
    const delayDebounce = setTimeout(async () => {
      try {
        const res = await globalSearch(orgSlug, trimmed);
        if (res.data) {
          setResults(res.data);
        } else if (res.error) {
          console.error("Global search failed:", res.error);
          setResults({ products: [], customers: [], suppliers: [], quotes: [] });
        }
      } catch (err) {
        console.error("Error during search:", err);
        setResults({ products: [], customers: [], suppliers: [], quotes: [] });
      } finally {
        setLoading(false);
        setHighlightedIndex(0); // Highlight first item automatically
      }
    }, 250);

    return () => clearTimeout(delayDebounce);
  }, [query, isOpen, orgSlug]);

  // Flatten results for keyboard navigation
  const getFlatItems = (): FlatItem[] => {
    const flat: FlatItem[] = [];
    results.products.forEach(item => flat.push({ ...item, type: 'products' }));
    results.customers.forEach(item => flat.push({ ...item, type: 'customers' }));
    results.suppliers.forEach(item => flat.push({ ...item, type: 'suppliers' }));
    results.quotes.forEach(item => flat.push({ ...item, type: 'quotes' }));
    return flat;
  };

  const flatItems = getFlatItems();

  // Keyboard navigation inside modal
  const handleModalKeyDown = (e: React.KeyboardEvent) => {
    if (flatItems.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1) % flatItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev - 1 + flatItems.length) % flatItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < flatItems.length) {
        selectItem(flatItems[highlightedIndex]);
      }
    }
  };

  const selectItem = (item: FlatItem | SearchResultItem) => {
    setIsOpen(false);
    setQuery('');
    setResults({ products: [], customers: [], suppliers: [], quotes: [] });
    router.push(item.url);
  };

  const hasAnyResults = 
    results.products.length > 0 ||
    results.customers.length > 0 ||
    results.suppliers.length > 0 ||
    results.quotes.length > 0;

  const getIcon = (type: GroupedType) => {
    switch (type) {
      case 'products': return <Package className="h-4 w-4 text-indigo-500 shrink-0" />;
      case 'customers': return <Users className="h-4 w-4 text-emerald-500 shrink-0" />;
      case 'suppliers': return <Truck className="h-4 w-4 text-blue-500 shrink-0" />;
      case 'quotes': return <FileText className="h-4 w-4 text-sky-500 shrink-0" />;
    }
  };

  const getSectionTitle = (type: GroupedType) => {
    switch (type) {
      case 'products': return 'Produits';
      case 'customers': return 'Clients';
      case 'suppliers': return 'Fournisseurs';
      case 'quotes': return 'Offres & Devis';
    }
  };

  // Render a specific group section
  const renderSection = (type: GroupedType, items: SearchResultItem[], startIndex: number) => {
    if (items.length === 0) return null;

    return (
      <div className="space-y-1.5 pt-3 first:pt-0">
        <h5 className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          {getSectionTitle(type)}
        </h5>
        <div className="space-y-0.5">
          {items.map((item, idx) => {
            const overallIndex = startIndex + idx;
            const isHighlighted = overallIndex === highlightedIndex;

            return (
              <div
                key={item.id}
                onClick={() => selectItem(item)}
                onMouseEnter={() => setHighlightedIndex(overallIndex)}
                className={cn(
                  "px-3 py-2 rounded-lg flex items-center justify-between gap-3 text-xs cursor-pointer transition-colors",
                  isHighlighted 
                    ? "bg-slate-100 text-slate-900" 
                    : "text-slate-700 hover:bg-slate-50"
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {getIcon(type)}
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{item.title}</p>
                    {item.subtitle && (
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">{item.subtitle}</p>
                    )}
                  </div>
                </div>

                {isHighlighted && (
                  <span className="text-[10px] text-slate-400 flex items-center gap-1 font-medium bg-white border border-slate-200 px-1 py-0.5 rounded shadow-2xs">
                    {"Aller"}
                    <CornerDownLeft className="h-2.5 w-2.5" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Fake input trigger */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center justify-between border border-slate-200 hover:border-slate-350 bg-slate-50/50 hover:bg-slate-50 text-slate-400 hover:text-slate-600 rounded-lg px-3 py-1.5 text-xs w-64 cursor-pointer outline-none transition-all"
      >
        <div className="flex items-center gap-2">
          <Search className="h-3.5 w-3.5 text-slate-400" />
          <span className="font-medium">{"Rechercher..."}</span>
        </div>
        <kbd className="font-sans font-bold text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-3xs text-slate-400 shrink-0">
          {isMac ? "⌘K" : "Ctrl+K"}
        </kbd>
      </button>

      {/* Actual search Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent 
          showCloseButton={false}
          className="max-w-xl w-full p-0 bg-white border border-slate-200 shadow-2xl rounded-2xl overflow-hidden"
        >
          {/* Input Header */}
          <div 
            className="p-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50/30"
            onKeyDown={handleModalKeyDown}
          >
            <Search className="h-4.5 w-4.5 text-slate-400 shrink-0" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher des produits, clients, fournisseurs ou devis..."
              autoFocus
              className="flex-1 bg-transparent border-0 ring-0 focus-visible:ring-0 p-0 text-sm placeholder-slate-400 text-slate-800 outline-none"
            />
            {loading ? (
              <RefreshCw className="h-4 w-4 text-slate-400 animate-spin shrink-0" />
            ) : query.length > 0 ? (
              <button 
                onClick={() => setQuery('')}
                className="text-slate-400 hover:text-slate-600 bg-transparent border-0 p-0 cursor-pointer outline-none"
              >
                <XCircle className="h-4 w-4" />
              </button>
            ) : (
              <span className="text-[10px] text-slate-450 font-bold border border-slate-200 bg-white px-1.5 py-0.5 rounded shadow-3xs">
                {"ESC"}
              </span>
            )}
          </div>

          {/* Results list */}
          <div className="p-3 max-h-[380px] overflow-y-auto divide-y divide-slate-100 bg-white">
            {query.trim().length < 2 ? (
              /* Idle / Instructions */
              <div className="text-center py-10 space-y-1">
                <Search className="h-8 w-8 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-700">{"Recherche globale VoxPilot"}</p>
                <p className="text-xs text-slate-400">{"Saisissez au moins 2 caractères pour lancer la recherche."}</p>
              </div>
            ) : loading ? (
              /* Loading Spinner placeholder */
              <div className="text-center py-16 text-slate-400 space-y-2">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-slate-300" />
                <p className="text-xs">{"Recherche en cours..."}</p>
              </div>
            ) : !hasAnyResults ? (
              /* Empty results */
              <div className="text-center py-12 space-y-1">
                <XCircle className="h-8 w-8 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-700">{"Aucun résultat trouvé"}</p>
                <p className="text-xs text-slate-450">{`Aucune correspondance pour « ${query} »`}</p>
              </div>
            ) : (
              /* Render grouped sections */
              <div className="space-y-4 pt-1 pb-1">
                {renderSection('products', results.products, 0)}
                {renderSection('customers', results.customers, results.products.length)}
                {renderSection('suppliers', results.suppliers, results.products.length + results.customers.length)}
                {renderSection('quotes', results.quotes, results.products.length + results.customers.length + results.suppliers.length)}
              </div>
            )}
          </div>

          {/* Footer keyboard help */}
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-450">
            <div className="flex gap-4">
              <span>
                <kbd className="bg-white border border-slate-200 px-1 py-0.5 rounded mr-1">{"↑↓"}</kbd>
                {"Naviguer"}
              </span>
              <span>
                <kbd className="bg-white border border-slate-200 px-1 py-0.5 rounded mr-1">{"Entrée"}</kbd>
                {"Valider"}
              </span>
            </div>
            <span>
              {"Recherche multi-tenant sécurisée"}
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
