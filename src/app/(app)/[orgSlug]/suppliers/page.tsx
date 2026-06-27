import React from 'react';
import { getSuppliers } from '@/actions/suppliers';
import SuppliersPageClient from './SuppliersPageClient';
import { createClient } from '@/lib/supabase/server';

interface SuppliersPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function SuppliersPage({ params }: SuppliersPageProps) {
  const { orgSlug } = await params;
  const { data: suppliers, error } = await getSuppliers(orgSlug);

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
    <SuppliersPageClient 
      orgSlug={orgSlug} 
      initialSuppliers={suppliers || []} 
      categories={categories}
      error={error || null} 
    />
  );
}
