import React from 'react';
import { getProductById } from '@/actions/products';
import { getSuppliers } from '@/actions/suppliers';
import ProductDetailsClient from './ProductDetailsClient';

interface ProductDetailsPageProps {
  params: Promise<{ orgSlug: string; id: string }>;
}

export default async function ProductDetailsPage({ params }: ProductDetailsPageProps) {
  const { orgSlug, id } = await params;
  const { data: product, error } = await getProductById(orgSlug, id);
  const { data: suppliers } = await getSuppliers(orgSlug);

  return (
    <ProductDetailsClient 
      orgSlug={orgSlug} 
      productId={id} 
      initialProduct={product || null} 
      suppliers={suppliers || []}
      error={error || null} 
    />
  );
}
