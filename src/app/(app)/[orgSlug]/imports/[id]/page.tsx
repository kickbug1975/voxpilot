import React from 'react';
import { notFound } from 'next/navigation';
import { getImportDetails } from '@/actions/imports';
import { getProducts } from '@/actions/products';
import ImportDetailsClient from './ImportDetailsClient';

interface ImportDetailsPageProps {
  params: Promise<{
    orgSlug: string;
    id: string;
  }>;
}

export default async function ImportDetailsPage({ params }: ImportDetailsPageProps) {
  const { orgSlug, id } = await params;

  const { data, error } = await getImportDetails(orgSlug, id);
  if (error || !data) {
    notFound();
  }

  const { data: products } = await getProducts(orgSlug);

  return (
    <ImportDetailsClient
      orgSlug={orgSlug}
      importId={id}
      priceImport={data.priceImport}
      initialRows={data.rows || []}
      products={products || []}
    />
  );
}
