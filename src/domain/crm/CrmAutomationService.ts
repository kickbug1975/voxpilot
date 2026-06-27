import { SupabaseClient } from '@supabase/supabase-js';
import { CustomerCrmService } from './CustomerCrmService';

export class CrmAutomationService {
  /**
   * Run all daily crm automations (called by cron or CLI script)
   */
  static async runDailyAutomations(supabase: SupabaseClient) {
    const results = {
      inactivityProcessed: 0,
      overdueTasksAlerted: 0,
      missingNextActionAlerted: 0,
    };

    // 1. Process inactivity and dormant transitions
    const inactivityCount = await this.checkInactivityAndTransitions(supabase);
    results.inactivityProcessed = inactivityCount;

    // 2. Process overdue tasks
    const overdueCount = await this.checkOverdueTasks(supabase);
    results.overdueTasksAlerted = overdueCount;

    // 3. Process missing next actions
    const nextActionCount = await this.checkMissingNextActions(supabase);
    results.missingNextActionAlerted = nextActionCount;

    return results;
  }

  /**
   * Transition inactive customer/qualified/prospects to dormant
   * and raise customer_inactive alert.
   */
  static async checkInactivityAndTransitions(supabase: SupabaseClient): Promise<number> {
    let processed = 0;

    // Get all organizations
    const { data: orgs, error: orgsError } = await supabase
      .from('organizations')
      .select('id, inactive_customer_delay_days');

    if (orgsError || !orgs) {
      console.error('Error fetching organizations for inactivity check:', orgsError);
      return 0;
    }

    for (const org of orgs) {
      const delayDays = org.inactive_customer_delay_days ?? 30;
      const thresholdDate = new Date(Date.now() - delayDays * 24 * 60 * 60 * 1000).toISOString();

      // Query active customers/qualified/prospects with no activity since threshold
      // or created before threshold (if no activity recorded yet)
      const { data: customers, error: custError } = await supabase
        .from('customers')
        .select('id, legal_name, owner_user_id, lifecycle_status, last_activity_at, created_at')
        .eq('organization_id', org.id)
        .eq('is_active', true)
        .in('lifecycle_status', ['prospect', 'qualified', 'customer'])
        .or(`last_activity_at.lt.${thresholdDate},and(last_activity_at.is.null,created_at.lt.${thresholdDate})`);

      if (custError) {
        console.error(`Error querying inactive customers for org ${org.id}:`, custError);
        continue;
      }

      for (const customer of customers) {
        // Transition to dormant using lifecycle change service to correctly log crm event
        try {
          await CustomerCrmService.changeLifecycleStatus(
            supabase,
            org.id,
            customer.id,
            'dormant',
            `Inactivité commerciale prolongée (supérieure à ${delayDays} jours).`,
            null // system automated transition
          );

          // Raise alert
          const dedupeKey = `customer_inactive:${customer.id}`;
          await this.createAlertIfNotExist(supabase, {
            organizationId: org.id,
            type: 'customer_inactive',
            priority: 'medium',
            title: 'Client inactif (Dormant)',
            message: `Le client "${customer.legal_name}" a été passé au statut dormant par manque d'activité depuis ${delayDays} jours.`,
            entityType: 'customer',
            entityId: customer.id,
            assignedTo: customer.owner_user_id,
            dedupeKey,
          });

          processed++;
        } catch (err) {
          console.error(`Failed to process inactivity transition for customer ${customer.id}:`, err);
        }
      }
    }

    return processed;
  }

