import { SupabaseClient } from '@supabase/supabase-js';
import { CustomerCrmService } from './CustomerCrmService';
import { TaskService, TaskInput } from './TaskService';

export interface ActivityInput {
  organizationId: string;
  customerId: string;
  locationId?: string | null;
  contactId?: string | null;
  quoteId?: string | null;
  activityType: 'call' | 'email' | 'visit' | 'meeting' | 'video_call' | 'product_test' | 'tasting' | 'note' | 'quote_follow_up' | 'internal_action' | 'other';
  direction: 'inbound' | 'outbound' | 'internal';
  subject: string;
  content?: string | null;
  outcome?: 'successful' | 'no_answer' | 'voicemail' | 'follow_up_needed' | 'meeting_booked' | 'quote_requested' | 'not_interested' | 'wrong_contact' | 'other' | null;
  occurredAt?: string;
  durationMinutes?: number | null;
  nextTask?: Omit<TaskInput, 'organizationId' | 'customerId' | 'locationId' | 'contactId' | 'quoteId'> | null;
}

export class ActivityService {
  /**
   * Enregistre une interaction/activité commerciale.
   * Gère automatiquement la création de la tâche suivante et la validation de l'obligation de relance.
   */
  static async createActivity(supabase: SupabaseClient, input: ActivityInput, actorUserId: string) {
    if (!input.subject || input.subject.trim().length === 0) {
      throw new Error('Le sujet de l\'activité est obligatoire.');
    }

    const isCommercial = ['call', 'email', 'visit', 'meeting', 'video_call', 'product_test', 'tasting', 'quote_follow_up'].includes(input.activityType);

    // 1. Validation de l'obligation de prochaine action
    if (isCommercial) {
      const { data: org } = await supabase
        .from('organizations')
        .select('require_next_action_after_activity')
        .eq('id', input.organizationId)
        .single();

      if (org?.require_next_action_after_activity && !input.nextTask) {
        // Vérifie s'il existe déjà une tâche ouverte ou en cours pour ce client
        const { count, error: countErr } = await supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', input.organizationId)
          .eq('customer_id', input.customerId)
          .in('status', ['open', 'in_progress']);

        if (countErr) throw countErr;

        if (!count || count === 0) {
          throw new Error('Une prochaine action (tâche) est obligatoire pour valider cette activité.');
        }
      }
    }

    // 2. Insérer l'activité
    const { data: activity, error } = await supabase
      .from('activities')
      .insert({
        organization_id: input.organizationId,
        customer_id: input.customerId,
        location_id: input.locationId || null,
        contact_id: input.contactId || null,
        quote_id: input.quoteId || null,
        activity_type: input.activityType,
        direction: input.direction || 'outbound',
        subject: input.subject,
        content: input.content || null,
        outcome: input.outcome || null,
        occurred_at: input.occurredAt || new Date().toISOString(),
        duration_minutes: input.durationMinutes || null,
        created_by: actorUserId,
        updated_by: actorUserId,
      })
      .select()
      .single();

    if (error) throw error;

    // 3. Création optionnelle de la tâche suivante
    if (input.nextTask) {
      await TaskService.createTask(
        supabase,
        {
          ...input.nextTask,
          organizationId: input.organizationId,
          customerId: input.customerId,
          locationId: input.locationId || null,
          contactId: input.contactId || null,
          quoteId: input.quoteId || null,
        },
        actorUserId
      );
    }

    // 4. Recalcul des caches CRM sur le client
    await CustomerCrmService.rebuildCustomerCrmCaches(supabase, input.customerId);

    return activity;
  }

  /**
   * Met à jour une interaction.
   * Gère la règle des 24h d'édition pour les commerciaux et logue l'historique d'audit.
   */
  static async updateActivity(
    supabase: SupabaseClient,
    orgId: string,
    activityId: string,
    input: Partial<Omit<ActivityInput, 'nextTask'>>,
    actorUserId: string,
    actorRole: 'owner' | 'admin' | 'manager' | 'sales' | 'viewer'
  ) {
    // 1. Récupère l'activité actuelle
    const { data: current, error: fetchError } = await supabase
      .from('activities')
      .select('*')
      .eq('organization_id', orgId)
      .eq('id', activityId)
      .single();

    if (fetchError || !current) {
      throw new Error('Activité introuvable ou accès non autorisé.');
    }

    // 2. Autorisation d'édition
    const isAuthor = current.created_by === actorUserId;
    const isPrivileged = ['owner', 'admin', 'manager'].includes(actorRole);

    if (!isAuthor && !isPrivileged) {
      throw new Error('Action non autorisée : seuls l\'auteur ou un responsable peuvent modifier cette activité.');
    }

    if (isAuthor && !isPrivileged) {
      const createdTime = new Date(current.created_at).getTime();
      const nowTime = Date.now();
      const diffHours = (nowTime - createdTime) / (1000 * 60 * 60);
      if (diffHours > 24) {
        throw new Error('Fenêtre d\'édition dépassée : vous ne pouvez plus modifier votre activité après 24 heures. Contactez un administrateur.');
      }
    }

    const updateData: any = {
      corrected_at: new Date().toISOString(),
      updated_by: actorUserId,
      updated_at: new Date().toISOString(),
    };

    if (input.subject !== undefined) updateData.subject = input.subject;
    if (input.content !== undefined) updateData.content = input.content;
    if (input.activityType !== undefined) updateData.activity_type = input.activityType;
    if (input.direction !== undefined) updateData.direction = input.direction;
    if (input.outcome !== undefined) updateData.outcome = input.outcome;
    if (input.occurredAt !== undefined) updateData.occurred_at = input.occurredAt;
    if (input.durationMinutes !== undefined) updateData.duration_minutes = input.durationMinutes;

    const { data: updated, error: updateError } = await supabase
      .from('activities')
      .update(updateData)
      .eq('organization_id', orgId)
      .eq('id', activityId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Log à l'audit
    await supabase
      .from('audit_logs')
      .insert({
        organization_id: orgId,
        actor_user_id: actorUserId,
        action: 'activity_corrected',
        entity_type: 'activity',
        entity_id: activityId,
        metadata: {
          old_subject: current.subject,
          new_subject: updated.subject,
          corrected_at: updateData.corrected_at,
        }
      });

    // Recalcule le cache CRM du client rattaché
    await CustomerCrmService.rebuildCustomerCrmCaches(supabase, current.customer_id);

    return updated;
  }

  /**
   * Épingle ou détache une note.
   * Seules les notes peuvent être épinglées.
   */
  static async pinActivity(
    supabase: SupabaseClient,
    orgId: string,
    activityId: string,
    isPinned: boolean,
    actorUserId: string,
    actorRole: 'owner' | 'admin' | 'manager' | 'sales' | 'viewer'
  ) {
    const { data: current, error: fetchError } = await supabase
      .from('activities')
      .select('*')
      .eq('organization_id', orgId)
      .eq('id', activityId)
      .single();

    if (fetchError || !current) {
      throw new Error('Activité introuvable ou accès non autorisé.');
    }

    if (current.activity_type !== 'note') {
      throw new Error('Action non autorisée : seules les notes d\'information peuvent être épinglées.');
    }

    const isAuthor = current.created_by === actorUserId;
    const isPrivileged = ['owner', 'admin', 'manager'].includes(actorRole);

    if (!isAuthor && !isPrivileged) {
      throw new Error('Action non autorisée.');
    }

    const { data, error } = await supabase
      .from('activities')
      .update({
        is_pinned: isPinned,
        updated_by: actorUserId,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', orgId)
      .eq('id', activityId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}
