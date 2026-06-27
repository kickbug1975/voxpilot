import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import CrmSettingsClient from './CrmSettingsClient';

interface CrmSettingsPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function CrmSettingsPage({ params }: CrmSettingsPageProps) {
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
    .select('*')
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

  // 4. Role restrictions: Only owners and admins can configure CRM settings
  if (!['owner', 'admin'].includes(userMembership.role)) {
    redirect(`/${orgSlug}/settings`);
  }

  return (
    <CrmSettingsClient
      orgSlug={orgSlug}
      org={currentOrg}
    />
  );
}
