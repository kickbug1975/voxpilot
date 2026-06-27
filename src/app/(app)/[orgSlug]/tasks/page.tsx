import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTasks } from '@/actions/tasks';
import TasksPageClient from './TasksPageClient';

interface TasksPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function TasksPage({ params }: TasksPageProps) {
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

  // 4. Fetch tasks
  const tasksRes = await getTasks(orgSlug);
  if (tasksRes.error) {
    return (
      <div className="p-8 text-center text-rose-600 bg-rose-50/50 border border-rose-200/50 rounded-xl max-w-lg mx-auto mt-12">
        <h2 className="text-sm font-bold">{"Erreur de chargement"}</h2>
        <p className="text-xs text-rose-500 mt-1">{tasksRes.error}</p>
      </div>
    );
  }

  // 5. Fetch organization members
  let members: { id: string; fullName: string }[] = [];
  try {
    const { data: memberships } = await supabase
      .from('organization_memberships')
      .select('user_id')
      .eq('organization_id', currentOrg.id);

    if (memberships && memberships.length > 0) {
      const userIds = memberships.map(m => m.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);

      members = (profiles || []).map(p => ({
        id: p.id,
        fullName: p.full_name || 'Utilisateur',
      }));
    }
  } catch (err) {
    console.error('Error fetching members for tasks page:', err);
  }

  return (
    <TasksPageClient
      orgSlug={orgSlug}
      currentUserId={user.id}
      currentUserRole={userMembership.role}
      initialTasks={tasksRes.data || []}
      members={members}
    />
  );
}
