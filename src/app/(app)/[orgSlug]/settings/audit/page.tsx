import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAuditLogs } from '@/actions/audit';
import AuditPageClient from './AuditPageClient';

interface AuditPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function AuditPage({ params }: AuditPageProps) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  // 1. Get logged-in user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    redirect('/login');
  }

  // 2. Fetch current organization
  const { data: currentOrg, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, slug')
    .eq('slug', orgSlug)
    .single();

  if (orgError || !currentOrg) {
    redirect('/login');
  }

  // 3. Fetch active membership of current user
  const { data: userMembership, error: membershipError } = await supabase
    .from('organization_memberships')
    .select('role')
    .eq('organization_id', currentOrg.id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single();

  if (membershipError || !userMembership) {
    redirect('/login');
  }

  // 4. Role restrictions: Only owners and admins can view the audit logs
  if (!['owner', 'admin'].includes(userMembership.role)) {
    redirect(`/${orgSlug}/settings`);
  }

  // 5. Fetch audit logs
  const logsRes = await getAuditLogs(orgSlug);
  if (logsRes.error) {
    return (
      <div className="p-8 text-center text-rose-600 bg-rose-50/50 border border-rose-200/50 rounded-xl max-w-lg mx-auto mt-12">
        <h2 className="text-sm font-bold">{"Erreur de chargement"}</h2>
        <p className="text-xs text-rose-500 mt-1">{logsRes.error}</p>
      </div>
    );
  }

  return (
    <AuditPageClient
      orgSlug={orgSlug}
      orgName={currentOrg.name}
      logs={logsRes.data || []}
    />
  );
}
