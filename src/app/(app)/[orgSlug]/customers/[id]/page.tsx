import React from 'react';
import { getCustomerById } from '@/actions/customers';
import CustomerDetailsClient from './CustomerDetailsClient';
import { createClient } from '@/lib/supabase/server';

interface CustomerDetailsPageProps {
  params: Promise<{ orgSlug: string; id: string }>;
}

export default async function CustomerDetailsPage({ params }: CustomerDetailsPageProps) {
  const { orgSlug, id } = await params;
  const supabase = await createClient();

  const { data: customer, error } = await getCustomerById(orgSlug, id);

  // Fetch organization members to populate owners dropdown
  let members: { id: string; fullName: string }[] = [];
  try {
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', orgSlug)
      .single();

    if (org) {
      const { data: memberships } = await supabase
        .from('organization_memberships')
        .select('user_id')
        .eq('organization_id', org.id);

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
    }
  } catch (err) {
    console.error('Error loading members for customer details page:', err);
  }

  // Fetch tasks associated with this customer
  let tasks: any[] = [];
  try {
    const { data: customerTasks } = await supabase
      .from('tasks')
      .select('*, profiles:assigned_to_user_id(full_name)')
      .eq('customer_id', id)
      .order('created_at', { ascending: false });
    
    if (customerTasks) {
      tasks = customerTasks.map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        task_type: t.task_type,
        due_at: t.due_at,
        assigned_to_user_id: t.assigned_to_user_id,
        assigned_to_name: (t.profiles as any)?.full_name || 'Non assigné'
      }));
    }
  } catch (err) {
    console.error('Error loading tasks for customer details page:', err);
  }

  return (
    <CustomerDetailsClient 
      orgSlug={orgSlug} 
      customerId={id} 
      initialCustomer={customer as any} 
      error={error || null} 
      members={members}
      initialTasks={tasks}
    />
  );
}
