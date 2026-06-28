'use server';

import { createClient } from '@/lib/supabase/server';
import { TaskService, TaskInput } from '@/domain/crm/TaskService';
import { revalidatePath } from 'next/cache';
import { SupabaseClient } from '@supabase/supabase-js';

// Helper to get organization ID
async function getOrgId(supabase: SupabaseClient, orgSlug: string): Promise<string> {
  const { data: org, error } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', orgSlug)
    .single();

  if (error || !org) {
    throw new Error('Organisation introuvable ou accès non autorisé.');
  }

  return org.id;
}

export interface TaskFilters {
  assignedTo?: string;
  status?: 'open' | 'in_progress' | 'completed' | 'cancelled';
  customerId?: string;
  overdue?: boolean;
}

export async function getTasks(orgSlug: string, filters: TaskFilters = {}) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    let query = supabase
      .from('tasks')
      .select('*, customers(legal_name)')
      .eq('organization_id', orgId);

    if (filters.assignedTo) {
      query = query.eq('assigned_to', filters.assignedTo);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.customerId) {
      query = query.eq('customer_id', filters.customerId);
    }
    if (filters.overdue) {
      const nowStr = new Date().toISOString();
      query = query.in('status', ['open', 'in_progress']).lt('due_at', nowStr);
    }

    const { data: tasks, error } = await query.order('due_at', { ascending: true });

    if (error) throw error;
    return { data: tasks || [] };
  } catch (err) {
    console.error('Error fetching tasks:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de charger les tâches.' };
  }
}

export async function createTask(orgSlug: string, formData: FormData) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: userData } = await supabase.auth.getUser();
    const actorUserId = userData?.user?.id;
    if (!actorUserId) throw new Error('Utilisateur non connecté.');

    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const customerId = formData.get('customerId') as string;
    const locationId = formData.get('locationId') as string;
    const contactId = formData.get('contactId') as string;
    const quoteId = formData.get('quoteId') as string;
    const taskType = formData.get('taskType') as any || 'other';
    const priority = formData.get('priority') as any || 'normal';
    const dueAt = formData.get('dueAt') as string;
    const assignedTo = formData.get('assignedTo') as string || actorUserId;

    const input: TaskInput = {
      organizationId: orgId,
      customerId: customerId || null,
      locationId: locationId || null,
      contactId: contactId || null,
      quoteId: quoteId || null,
      title,
      description: description || null,
      taskType,
      priority,
      dueAt,
      assignedTo,
    };

    const task = await TaskService.createTask(supabase, input, actorUserId);

    if (customerId) {
      revalidatePath(`/${orgSlug}/customers/${customerId}`);
    }
    revalidatePath(`/${orgSlug}/tasks`);
    revalidatePath(`/${orgSlug}/agenda`);
    return { success: true, data: task };
  } catch (err) {
    console.error('Error creating task:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de créer la tâche.' };
  }
}

export async function updateTask(orgSlug: string, taskId: string, formData: FormData) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: userData } = await supabase.auth.getUser();
    const actorUserId = userData?.user?.id;
    if (!actorUserId) throw new Error('Utilisateur non connecté.');

    const input: Partial<TaskInput> & { status?: any } = {};
    if (formData.has('title')) input.title = formData.get('title') as string;
    if (formData.has('description')) input.description = formData.get('description') as string || null;
    if (formData.has('taskType')) input.taskType = formData.get('taskType') as any;
    if (formData.has('priority')) input.priority = formData.get('priority') as any;
    if (formData.has('dueAt')) input.dueAt = formData.get('dueAt') as string;
    if (formData.has('assignedTo')) input.assignedTo = formData.get('assignedTo') as string;
    if (formData.has('status')) input.status = formData.get('status') as any;

    const task = await TaskService.updateTask(supabase, orgId, taskId, input, actorUserId);

    if (task?.customer_id) {
      revalidatePath(`/${orgSlug}/customers/${task.customer_id}`);
    }
    revalidatePath(`/${orgSlug}/tasks`);
    revalidatePath(`/${orgSlug}/agenda`);
    return { success: true, data: task };
  } catch (err) {
    console.error('Error updating task:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de modifier la tâche.' };
  }
}