  /**
   * Check for overdue tasks and generate task_overdue alerts
   */
  static async checkOverdueTasks(supabase: SupabaseClient): Promise<number> {
    const now = new Date().toISOString();
    let processed = 0;

    const { data: overdueTasks, error: taskError } = await supabase
      .from('tasks')
      .select('id, title, priority, task_type, due_at, organization_id, assigned_to, customer_id, customers(legal_name)')
      .in('status', ['open', 'in_progress'])
      .lt('due_at', now);

    if (taskError || !overdueTasks) {
      console.error('Error fetching overdue tasks:', taskError);
      return 0;
    }

    for (const task of overdueTasks) {
      const customerName = (task.customers as any)?.legal_name || 'non spécifié';
      const isQuoteFollowUp = task.task_type === 'quote_follow_up';
      const alertType = isQuoteFollowUp ? 'quote_follow_up_due' : 'task_overdue';
      const alertPriority = (task.priority === 'urgent' || task.priority === 'high') ? 'critical' : 'medium';
      
      const title = isQuoteFollowUp
        ? `Relance de devis en retard : ${task.title}`
        : `Tâche en retard : ${task.title}`;
        
      const message = isQuoteFollowUp
        ? `La relance du devis pour le client "${customerName}" est en retard. Échéance : ${new Date(task.due_at).toLocaleDateString('fr-FR')}.`
        : `La tâche "${task.title}" pour le client "${customerName}" est en retard.`;

      const dedupeKey = `${alertType}:${task.id}`;

      try {
        await this.createAlertIfNotExist(supabase, {
          organizationId: task.organization_id,
          type: alertType,
          priority: alertPriority as any,
          title,
          message,
          entityType: 'task',
          entityId: task.id,
          assignedTo: task.assigned_to,
          dedupeKey,
        });

        processed++;
      } catch (err) {
        console.error(`Failed to process overdue alert for task ${task.id}:`, err);
      }
    }

    return processed;
  }

  /**
   * Check for customers missing next action (if required)
   */
  static async checkMissingNextActions(supabase: SupabaseClient): Promise<number> {
    let processed = 0;

    const { data: orgs, error: orgsError } = await supabase
      .from('organizations')
      .select('id, require_next_action_after_activity');

    if (orgsError || !orgs) {
      console.error('Error fetching organizations for next action check:', orgsError);
      return 0;
    }

    for (const org of orgs) {
      if (!org.require_next_action_after_activity) continue;

      // Find active prospects/qualified/customers where next_activity_at is null or in the past
      const { data: customers, error: custError } = await supabase
        .from('customers')
        .select('id, legal_name, owner_user_id, next_activity_at')
        .eq('organization_id', org.id)
        .eq('is_active', true)
        .in('lifecycle_status', ['prospect', 'qualified', 'customer'])
        .or(`next_activity_at.is.null,next_activity_at.lt.${new Date().toISOString()}`);

      if (custError) {
        console.error(`Error querying customers missing next action:`, custError);
        continue;
      }

      for (const customer of customers) {
        // Double check there are actually no open/in_progress tasks
        const { count, error: taskCountError } = await supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('customer_id', customer.id)
          .in('status', ['open', 'in_progress']);

        if (taskCountError) continue;

        if (count === 0) {
          const dedupeKey = `customer_without_next_action:${customer.id}`;
          try {
            await this.createAlertIfNotExist(supabase, {
              organizationId: org.id,
              type: 'customer_without_next_action',
              priority: 'low',
              title: 'Pas de relance future planifiée',
              message: `Le client "${customer.legal_name}" n'a aucune tâche de relance future planifiée.`,
              entityType: 'customer',
              entityId: customer.id,
              assignedTo: customer.owner_user_id,
              dedupeKey,
            });

            processed++;
          } catch (err) {
            console.error(`Failed to process missing next action alert for customer ${customer.id}:`, err);
          }
        }
      }
    }

    return processed;
  }

  /**
   * Create alert with deduplication checks
   */
  private static async createAlertIfNotExist(
    supabase: SupabaseClient,
    alert: {
      organizationId: string;
      type: string;
      priority: 'low' | 'medium' | 'high' | 'critical';
      title: string;
      message: string;
      entityType?: string;
      entityId?: string;
      assignedTo: string;
      dedupeKey: string;
    }
  ) {
    // Check if an unread or read alert with the same dedupe key already exists
    const { data: existing, error } = await supabase
      .from('alerts')
      .select('id')
      .eq('organization_id', alert.organizationId)
      .eq('metadata->>dedupe_key', alert.dedupeKey)
      .in('status', ['unread', 'read'])
      .limit(1);

    if (error) {
      console.error('Error checking duplicate alert:', error);
      return;
    }

    if (existing && existing.length > 0) {
      // Alert already exists, skip
      return;
    }

    // Insert alert
    const { error: insertError } = await supabase
      .from('alerts')
      .insert({
        organization_id: alert.organizationId,
        type: alert.type,
        priority: alert.priority,
        status: 'unread',
        title: alert.title,
        message: alert.message,
        entity_type: alert.entityType || null,
        entity_id: alert.entityId || null,
        assigned_to: alert.assignedTo,
        metadata: { dedupe_key: alert.dedupeKey },
      });

    if (insertError) {
      console.error('Error inserting alert:', insertError);
    }
  }
}
