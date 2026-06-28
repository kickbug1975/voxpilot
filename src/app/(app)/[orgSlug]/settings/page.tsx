import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserSmtpConfig } from '@/actions/settings';
import SettingsClient from './SettingsClient';

interface SettingsPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { orgSlug } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();

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

  // 3. Fetch active membership of current user to verify access & get their role
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

  // 4. Fetch all memberships in the organization
  const { data: memberships } = await supabase
    .from('organization_memberships')
    .select('*')
    .eq('organization_id', currentOrg.id);

  const activeMemberships = memberships || [];
  const memberUserIds = activeMemberships.map(m => m.user_id);

  // 5. Fetch profiles for all members
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', memberUserIds);

  const profilesMap = new Map<string, string>();
  profiles?.forEach(p => {
    if (p.full_name) {
      profilesMap.set(p.id, p.full_name);
    }
  });

  // 6. Fetch user emails from auth.users (requires admin client)
  // For safety and fallback, initialize a blank emails map
  const emailsMap = new Map<string, string>();
  try {
    const { data: listData } = await admin.auth.admin.listUsers();
    listData?.users?.forEach(u => {
      if (u.email) {
        emailsMap.set(u.id, u.email);
      }
    });
  } catch (err) {
    console.error('Error listing auth users for emails map:', err);
  }

  // Combine membership, profile, and email data
  const members = activeMemberships.map(m => {
    return {
      userId: m.user_id,
      fullName: profilesMap.get(m.user_id) || 'Utilisateur',
      email: emailsMap.get(m.user_id) || 'Email non disponible',
      role: m.role as 'owner' | 'admin' | 'manager' | 'sales' | 'viewer',
      status: m.status as 'active' | 'disabled',
      joinedAt: m.joined_at || m.created_at
    };
  });

  // 7. Fetch pending invitations
  const { data: invitations } = await supabase
    .from('organization_invitations')
    .select('*')
    .eq('organization_id', currentOrg.id)
    .is('accepted_at', null)
    .order('created_at', { ascending: false });

  const pendingInvitations = (invitations || []).map(inv => ({
    id: inv.id,
    email: inv.email,
    role: inv.role as 'owner' | 'admin' | 'manager' | 'sales' | 'viewer',
    expiresAt: inv.expires_at,
    createdAt: inv.created_at
  }));

  // 8. Fetch product categories
  const { data: categories } = await supabase
    .from('product_categories')
    .select('*')
    .eq('organization_id', currentOrg.id)
    .order('name');

  const isDevOrLog = process.env.NODE_ENV === 'development' || process.env.EMAIL_MODE === 'log';

  // 9. Fetch current user SMTP configuration
  const { data: smtpConfig } = await getUserSmtpConfig();

  return (
    <SettingsClient
      orgSlug={orgSlug}
      currentUserRole={userMembership.role}
      currentUserId={user.id}
      org={currentOrg}
      members={members}
      invitations={pendingInvitations}
      isDevOrLog={isDevOrLog}
      initialCategories={categories || []}
      initialSmtpConfig={smtpConfig || null}
    />
  );
}
