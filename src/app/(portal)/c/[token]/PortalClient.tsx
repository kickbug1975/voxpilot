'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { submitPortalOrder } from '@/actions/portalOrders';
import { Search, ShoppingBasket, CheckCircle2, AlertTriangle, Calendar, Star, Info, ChevronRight, X, Loader2 } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  internal_sku: string;
  is_available: boolean;
  in_stock_ghlin: boolean;
  sales_unit: string;
  is_favorite: boolean;
}

interface Customer {
  id: string;
  name: string;
  trade_name: string | null;
}

interface Organization {
  id: string;
  name: string;
}

interface PortalClientProps {
  products: Product[];
  customer: Customer;
  organization: Organization;
  token: string;
}

export default function PortalClient({ products, customer, organization, token }: PortalClientProps) {
  const [deliveryDate, setDeliveryDate] = useState('');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [datesList, setDatesList] = useState<{ value: string; label: string; isTomorrow: boolean }[]>([]);
  const [isPending, startTransition] = useTransition();
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // 1. Générer la liste des 7 prochains jours de livraison (excluant dimanches et lundis)
  useEffect(() => {
    const dates = [];
    const now = new Date();
    
    // Déterminer l'heure locale à Bruxelles
    const brusselsTimeStr = now.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Brussels', hour12: false });
    const [hours, minutes] = brusselsTimeStr.split(':').map(Number);
    const isPostCutoff = (hours === 14 && minutes >= 30) || hours > 14;

    let daysAdded = 0;
    let current = new Date(now);

    while (daysAdded < 7) {
      current.setDate(current.getDate() + 1);
      const dayOfWeek = current.getDay();

      // Exclure les Dimanches (0) et Lundis (1)
      if (dayOfWeek !== 0 && dayOfWeek !== 1) {
        const year = current.toLocaleDateString('fr-CA', { timeZone: 'Europe/Brussels', year: 'numeric' });
        const month = current.toLocaleDateString('fr-CA', { timeZone: 'Europe/Brussels', month: '2-digit' });
        const day = current.toLocaleDateString('fr-CA', { timeZone: 'Europe/Brussels', day: '2-digit' });
        
        const value = `${year}-${month}-${day}`;
        const label = current.toLocaleDateString('fr-FR', { 
          timeZone: 'Europe/Brussels', 
          weekday: 'long', 
          day: 'numeric', 
          month: 'long' 
        });

        // Déterminer s'il s'agit du lendemain exact de la requête
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toLocaleDateString('fr-CA', { timeZone: 'Europe/Brussels' });
        const isTomorrow = value === tomorrowStr;

        dates.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1), isTomorrow });
        daysAdded++;
      }
    }

    setDatesList(dates);
    if (dates.length > 0) {
      setDeliveryDate(dates[0].value);
    }
  }, []);

  // 2. Déterminer si la date de livraison sélectionnée est assujettie au cut-off de stock Ghlin
  const isPostCutoffForTomorrow = () => {
    if (!deliveryDate) return false;
    
    // Vérifier si la date sélectionnée est demain
    const selectedDateObj = datesList.find(d => d.value === deliveryDate);
    if (!selectedDateObj || !selectedDateObj.isTomorrow) return false;

    // Vérifier l'heure de Bruxelles
    const now = new Date();
    const brusselsTimeStr = now.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Brussels', hour12: false });
    const [hours, minutes] = brusselsTimeStr.split(':').map(Number);
    return (hours === 14 && minutes >= 30) || hours > 14;
  };

  // 3. Évaluer la disponibilité réelle d'un produit selon la date choisie
  const isProductAvailable = (p: Product) => {
    if (!p.is_available) return false;
    
    // Si livraison demain après 14h30 -> seul le stock Ghlin est valide
    if (isPostCutoffForTomorrow()) {
      return p.in_stock_ghlin;
    }
    
    return true;
  };

  const handleQtyChange = (productId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      });
    } else {
      setCart((prev) => ({ ...prev, [productId]: qty }));
    }
  };

  const handleOrderSubmit = () => {
    if (Object.keys(cart).length === 0) return;
    
    setErrorMessage('');
    const items = Object.entries(cart).map(([productId, quantity]) => ({
      productId,
      quantity,
    }));

    startTransition(async () => {
      const res = await submitPortalOrder(token, items, deliveryDate);
      if (res.success) {
        setOrderSuccess(true);
        setCart({});
      } else {
        setErrorMessage(res.error || 'Une erreur est survenue lors de la commande.');
      }
    });
  };

  // Filtrer les produits pour la recherche
  const searchFilter = (p: Product) => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.internal_sku.toLowerCase().includes(search.toLowerCase());

  const favorites = products.filter(p => p.is_favorite && searchFilter(p));
  const others = products.filter(p => !p.is_favorite && searchFilter(p));

  const totalItemsCount = Object.values(cart).reduce((sum, q) => sum + q, 0);

  if (orderSuccess) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xl text-center space-y-6 mt-10">
        <div className="mx-auto h-16 w-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 shadow-inner">
          <CheckCircle2 className="h-10 w-10 animate-bounce" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">Commande Transmise !</h1>
          <p className="text-slate-500 text-sm">
            Votre commande a été enregistrée avec succès dans notre système de préparation pour le :
          </p>
          <div className="inline-block bg-slate-100 rounded-lg px-4 py-2 text-slate-800 font-bold text-sm mt-2">
            {datesList.find(d => d.value === deliveryDate)?.label || deliveryDate}
          </div>
        </div>
        <div className="pt-4 border-t border-slate-100 text-slate-500 text-xs leading-relaxed">
          Un récapitulatif a été consigné sur votre fiche client. Nos équipes préparent vos caisses de marée. Merci de votre confiance !
        </div>
        <button
          onClick={() => setOrderSuccess(false)}
          className="w-full bg-indigo-600 text-white rounded-xl py-3 font-semibold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 text-sm"
        >
          Passer une autre commande
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête Client */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div>
          <span className="text-[10px] uppercase font-extrabold tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
            Poissonnerie Delica & Van Hauwaert
          </span>
          <h1 className="text-xl font-bold text-slate-900 mt-1">
            Bonjour, {customer.trade_name || customer.name}
          </h1>
          <p className="text-slate-400 text-xs mt-0.5">
            Saisissez vos quantités de marée en kg pour préparer votre livraison.
          </p>
        </div>

        {/* Choix de la Date de livraison */}
        <div className="space-y-1.5 pt-3 border-t border-slate-100">
          <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
            <Calendar className="h-4 w-4 text-indigo-500" />
            Date de livraison souhaitée :
          </label>
          <select
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition"
          >
            {datesList.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label} {d.isTomorrow ? ' (Demain)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Message d'info sur le Cut-off de Ghlin */}
      {isPostCutoffForTomorrow() && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-amber-800 shadow-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-xs leading-relaxed">
            <span className="font-bold">Limite de 14h30 dépassée pour demain !</span><br />
            Seuls les articles actuellement présents en stock magasin à Ghlin sont commandables pour cette livraison. Le reste du catalogue est grisé.
          </div>
        </div>
      )}

      {/* Erreur */}
      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex gap-3 text-rose-800">
          <Info className="h-5 w-5 shrink-0 text-rose-600" />
          <div className="text-xs font-semibold leading-relaxed">{errorMessage}</div>
        </div>
      )}

      {/* Barre de recherche */}
      <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <Search className="h-5 w-5 text-slate-400 shrink-0" />
        <input
          type="text"
          placeholder="Rechercher un poisson ou un crustacé..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-transparent border-0 outline-none text-slate-800 text-sm placeholder:text-slate-400"
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* 🌟 1. SECTION MERCURIALE (VOS PRODUITS HABITUELS) */}
      {favorites.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 px-1">
            <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
            Vos produits habituels (Mercuriale)
          </h2>
          <div className="grid gap-3">
            {favorites.map((p) => {
              const available = isProductAvailable(p);
              const qty = cart[p.id] || 0;

              return (
                <div 
                  key={p.id} 
                  className={`bg-white border rounded-xl p-4 flex items-center justify-between shadow-sm transition ${
                    !available ? 'opacity-50 border-slate-200 bg-slate-50/50' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-1 pr-4">
                    <h3 className="font-bold text-slate-900 text-sm leading-tight">{p.name}</h3>
                    <p className="text-[10px] text-slate-400 font-mono">SKU: {p.internal_sku}</p>
                  </div>
                  
                  {available ? (
                    <div className="flex items-center gap-3 bg-slate-50 rounded-lg p-1 border border-slate-200">
                      <button
                        onClick={() => handleQtyChange(p.id, qty - 1)}
                        className="h-8 w-8 rounded-md bg-white flex items-center justify-center font-bold text-slate-600 border border-slate-200/50 hover:bg-slate-50 text-sm"
                      >
                        -
                      </button>
                      <span className="w-12 text-center text-sm font-extrabold text-slate-800">
                        {qty > 0 ? `${qty} ${p.sales_unit}` : `0 ${p.sales_unit}`}
                      </span>
                      <button
                        onClick={() => handleQtyChange(p.id, qty + 1)}
                        className="h-8 w-8 rounded-md bg-indigo-600 text-white flex items-center justify-center font-bold hover:bg-indigo-700 text-sm"
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] font-extrabold text-amber-600 bg-amber-50 border border-amber-100 rounded-md px-2 py-1">
                      Indisponible
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 📦 2. LE RESTE DU CATALOGUE */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
          {favorites.length > 0 ? 'Autres produits du catalogue' : 'Produits du catalogue'}
        </h2>
        <div className="grid gap-3">
          {others.length === 0 && favorites.length === 0 ? (
            <div className="bg-white rounded-xl p-8 border border-slate-200 text-center text-slate-400 text-xs">
              Aucun poisson ne correspond à votre recherche.
            </div>
          ) : (
            others.map((p) => {
              const available = isProductAvailable(p);
              const qty = cart[p.id] || 0;

              return (
                <div 
                  key={p.id} 
                  className={`bg-white border rounded-xl p-4 flex items-center justify-between shadow-sm transition ${
                    !available ? 'opacity-50 border-slate-200 bg-slate-50/50' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-1 pr-4">
                    <h3 className="font-bold text-slate-900 text-sm leading-tight">{p.name}</h3>
                    <p className="text-[10px] text-slate-400 font-mono">SKU: {p.internal_sku}</p>
                  </div>
                  
                  {available ? (
                    <div className="flex items-center gap-3 bg-slate-50 rounded-lg p-1 border border-slate-200">
                      <button
                        onClick={() => handleQtyChange(p.id, qty - 1)}
                        className="h-8 w-8 rounded-md bg-white flex items-center justify-center font-bold text-slate-600 border border-slate-200/50 hover:bg-slate-50 text-sm"
                      >
                        -
                      </button>
                      <span className="w-12 text-center text-sm font-extrabold text-slate-800">
                        {qty > 0 ? `${qty} ${p.sales_unit}` : `0 ${p.sales_unit}`}
                      </span>
                      <button
                        onClick={() => handleQtyChange(p.id, qty + 1)}
                        className="h-8 w-8 rounded-md bg-indigo-600 text-white flex items-center justify-center font-bold hover:bg-indigo-700 text-sm"
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] font-extrabold text-amber-600 bg-amber-50 border border-amber-100 rounded-md px-2 py-1">
                      Indisponible
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 🛒 BARRE D'ACTION PANIER COLLANTE */}
      {totalItemsCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 shadow-2xl flex items-center justify-between max-w-lg mx-auto z-40 rounded-t-2xl animate-fade-in-up">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center shadow-inner">
              <ShoppingBasket className="h-5 w-5" />
            </div>
            <div>
              <span className="font-extrabold text-slate-900 text-sm">
                {totalItemsCount} article{totalItemsCount > 1 ? 's' : ''}
              </span>
              <p className="text-[10px] text-slate-400">Commande prête à être validée</p>
            </div>
          </div>
          <button
            onClick={handleOrderSubmit}
            disabled={isPending}
            className="bg-indigo-600 text-white font-bold text-sm px-6 py-3 rounded-xl hover:bg-indigo-700 transition flex items-center gap-1 shadow-lg shadow-indigo-200 disabled:opacity-50"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Validation...
              </>
            ) : (
              <>
                Valider la commande
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
