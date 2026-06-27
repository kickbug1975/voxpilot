import React from 'react';
import { getImports } from '@/actions/imports';
import { getSuppliers } from '@/actions/suppliers';
import ImportsPageClient from './ImportsPageClient';

interface ImportsPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function ImportsPage({ params }: ImportsPageProps) {
  const { orgSlug } = await params;
  
  const { data: imports, error: impError } = await getImports(orgSlug);
  const { data: suppliers } = await getSuppliers(orgSlug);

  return (
    <ImportsPageClient
      orgSlug={orgSlug}
      initialImports={imports || []}
      suppliers={suppliers || []}
      error={impError || null}
    />
  );
}
