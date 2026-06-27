import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import EmailsPageClient from './EmailsPageClient';

interface EmailsPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function EmailsPage({ params }: EmailsPageProps) {
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

  // 4. Role restrictions: Only owners and admins can view the email outbox logs
  if (!['owner', 'admin'].includes(userMembership.role)) {
    redirect(`/${orgSlug}/settings`);
  }

  // 5. Ensure it is only accessible in development mode or if EMAIL_MODE=log is set.
  const isDevOrLog = process.env.NODE_ENV === 'development' || process.env.EMAIL_MODE === 'log';
  if (!isDevOrLog) {
    redirect(`/${orgSlug}/settings`);
  }

  // 6. Fetch email messages ordered by created_at descending
  const { data: emails } = await supabase
    .from('email_messages')
    .select('*')
    .eq('organization_id', currentOrg.id)
    .order('created_at', { ascending: false });

  return (
    <EmailsPageClient
      orgSlug={orgSlug}
      orgName={currentOrg.name}
      emails={emails || []}
    />
  );
}
