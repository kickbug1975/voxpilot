import React from 'react';
import { getMarginRules } from '@/actions/margins';
import { getCustomers } from '@/actions/customers';
import { getProducts } from '@/actions/products';
import { createClient } from '@/lib/supabase/server';
import MarginsPageClient from './MarginsPageClient';

interface MarginsPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function MarginsPage({ params }: MarginsPageProps) {
  const { orgSlug } = await params;
  
  // 1. Fetch rules
  const { data: rules, error: rulesError } = await getMarginRules(orgSlug);

  // 2. Fetch customers
  const { data: customers } = await getCustomers(orgSlug);

  // 3. Fetch products
  const { data: products } = await getProducts(orgSlug);

  // 4. Fetch product categories
  const supabase = await createClient();
  const { data: categories } = await supabase
    .from('product_categories')
    .select('id, name')
    .order('name');

  // 5. Fetch default organization margin rate for simulation fallback
  const { data: org } = await supabase
    .from('organizations')
    .select('default_margin_rate, default_rounding_rule')
    .eq('slug', orgSlug)
    .single();

  const defaultOrgMarginRate = org?.default_margin_rate ? parseFloat(org.default_margin_rate) : 0.20;
  const defaultRoundingRule = org?.default_rounding_rule || 'up_0_05';

  return (
    <MarginsPageClient
      orgSlug={orgSlug}
      initialRules={rules || []}
      customers={customers || []}
      products={products || []}
      categories={categories || []}
      defaultOrgMarginRate={defaultOrgMarginRate}
      defaultRoundingRule={defaultRoundingRule}
      error={rulesError || null}
    />
  );
}
