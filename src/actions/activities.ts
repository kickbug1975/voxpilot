'use server';

import { createClient } from '@/lib/supabase/server';
import { ActivityService, ActivityInput } from '@/domain/crm/ActivityService';
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

// Helper to get active user membership role
async function getUserRole(supabase: SupabaseClient, orgId: string, userId: string): Promise<'owner' | 'admin' | 'manager' | 'sales' | 'viewer'> {
  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();
  
  return (membership?.role as any) || 'viewer';
}

export interface ActivityFilters {
  activityType?: string;
  customerId?: string;
  createdBy?: string;
}

export async function getActivities(orgSlug: string, filters: ActivityFilters = {}) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    let query = supabase
      .from('activities')
      .select('*, customers(legal_name)')
      .eq('organization_id', orgId);

    if (filters.activityType) {
      query = query.eq('activity_type', filters.activityType);
    }
    if (filters.customerId) {
      query = query.eq('customer_id', filters.customerId);
    }
    if (filters.createdBy) {
      query = query.eq('created_by', filters.createdBy);
    }

    const { data: activities, error } = await query.order('occurred_at', { ascending: false });

    if (error) throw error;
    return { data: activities || [] };
  } catch (err) {
    console.error('Error fetching activities:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de charger les activités.' };
  }
}

export async function createActivity(orgSlug: string, formData: FormData) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: userData } = await supabase.auth.getUser();
    const actorUserId = userData?.user?.id;
    if (!actorUserId) throw new Error('Utilisateur non connecté.');

    const customerId = formData.get('customerId') as string;
    const locationId = formData.get('locationId') as string;
    const contactId = formData.get('contactId') as string;
    const quoteId = formData.get('quoteId') as string;
    const activityType = formData.get('activityType') as any || 'other';
    const direction = formData.get('direction') as any || 'outbound';
    const subject = formData.get('subject') as string;
    const content = formData.get('content') as string;
    const outcome = formData.get('outcome') as any;
    const occurredAt = formData.get('occurredAt') as string;
    const durationMinutes = formData.get('durationMinutes') ? parseInt(formData.get('durationMinutes') as string) : null;

    // Optional next action task fields
    const nextTaskTitle = formData.get('nextTaskTitle') as string;
    const nextTaskType = formData.get('nextTaskType') as any;
    const nextTaskDueAt = formData.get('nextTaskDueAt') as string;
    const nextTaskPriority = formData.get('nextTaskPriority') as any || 'normal';

    let nextTask = null;
    if (nextTaskTitle && nextTaskDueAt) {
      nextTask = {
        title: nextTaskTitle,
        taskType: nextTaskType || 'other',
        priority: nextTaskPriority,
        dueAt: nextTaskDueAt,
        assignedTo: actorUserId,
      };
    }

    const input: ActivityInput = {
      organizationId: orgId,
      customerId,
      locationId: locationId || null,
      contactId: contactId || null,
      quoteId: quoteId || null,
      activityType,
      direction,
      subject,
      content: content || null,
      outcome: outcome || null,
      occurredAt: occurredAt || undefined,
      durationMinutes,
      nextTask,
    };

    const activity = await ActivityService.createActivity(supabase, input, actorUserId);

    revalidatePath(`/${orgSlug}/customers/${customerId}`);
    revalidatePath(`/${orgSlug}/activities`);
    revalidatePath(`/${orgSlug}/tasks`);
    revalidatePath(`/${orgSlug}/agenda`);
    return { success: true, data: activity };
  } catch (err) {
    console.error('Error creating activity:', err);
    return { error: err instanceof Error ? err.message : 'Impossible d\'enregistrer l\'activité.' };
  }
}

export async function updateActivity(orgSlug: string, activityId: string, formData: FormData) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: userData } = await supabase.auth.getUser();
    const actorUserId = userData?.user?.id;
    if (!actorUserId) throw new Error('Utilisateur non connecté.');

    const actorRole = await getUserRole(supabase, orgId, actorUserId);

    const subject = formData.get('subject') as string;
    const content = formData.get('content') as string;
    const activityType = formData.get('activityType') as any;
    const direction = formData.get('direction') as any;
    const outcome = formData.get('outcome') as any;
    const occurredAt = formData.get('occurredAt') as string;
    const durationMinutes = formData.get('durationMinutes') ? parseInt(formData.get('durationMinutes') as string) : null;

    const input: Partial<Omit<ActivityInput, 'nextTask'>> = {};
    if (subject !== undefined) input.subject = subject;
    if (content !== undefined) input.content = content;
    if (activityType !== undefined) input.activityType = activityType;
    if (direction !== undefined) input.direction = direction;
    if (outcome !== undefined) input.outcome = outcome;
    if (occurredAt !== undefined) input.occurredAt = occurredAt;
    if (durationMinutes !== undefined) input.durationMinutes = durationMinutes;

    const activity = await ActivityService.updateActivity(supabase, orgId, activityId, input, actorUserId, actorRole);

    revalidatePath(`/${orgSlug}/customers/${activity.customer_id}`);
    revalidatePath(`/${orgSlug}/activities`);
    return { success: true, data: activity };
  } catch (err) {
    console.error('Error updating activity:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de modifier l\'activité.' };
  }
}

export async function pinActivity(orgSlug: string, activityId: string, isPinned: boolean) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: userData } = await supabase.auth.getUser();
    const actorUserId = userData?.user?.id;
    if (!actorUserId) throw new Error('Utilisateur non connecté.');

    const actorRole = await getUserRole(supabase, orgId, actorUserId);

    const activity = await ActivityService.pinActivity(supabase, orgId, activityId, isPinned, actorUserId, actorRole);

    revalidatePath(`/${orgSlug}/customers/${activity.customer_id}`);
    return { success: true, data: activity };
  } catch (err) {
    console.error('Error pinning activity:', err);
    return { error: err instanceof Error ? err.message : 'Impossible d\'épingler l\'activité.' };
  }
}
