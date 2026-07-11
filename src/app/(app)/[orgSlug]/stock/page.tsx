import React from 'react';
import { getProducts } from '@/actions/products';
import StockClient from './StockClient';
import { Warehouse } from 'lucide-react';

interface StockPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function StockPage({ params }: StockPageProps) {
  const { orgSlug } = await params;
  const result = await getProducts(orgSlug);

  if ('error' in result) {
    return (
      <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-5 shadow-sm">
        <h2 className="font-bold text-base">Erreur de chargement</h2>
        <p className="text-sm mt-1">{result.error}</p>
      </div>
    );
  }

  const products = result.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Warehouse className="h-7 w-7 text-indigo-600" />
            Gestion des Disponibilités & Stocks Magasin
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Déclarez les produits disponibles au catalogue général ou restants en magasin pour les livraisons.
          </p>
        </div>
      </div>

      <StockClient products={products as any} orgSlug={orgSlug} />
    </div>
  );
}
