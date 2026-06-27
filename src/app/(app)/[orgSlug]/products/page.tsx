import React from 'react';
import { getProducts } from '@/actions/products';
import ProductsPageClient from './ProductsPageClient';

interface ProductsPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function ProductsPage({ params }: ProductsPageProps) {
  const { orgSlug } = await params;
  const { data: products, error } = await getProducts(orgSlug);

  return (
    <ProductsPageClient 
      orgSlug={orgSlug} 
      initialProducts={products || []} 
      error={error || null} 
    />
  );
}
