import React from 'react';
import { getSupplierById } from '@/actions/suppliers';
import SupplierDetailsClient from './SupplierDetailsClient';
import { createClient } from '@/lib/supabase/server';

interface SupplierDetailsPageProps {
  params: Promise<{ orgSlug: string; id: string }>;
}

export default async function SupplierDetailsPage({ params }: SupplierDetailsPageProps) {
  const { orgSlug, id } = await params;
  const { data: supplier, error } = await getSupplierById(orgSlug, id);

  const supabase = await createClient();
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', orgSlug)
    .single();

  const categories = org 
    ? (await supabase.from('product_categories').select('*').eq('organization_id', org.id).order('name')).data || []
    : [];

  return (
    <SupplierDetailsClient 
      orgSlug={orgSlug} 
      supplierId={id} 
      initialSupplier={supplier || null} 
      categories={categories}
      error={error || null} 
    />
  );
}