export async function completeTask(orgSlug: string, taskId: string, outcome: string | null) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: userData } = await supabase.auth.getUser();
    const actorUserId = userData?.user?.id;
    if (!actorUserId) throw new Error('Utilisateur non connecté.');

    const task = await TaskService.completeTask(supabase, orgId, taskId, outcome, actorUserId);

    if (task?.customer_id) {
      revalidatePath(`/${orgSlug}/customers/${task.customer_id}`);
    }
    revalidatePath(`/${orgSlug}/tasks`);
    revalidatePath(`/${orgSlug}/agenda`);
    return { success: true, data: task };
  } catch (err) {
    console.error('Error completing task:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de clôturer la tâche.' };
  }
}

export async function cancelTask(orgSlug: string, taskId: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: userData } = await supabase.auth.getUser();
    const actorUserId = userData?.user?.id;
    if (!actorUserId) throw new Error('Utilisateur non connecté.');

    const task = await TaskService.cancelTask(supabase, orgId, taskId, actorUserId);

    if (task?.customer_id) {
      revalidatePath(`/${orgSlug}/customers/${task.customer_id}`);
    }
    revalidatePath(`/${orgSlug}/tasks`);
    revalidatePath(`/${orgSlug}/agenda`);
    return { success: true, data: task };
  } catch (err) {
    console.error('Error cancelling task:', err);
    return { error: err instanceof Error ? err.message : 'Impossible d\'annuler la tâche.' };
  }
}

export async function bulkCompleteTasks(orgSlug: string, taskIds: string[], outcome: string | null) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: userData } = await supabase.auth.getUser();
    const actorUserId = userData?.user?.id;
    if (!actorUserId) throw new Error('Utilisateur non connecté.');

    const results = [];
    const customerIdsToRebuild = new Set<string>();

    for (const taskId of taskIds) {
      const task = await TaskService.completeTask(supabase, orgId, taskId, outcome, actorUserId);
      if (task?.customer_id) {
        customerIdsToRebuild.add(task.customer_id);
      }
      results.push(task);
    }

    for (const customerId of customerIdsToRebuild) {
      revalidatePath(`/${orgSlug}/customers/${customerId}`);
    }

    revalidatePath(`/${orgSlug}/tasks`);
    revalidatePath(`/${orgSlug}/agenda`);

    return { success: true, count: results.length };
  } catch (err) {
    console.error('Error in bulkCompleteTasks:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de clôturer les tâches.' };
  }
}

export async function bulkCancelTasks(orgSlug: string, taskIds: string[]) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: userData } = await supabase.auth.getUser();
    const actorUserId = userData?.user?.id;
    if (!actorUserId) throw new Error('Utilisateur non connecté.');

    const results = [];
    const customerIdsToRebuild = new Set<string>();

    for (const taskId of taskIds) {
      const task = await TaskService.cancelTask(supabase, orgId, taskId, actorUserId);
      if (task?.customer_id) {
        customerIdsToRebuild.add(task.customer_id);
      }
      results.push(task);
    }

    for (const customerId of customerIdsToRebuild) {
      revalidatePath(`/${orgSlug}/customers/${customerId}`);
    }

    revalidatePath(`/${orgSlug}/tasks`);
    revalidatePath(`/${orgSlug}/agenda`);

    return { success: true, count: results.length };
  } catch (err) {
    console.error('Error in bulkCancelTasks:', err);
    return { error: err instanceof Error ? err.message : 'Impossible d\'annuler les tâches.' };
  }
}

export async function getActiveCustomersForSelect(orgSlug: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data, error } = await supabase
      .from('customers')
      .select('id, legal_name, trade_name')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('legal_name');

    if (error) throw error;
    return { data: data || [] };
  } catch (err) {
    console.error('Error fetching customers for select:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de charger les clients.' };
  }
}

export async function getCustomerSubEntities(customerId: string) {
  try {
    const supabase = await createClient();

    const { data: locs, error: locsError } = await supabase
      .from('customer_locations')
      .select('id, name, address')
      .eq('customer_id', customerId)
      .eq('is_active', true);

    if (locsError) throw locsError;

    const { data: conts, error: contsError } = await supabase
      .from('contacts')
      .select('id, first_name, last_name')
      .eq('customer_id', customerId)
      .eq('is_active', true);

    if (contsError) throw contsError;

    return { 
      data: {
        locations: locs || [],
        contacts: conts || []
      }
    };
  } catch (err) {
    console.error('Error fetching sub entities:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de charger les établissements ou contacts.' };
  }
}
