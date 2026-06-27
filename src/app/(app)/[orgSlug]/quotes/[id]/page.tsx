import React from 'react';
import { notFound } from 'next/navigation';
import { getQuoteById } from '@/actions/quotes';
import { getProducts } from '@/actions/products';
import { getCustomers } from '@/actions/customers';
import { createClient } from '@/lib/supabase/server';
import QuoteDetailsClient from './QuoteDetailsClient';

interface QuoteDetailsPageProps {
  params: Promise<{
    orgSlug: string;
    id: string;
  }>;
}

export default async function QuoteDetailsPage({ params }: QuoteDetailsPageProps) {
  const { orgSlug, id } = await params;
  const supabase = await createClient();

  const { data, error } = await getQuoteById(orgSlug, id);
  if (error || !data) {
    notFound();
  }

  const { data: products } = await getProducts(orgSlug);
  const { data: customers } = await getCustomers(orgSlug);

  // Fetch organization settings
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, default_margin_rate, default_rounding_rule, sales_can_override_floor, sales_can_view_costs')
    .eq('slug', orgSlug)
    .single();

  if (!org) {
    notFound();
  }

  // Fetch active supplier products for costs lookup
  const { data: supplierProducts } = await supabase
    .from('supplier_products')
    .select('product_id, current_landed_cost, current_purchase_price, conversion_factor, yield_rate, transport_cost, handling_cost, other_fixed_cost, other_cost_percent')
    .eq('organization_id', org.id)
    .eq('is_active', true);

  // Fetch active margin rules for rules resolution
  const { data: marginRules } = await supabase
    .from('margin_rules')
    .select('*')
    .eq('organization_id', org.id)
    .eq('is_active', true);

  // Fetch current user details to check their role
  const { data: { user } } = await supabase.auth.getUser();
  let userRole = 'viewer';
  if (user) {
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('role')
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();
    if (membership) {
      userRole = membership.role;
    }
  }

  return (
    <QuoteDetailsClient
      orgSlug={orgSlug}
      quoteId={id}
      quote={data.quote}
      initialItems={data.items || []}
      products={products || []}
      customers={customers || []}
      supplierProducts={supplierProducts || []}
      marginRules={marginRules || []}
      orgSettings={{
        defaultMarginRate: org.default_margin_rate ? parseFloat(org.default_margin_rate) : 0.20,
        defaultRoundingRule: org.default_rounding_rule || 'up_0_05',
        salesCanOverrideFloor: org.sales_can_override_floor ?? false,
        salesCanViewCosts: org.sales_can_view_costs ?? false,
      }}
      userRole={userRole}
    />
  );
}
