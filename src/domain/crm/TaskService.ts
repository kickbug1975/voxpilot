import { SupabaseClient } from '@supabase/supabase-js';
import { CustomerCrmService } from './CustomerCrmService';

export interface TaskInput {
  organizationId: string;
  customerId?: string | null;
  locationId?: string | null;
  contactId?: string | null;
  quoteId?: string | null;
  title: string;
  description?: string | null;
  taskType: 'call' | 'email' | 'visit' | 'meeting' | 'quote' | 'quote_follow_up' | 'product_sample' | 'price_review' | 'administrative' | 'other';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  dueAt: string;
  reminderAt?: string | null;
  assignedTo: string;
  automationKey?: string | null;
}

export class TaskService {
  /**
   * Crée une tâche CRM
   */
  static async createTask(supabase: SupabaseClient, input: TaskInput, actorUserId: string) {
    if (!input.title || input.title.trim().length === 0) {
      throw new Error('Le titre de la tâche est obligatoire.');
    }
    if (!input.dueAt) {
      throw new Error('La date d\'échéance est obligatoire.');
    }

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        organization_id: input.organizationId,
        customer_id: input.customerId || null,
        location_id: input.locationId || null,
        contact_id: input.contactId || null,
        quote_id: input.quoteId || null,
        title: input.title,
        description: input.description || null,
        task_type: input.taskType || 'other',
        priority: input.priority || 'normal',
        status: 'open',
        due_at: input.dueAt,
        reminder_at: input.reminderAt || null,
        assigned_to: input.assignedTo,
        automation_key: input.automationKey || null,
        created_by: actorUserId,
        updated_by: actorUserId,
      })
      .select()
      .single();

    if (error) {
      // Si c'est un doublon d'automation key, on ignore ou gère silencieusement pour éviter les doublons de relance
      if (error.code === '23505' && input.automationKey) {
        return null;
      }
      throw error;
    }

    // Recalcule le cache CRM du client si rattaché
    if (input.customerId) {
      await CustomerCrmService.rebuildCustomerCrmCaches(supabase, input.customerId);
    }

    return data;
  }

  /**
   * Modifie une tâche CRM
   */
  static async updateTask(
    supabase: SupabaseClient,
    orgId: string,
    taskId: string,
    input: Partial<TaskInput> & { status?: 'open' | 'in_progress' | 'completed' | 'cancelled' },
    actorUserId: string
  ) {
    // Récupère l'état actuel
    const { data: current, error: fetchError } = await supabase
      .from('tasks')
      .select('customer_id')
      .eq('organization_id', orgId)
      .eq('id', taskId)
      .single();

    if (fetchError || !current) {
      throw new Error('Tâche introuvable ou accès non autorisé.');
    }

    const updateData: any = {
      updated_by: actorUserId,
      updated_at: new Date().toISOString(),
    };

    if (input.title !== undefined) updateData.title = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.taskType !== undefined) updateData.task_type = input.taskType;
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.dueAt !== undefined) updateData.due_at = input.dueAt;
    if (input.reminderAt !== undefined) updateData.reminder_at = input.reminderAt;
    if (input.assignedTo !== undefined) updateData.assigned_to = input.assignedTo;
    if (input.status !== undefined) {
      updateData.status = input.status;
      if (input.status === 'completed') {
        updateData.completed_at = new Date().toISOString();
        updateData.completed_by = actorUserId;
      }
    }

    const { data, error } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('organization_id', orgId)
      .eq('id', taskId)
      .select()
      .single();

    if (error) throw error;

    // Recalcule le cache CRM du client si rattaché
    if (current.customer_id) {
      await CustomerCrmService.rebuildCustomerCrmCaches(supabase, current.customer_id);
    }

    return data;
  }

  /**
   * Clôture (complète) une tâche
   */
  static async completeTask(supabase: SupabaseClient, orgId: string, taskId: string, outcome: string | null, actorUserId: string) {
    const { data: current, error: fetchError } = await supabase
      .from('tasks')
      .select('customer_id')
      .eq('organization_id', orgId)
      .eq('id', taskId)
      .single();

    if (fetchError || !current) {
      throw new Error('Tâche introuvable ou accès non autorisé.');
    }

    const { data, error } = await supabase
      .from('tasks')
      .update({
        status: 'completed',
        outcome: outcome || null,
        completed_at: new Date().toISOString(),
        completed_by: actorUserId,
        updated_by: actorUserId,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', orgId)
      .eq('id', taskId)
      .select()
      .single();

    if (error) throw error;

    // Recalcule le cache CRM du client si rattaché
    if (current.customer_id) {
      await CustomerCrmService.rebuildCustomerCrmCaches(supabase, current.customer_id);
    }

    return data;
  }

  /**
   * Annule une tâche
   */
  static async cancelTask(supabase: SupabaseClient, orgId: string, taskId: string, actorUserId: string) {
    const { data: current, error: fetchError } = await supabase
      .from('tasks')
      .select('customer_id')
      .eq('organization_id', orgId)
      .eq('id', taskId)
      .single();

    if (fetchError || !current) {
      throw new Error('Tâche introuvable ou accès non autorisé.');
    }

    const { data, error } = await supabase
      .from('tasks')
      .update({
        status: 'cancelled',
        updated_by: actorUserId,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', orgId)
      .eq('id', taskId)
      .select()
      .single();

    if (error) throw error;

    // Recalcule le cache CRM du client si rattaché
    if (current.customer_id) {
      await CustomerCrmService.rebuildCustomerCrmCaches(supabase, current.customer_id);
    }

    return data;
  }
}
