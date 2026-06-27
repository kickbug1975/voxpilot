import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import NewCustomerClient from './NewCustomerClient';

interface NewCustomerPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function NewCustomerPage({ params }: NewCustomerPageProps) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  // 1. Get logged-in user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    redirect('/login');
  }

  // 2. Fetch current organization
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', orgSlug)
    .single();

  if (orgError || !org) {
    redirect('/login');
  }

  // 3. Fetch all memberships in the organization
  const { data: memberships } = await supabase
    .from('organization_memberships')
    .select('user_id')
    .eq('organization_id', org.id);

  const activeUserIds = (memberships || []).map(m => m.user_id);

  // 4. Fetch profiles for all active members
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', activeUserIds);

  const members = (profiles || []).map(p => ({
    id: p.id,
    fullName: p.full_name || 'Utilisateur',
  }));

  return (
    <NewCustomerClient 
      orgSlug={orgSlug} 
      members={members} 
      currentUserId={user.id} 
    />
  );
}
