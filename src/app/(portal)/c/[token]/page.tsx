import React from 'react';
import { createClient } from '@/lib/supabase/server';
import PortalClient from './PortalClient';

interface PortalPageProps {
  params: Promise<{ token: string }>;
}

export default async function PortalPage({ params }: PortalPageProps) {
  const { token } = await params;
  const supabase = await createClient();

  // 1. Valider le token
  const { data: tokenData, error: tokenError } = await supabase
    .from('client_portal_tokens')
    .select('customer_id, organization_id, expires_at')
    .eq('token', token)
    .single();

  if (tokenError || !tokenData) {
    return (
      <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-5 shadow-sm mt-10">
        <h2 className="font-bold text-base">Lien non valide</h2>
        <p className="text-sm mt-1">Ce lien d'accès est introuvable ou a expiré. Merci de demander un nouveau lien de commande par WhatsApp.</p>
      </div>
    );
  }

  // Vérifier l'expiration
  if (new Date(tokenData.expires_at) < new Date()) {
    return (
      <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-5 shadow-sm mt-10">
        <h2 className="font-bold text-base">Lien expiré</h2>
        <p className="text-sm mt-1">Ce lien de commande a expiré pour des raisons de sécurité. Demandez-en un nouveau par WhatsApp.</p>
      </div>
    );
  }

  // 2. Charger le client et l'organisation
  const [customerResult, orgResult] = await Promise.all([
    supabase
      .from('customers')
      .select('id, name, trade_name, price_group')
      .eq('id', tokenData.customer_id)
      .single(),
    supabase
      .from('organizations')
      .select('id, name, slug')
      .eq('id', tokenData.organization_id)
      .single()
  ]);

  if (customerResult.error || !customerResult.data || orgResult.error || !orgResult.data) {
    return (
      <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-5 shadow-sm mt-10">
        <h2 className="font-bold text-base">Erreur de configuration</h2>
        <p className="text-sm mt-1">Impossible de charger les données du client ou de l'organisation.</p>
      </div>
    );
  }

  const customer = customerResult.data;
  const organization = orgResult.data;

  // 3. Récupérer la Mercuriale personnalisée (historique des produits commandés)
  const clientNames = [customer.name, customer.trade_name].filter(Boolean) as string[];
  
  const { data: pastOrders } = await supabase
    .from('orders')
    .select('id')
    .eq('organization_id', organization.id)
    .in('client_name', clientNames);

  const orderIds = pastOrders?.map(o => o.id) || [];

  let favoriteProductIds: string[] = [];
  if (orderIds.length > 0) {
    const { data: items } = await supabase
      .from('order_items')
      .select('product_id')
      .in('order_id', orderIds);

    const frequencies: Record<string, number> = {};
    for (const item of items || []) {
      if (item.product_id) {
        frequencies[item.product_id] = (frequencies[item.product_id] || 0) + 1;
      }
    }
    favoriteProductIds = Object.keys(frequencies).sort((a, b) => frequencies[b]! - frequencies[a]!);
  }

  // 4. Charger les produits actifs du catalogue
  const { data: products } = await supabase
    .from('products')
    .select('id, name, internal_sku, is_available, in_stock_ghlin, sales_unit')
    .eq('organization_id', organization.id)
    .eq('is_active', true);

  const formattedProducts = (products || []).map((p) => ({
    id: p.id,
    name: p.name,
    internal_sku: p.internal_sku,
    is_available: p.is_available,
    in_stock_ghlin: p.in_stock_ghlin,
    sales_unit: p.sales_unit,
    is_favorite: favoriteProductIds.includes(p.id),
    favorite_rank: favoriteProductIds.indexOf(p.id)
  }));

  // Tri : Favoris en premier par ordre de fréquence, puis alphabétique
  formattedProducts.sort((a, b) => {
    if (a.is_favorite && b.is_favorite) return a.favorite_rank - b.favorite_rank;
    if (a.is_favorite) return -1;
    if (b.is_favorite) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <PortalClient
      products={formattedProducts}
      customer={customer}
      organization={organization}
      token={token}
    />
  );
}
