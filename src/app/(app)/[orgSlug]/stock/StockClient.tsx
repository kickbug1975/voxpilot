'use client';

import React, { useState, useTransition } from 'react';
import { updateProductAvailability } from '@/actions/products';
import { 
  Search, 
  Loader2, 
  Warehouse, 
  Globe, 
  Check, 
  AlertCircle, 
  Zap, 
  X, 
  Send, 
  MessageSquare, 
  Megaphone,
  Sparkles
} from 'lucide-react';

interface Product {
  id: string;
  name: string;
  internal_sku: string;
  is_available: boolean;
  in_stock_ghlin: boolean;
  sales_unit: string;
}

interface StockClientProps {
  products: Product[];
  orgSlug: string;
}

export default function StockClient({ products: initialProducts, orgSlug }: StockClientProps) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [search, setSearch] = useState('');
  const [isPending, startTransition] = useTransition();
  const [updateStates, setUpdateStates] = useState<Record<string, 'updating' | 'success' | 'error'>>({});

  // Destockage Flash States
  const [isDestockageOpen, setIsDestockageOpen] = useState(false);
  const [destockProductId, setDestockProductId] = useState('');
  const [destockQty, setDestockQty] = useState('');
  const [destockPrice, setDestockPrice] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.internal_sku.toLowerCase().includes(search.toLowerCase())
  );

  const handleToggle = async (productId: string, field: 'is_available' | 'in_stock_ghlin', currentValue: boolean) => {
    const key = `${productId}-${field}`;
    setUpdateStates((prev) => ({ ...prev, [key]: 'updating' }));

    // Optimistic update
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, [field]: !currentValue } : p))
    );

    startTransition(async () => {
      const res = await updateProductAvailability(orgSlug, productId, { [field]: !currentValue });
      if (res.success) {
        setUpdateStates((prev) => ({ ...prev, [key]: 'success' }));
        setTimeout(() => {
          setUpdateStates((prev) => {
            const copy = { ...prev };
            delete copy[key];
            return copy;
          });
        }, 1500);
      } else {
        // Revert on error
        setProducts((prev) =>
          prev.map((p) => (p.id === productId ? { ...p, [field]: currentValue } : p))
        );
        setUpdateStates((prev) => ({ ...prev, [key]: 'error' }));
        alert(res.error || 'Erreur lors de la mise à jour.');
      }
    });
  };

  const handleLoadSuggestions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destockProductId || !destockQty || !destockPrice) return;
    
    setIsLoadingSuggestions(true);
    setSuggestionError(null);
    setSuggestions([]);

    const selectedProduct = products.find(p => p.id === destockProductId);
    if (!selectedProduct) return;

    try {
      const res = await fetch('/api/crm/destockage/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: destockProductId,
          productName: selectedProduct.name,
          totalQty: parseFloat(destockQty),
          price: parseFloat(destockPrice),
          orgSlug
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Erreur lors de la récupération des suggestions.');
      }

      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch (err: any) {
      console.error(err);
      setSuggestionError(err.message || 'Une erreur est survenue.');
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleUpdateMessage = (customerId: string, newMessage: string) => {
    setSuggestions((prev) =>
      prev.map((s) => (s.customerId === customerId ? { ...s, message: newMessage } : s))
    );
  };

  const handleSendWhatsApp = (phone: string | null, message: string) => {
    if (!phone) {
      alert("Ce client n'a pas de numéro de téléphone renseigné.");
      return;
    }
    // Clean phone number (keep only digits)
    const cleanPhone = phone.replace(/\D/g, '');
    const encodedText = encodeURIComponent(message);
    window.open(`https://wa.me/${cleanPhone}?text=${encodedText}`, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Explication Métier */}
      <div className="bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-500/20 rounded-xl p-5 shadow-sm backdrop-blur-md">
        <h2 className="text-blue-900 font-bold flex items-center gap-2 text-base">
          <Warehouse className="h-5 w-5 text-blue-600" />
          Règles d'affaires & Automatisation du Stock
        </h2>
        <p className="text-slate-600 text-sm mt-2 leading-relaxed">
          Le portail client applique automatiquement le <strong>Cut-off de 14h30</strong> pour les livraisons du lendemain :
        </p>
        <ul className="list-disc pl-5 text-slate-600 text-xs mt-2 space-y-1">
          <li><strong>Avant 14h30</strong> : Les clients accèdent à l'intégralité du <span className="text-blue-600 font-semibold">catalogue général disponible</span> (première colonne).</li>
          <li><strong>Après 14h30</strong> : Seuls les produits restants en stock physique <span className="text-indigo-600 font-semibold">au point de vente de Ghlin</span> (seconde colonne) sont commandables pour livraison le lendemain.</li>
          <li>Les livraisons demandées pour le <strong>lundi</strong> et le <strong>dimanche</strong> sont bloquées par défaut.</li>
        </ul>
      </div>

      {/* Barre de recherche et actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm max-w-md w-full">
          <Search className="h-5 w-5 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Rechercher par nom de poisson ou SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent border-0 outline-none text-slate-800 text-sm placeholder:text-slate-400"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-xs text-slate-400 hover:text-slate-600 px-1 font-semibold"
            >
              Effacer
            </button>
          )}
        </div>

        <button
          onClick={() => {
            setIsDestockageOpen(true);
            setDestockProductId('');
            setDestockQty('');
            setDestockPrice('');
            setSuggestions([]);
            setSuggestionError(null);
          }}
          className="flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold px-4 py-3 rounded-xl shadow-md transition-all duration-200 cursor-pointer shrink-0"
        >
          <Zap className="h-4 w-4 fill-white animate-pulse" />
          Déstockage Flash
        </button>
      </div>

      {/* Grille des produits */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                <th className="px-6 py-4">Nom de l'article</th>
                <th className="px-6 py-4">SKU</th>
                <th className="px-6 py-4 text-center">
                  <span className="inline-flex items-center gap-1.5 justify-center">
                    <Globe className="h-4 w-4 text-blue-500" />
                    Catalogue Général
                  </span>
                </th>
                <th className="px-6 py-4 text-center">
                  <span className="inline-flex items-center gap-1.5 justify-center">
                    <Warehouse className="h-4 w-4 text-indigo-500" />
                    Stock Ghlin (Dernière minute)
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400 font-medium">
                    Aucun article trouvé.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const keyAvailable = `${p.id}-is_available`;
                  const keyGhlin = `${p.id}-in_stock_ghlin`;

                  const stateAvailable = updateStates[keyAvailable];
                  const stateGhlin = updateStates[keyGhlin];

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-semibold text-slate-900">{p.name}</td>
                      <td className="px-6 py-4 text-slate-500 font-mono text-xs">{p.internal_sku}</td>
                      
                      {/* Bascule Catalogue Général */}
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-3">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={p.is_available}
                              onChange={() => handleToggle(p.id, 'is_available', p.is_available)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                          <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                            {stateAvailable === 'updating' && <Loader2 className="h-3 w-3 animate-spin text-blue-600" />}
                            {stateAvailable === 'success' && <Check className="h-3 w-3 text-emerald-600" />}
                            {stateAvailable === 'error' && <AlertCircle className="h-3 w-3 text-rose-600" />}
                          </div>
                        </div>
                      </td>

                      {/* Bascule Stock Ghlin */}
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-3">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={p.in_stock_ghlin}
                              onChange={() => handleToggle(p.id, 'in_stock_ghlin', p.in_stock_ghlin)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                          </label>
                          <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                            {stateGhlin === 'updating' && <Loader2 className="h-3 w-3 animate-spin text-indigo-600" />}
                            {stateGhlin === 'success' && <Check className="h-3 w-3 text-emerald-600" />}
                            {stateGhlin === 'error' && <AlertCircle className="h-3 w-3 text-rose-600" />}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Déstockage Flash */}
      {isDestockageOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col border border-slate-100 animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-amber-500/5 to-orange-500/5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-amber-400 to-orange-500 text-white rounded-xl shadow-md">
                  <Megaphone className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg flex items-center gap-1.5">
                    Déstockage Flash Intelligent
                    <Sparkles className="h-4 w-4 text-amber-500 fill-amber-500 animate-pulse" />
                  </h3>
                  <p className="text-slate-500 text-xs mt-0.5">
                    Ciblez vos clients prioritaires et générez des offres personnalisées par IA.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsDestockageOpen(false)}
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Formulaire (Gauche) */}
                <form onSubmit={handleLoadSuggestions} className="lg:col-span-4 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600">Sélectionner l'article</label>
                    <select
                      value={destockProductId}
                      onChange={(e) => setDestockProductId(e.target.value)}
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-sm outline-none focus:border-amber-500 focus:bg-white transition-colors"
                    >
                      <option value="">-- Choisir un produit --</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600">Quantité en trop (kg)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="Ex: 30"
                      value={destockQty}
                      onChange={(e) => setDestockQty(e.target.value)}
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-sm outline-none focus:border-amber-500 focus:bg-white transition-colors"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600">Prix de déstockage (€/kg)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="Ex: 14.50"
                      value={destockPrice}
                      onChange={(e) => setDestockPrice(e.target.value)}
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-sm outline-none focus:border-amber-500 focus:bg-white transition-colors"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoadingSuggestions}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:from-slate-200 disabled:to-slate-300 disabled:text-slate-500 text-white font-bold py-2.5 rounded-xl shadow-md transition-all duration-200 cursor-pointer"
                  >
                    {isLoadingSuggestions ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Ciblage en cours...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 fill-white" />
                        Générer les offres
                      </>
                    )}
                  </button>
                </form>

                {/* Suggestions (Droite) */}
                <div className="lg:col-span-8 flex flex-col h-full min-h-[300px] border-t lg:border-t-0 lg:border-l border-slate-100 lg:pl-6 pt-6 lg:pt-0">
                  <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-1.5">
                    Clients suggérés par l'IA
                    {suggestions.length > 0 && (
                      <span className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                        Top {suggestions.length}
                      </span>
                    )}
                  </h4>

                  {isLoadingSuggestions && (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 py-12">
                      <Loader2 className="h-10 w-10 animate-spin text-amber-500 mb-2" />
                      <p className="text-sm font-medium">Recherche des meilleurs clients historiques...</p>
                      <p className="text-xs text-slate-400 mt-1">Génération des messages WhatsApp personnalisés...</p>
                    </div>
                  )}

                  {!isLoadingSuggestions && suggestions.length === 0 && !suggestionError && (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-100 rounded-2xl py-12 px-4 bg-slate-50/50">
                      <Megaphone className="h-8 w-8 text-slate-300 mb-2" />
                      <p className="text-xs font-semibold text-center">Entrez le produit et la quantité en trop puis cliquez sur Générer.</p>
                      <p className="text-[10px] text-slate-400 text-center mt-1">Le système exclura automatiquement les clients qui ont déjà commandé aujourd'hui.</p>
                    </div>
                  )}

                  {suggestionError && (
                    <div className="flex-1 flex flex-col items-center justify-center text-rose-500 py-12">
                      <AlertCircle className="h-8 w-8 text-rose-400 mb-2" />
                      <p className="text-xs font-semibold">{suggestionError}</p>
                    </div>
                  )}

                  {!isLoadingSuggestions && suggestions.length > 0 && (
                    <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                      {suggestions.map((s) => {
                        const displayName = s.tradeName || s.customerName;
                        return (
                          <div key={s.customerId} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3 hover:border-slate-200 transition-all duration-150">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <h5 className="font-bold text-slate-900 text-sm">{displayName}</h5>
                                {s.tradeName && s.tradeName !== s.customerName && (
                                  <p className="text-[10px] text-slate-400 font-medium">Légal : {s.customerName}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="bg-blue-50 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-md border border-blue-100">
                                  {s.volume30d.toFixed(1)} kg achetés (30j)
                                </span>
                                <span className="bg-orange-50 text-orange-800 text-[10px] font-bold px-2 py-0.5 rounded-md border border-orange-100">
                                  Offre : {s.proposedQty} kg
                                </span>
                              </div>
                            </div>

                            <textarea
                              value={s.message}
                              onChange={(e) => handleUpdateMessage(s.customerId, e.target.value)}
                              rows={3}
                              className="w-full text-slate-700 bg-white border border-slate-200 rounded-xl p-2.5 text-xs outline-none focus:border-amber-500 transition-colors resize-none leading-relaxed"
                            />

                            <div className="flex items-center justify-between gap-4">
                              <span className="text-[10px] font-mono text-slate-400">
                                Tel : {s.phone || 'Non configuré'}
                              </span>
                              <button
                                onClick={() => handleSendWhatsApp(s.phone, s.message)}
                                disabled={!s.phone}
                                className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg shadow-sm transition-colors cursor-pointer"
                              >
                                <Send className="h-3 w-3 fill-white" />
                                Envoyer
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            </div>
            
            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setIsDestockageOpen(false)}
                className="border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-bold px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
