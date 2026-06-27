import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { 
  getDashboardStats, 
  getRecentAlerts, 
  getRecentCostVariations, 
  getRecentQuotes 
} from '@/actions/dashboard';
import DashboardClient from './DashboardClient';

interface DashboardProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function OrgDashboardPage({ params }: DashboardProps) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  // 1 & 2. Get logged-in user and verify access in parallel
  const [userResult, orgResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('organizations')
      .select('id, name')
      .eq('slug', orgSlug)
      .single()
  ]);

  const user = userResult.data?.user;
  const userError = userResult.error;
  if (userError || !user) {
    redirect('/login');
  }

  const currentOrg = orgResult.data;
  const orgError = orgResult.error;
  if (orgError || !currentOrg) {
    redirect('/login');
  }

  // 3 & 4. Fetch dashboard stats, alerts, variations, quotes, and checklist counts in parallel
  const [
    statsResult,
    alertsResult,
    costVariationsResult,
    quotesResult,
    productsCountResult,
    confirmedImportsCountResult,
    quotesCountResult,
    sharedQuotesCountResult
  ] = await Promise.all([
    getDashboardStats(orgSlug),
    getRecentAlerts(orgSlug),
    getRecentCostVariations(orgSlug),
    getRecentQuotes(orgSlug),
    supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', currentOrg.id),
    supabase
      .from('price_imports')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', currentOrg.id)
      .eq('status', 'confirmed'),
    supabase
      .from('quotes')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', currentOrg.id),
    supabase
      .from('quotes')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', currentOrg.id)
      .in('status', ['sent', 'viewed', 'accepted', 'rejected'])
  ]);

  const productsCount = productsCountResult.count;
  const confirmedImportsCount = confirmedImportsCountResult.count;
  const quotesCount = quotesCountResult.count;
  const sharedQuotesCount = sharedQuotesCountResult.count;

  // Compute onboarding checklist state
  const checklist = {
    orgCreated: true, // always true if organization exists
    demoLoaded: (productsCount || 0) >= 10,
    importCompleted: (confirmedImportsCount || 0) > 0,
    quoteCreated: (quotesCount || 0) > 0,
    quoteShared: (sharedQuotesCount || 0) > 0,
  };

  const defaultStats = {
    averageMargin: 0.20,
    atRiskCount: 0,
    potentialProtectedUnitMargin: 0,
    potentialProtectedQuoteMargin: 0,
    activeQuotesCount: 0
  };

  return (
    <DashboardClient
      orgSlug={orgSlug}
      orgName={currentOrg.name}
      stats={statsResult.data || defaultStats}
      initialAlerts={(alertsResult.data as any[]) || []}
      variations={costVariationsResult.data || []}
      quotes={(quotesResult.data as any[]) || []}
      checklist={checklist}
    />
  );
}
