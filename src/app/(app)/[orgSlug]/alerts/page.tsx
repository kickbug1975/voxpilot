import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAlerts } from '@/actions/alerts';
import AlertsPageClient from './AlertsPageClient';

interface AlertsPageProps {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{
    priority?: string;
    status?: string;
    type?: string;
    page?: string;
  }>;
}

export default async function AlertsPage({ params, searchParams }: AlertsPageProps) {
  const { orgSlug } = await params;
  const resolvedSearchParams = await searchParams;
  const supabase = await createClient();

  // 1. Get logged-in user and verify access
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    redirect('/login');
  }

  // 2. Fetch current organization
  const { data: currentOrg, error: orgError } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('slug', orgSlug)
    .single();

  if (orgError || !currentOrg) {
    redirect('/login');
  }

  // 3. Parse and clean search parameters
  const priority = resolvedSearchParams.priority || 'all';
  const status = resolvedSearchParams.status || 'unread';
  const type = resolvedSearchParams.type || 'all';
  const page = parseInt(resolvedSearchParams.page || '1', 10);

  // 4. Fetch filtered and paginated alerts
  const limit = 20;
  const result = await getAlerts(orgSlug, {
    priority,
    status,
    type,
    page,
    limit
  });

  const alerts = result.data || [];
  const count = result.count || 0;
  const totalPages = result.totalPages || 0;

  return (
    <AlertsPageClient
      orgSlug={orgSlug}
      initialAlerts={alerts as any[]}
      totalCount={count}
      currentPage={page}
      totalPages={totalPages}
      filters={{
        priority,
        status,
        type
      }}
    />
  );
}
