import React from 'react';
import { getOrders } from '@/actions/orders';
import OrdersPageClient from './OrdersPageClient';

interface OrdersPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function OrdersPage({ params }: OrdersPageProps) {
  const { orgSlug } = await params;
  
  const { data: orders, error } = await getOrders(orgSlug);

  return (
    <OrdersPageClient
      orgSlug={orgSlug}
      initialOrders={orders || []}
      error={error || null}
    />
  );
}
