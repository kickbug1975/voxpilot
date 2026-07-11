'use client';

import React, { useState, useTransition } from 'react';
import { updateProductAvailability } from '@/actions/products';
import { Search, Loader2, Warehouse, Globe, Check, AlertCircle } from 'lucide-react';

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

      {/* Barre de recherche */}
      <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm max-w-md">
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
    </div>
  );
}
