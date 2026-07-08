import { SupabaseClient } from '@supabase/supabase-js';

export interface CustomerCrmInput {
  organizationId: string;
  legalName: string;
  tradeName?: string | null;
  code?: string | null;
  vatNumber?: string | null;
  primaryEmail?: string | null;
  ccEmails?: string[];
  phone?: string | null;
  lifecycleStatus?: 'prospect' | 'qualified' | 'customer' | 'dormant' | 'lost' | 'blocked';
  potentialLevel?: 'unknown' | 'low' | 'medium' | 'high' | 'strategic';
  ownerUserId: string;
  leadSource?: string | null;
  leadSourceDetail?: string | null;
  website?: string | null;
  industry?: string | null;
  preferredContactChannel?: string | null;
  paymentTerms?: string | null;
  publicNotes?: string | null;
  internalNotes?: string | null;
  segment?: string;
}

export class CustomerCrmService {
  /**
   * Crée un prospect ou un client.
   */
  static async createCustomer(supabase: SupabaseClient, input: CustomerCrmInput, actorUserId: string) {
    if (!input.legalName || input.legalName.trim().length === 0) {
      throw new Error('Le nom légal du client est obligatoire.');
    }

    const lifecycleStatus = input.lifecycleStatus || 'prospect';

    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        organization_id: input.organizationId,
        legal_name: input.legalName,
        trade_name: input.tradeName || null,
        code: input.code || null,
        vat_number: input.vatNumber || null,
        primary_email: input.primaryEmail || null,
        cc_emails: input.ccEmails || [],
        phone: input.phone || null,
        lifecycle_status: lifecycleStatus,
        potential_level: input.potentialLevel || 'unknown',
        owner_user_id: input.ownerUserId,
        lead_source: input.leadSource || null,
        lead_source_detail: input.leadSourceDetail || null,
        website: input.website || null,
        industry: input.industry || null,
        preferred_contact_channel: input.preferredContactChannel || null,
        payment_terms: input.paymentTerms || null,
        public_notes: input.publicNotes || null,
        internal_notes: input.internalNotes || null,
        segment: input.segment || 'retail',
        customer_since: lifecycleStatus === 'customer' ? new Date().toISOString().split('T')[0] : null,
        is_active: true,
        updated_by: actorUserId,
      })
      .select()
      .single();

    if (error) throw error;

    // Log CRM Event
    const { error: eventError } = await supabase
      .from('crm_events')
      .insert({
        organization_id: input.organizationId,
        customer_id: customer.id,
        event_type: 'customer_created',
        source_type: 'customer',
        source_id: customer.id,
        actor_user_id: actorUserId,
        title: 'Création du compte',
        description: `Le compte a été créé avec le statut ${lifecycleStatus}.`,
        metadata: { lifecycle_status: lifecycleStatus }
      });

    if (eventError) console.error('Failed to log CRM event:', eventError);

    return customer;
  }

  /**
   * Change le statut de cycle de vie.
   */
  static async changeLifecycleStatus(
    supabase: SupabaseClient,
    orgId: string,
    customerId: string,
    newStatus: 'prospect' | 'qualified' | 'customer' | 'dormant' | 'lost' | 'blocked',
    reason: string | null,
    actorUserId: string | null
  ) {
    // Récupérer le statut actuel
    const { data: current, error: fetchError } = await supabase
      .from('customers')
      .select('lifecycle_status, legal_name, lost_reason')
      .eq('organization_id', orgId)
      .eq('id', customerId)
      .single();

    if (fetchError || !current) {
      throw new Error('Client introuvable ou accès non autorisé.');
    }

    if (current.lifecycle_status === newStatus) {
      return current;
    }

    // Validation du motif de perte
    if (newStatus === 'lost') {
      const { data: org } = await supabase
        .from('organizations')
        .select('require_lost_reason')
        .eq('id', orgId)
        .single();
      
      if (org?.require_lost_reason && (!reason || reason.trim().length === 0)) {
        throw new Error('Le motif de perte est obligatoire pour enregistrer cette décision.');
      }
    }

    const updateData: any = {
      lifecycle_status: newStatus,
      updated_by: actorUserId,
    };

    if (newStatus === 'lost') {
      updateData.lost_at = new Date().toISOString();
      updateData.lost_reason = reason;
    } else if (newStatus === 'customer') {
      updateData.customer_since = new Date().toISOString().split('T')[0];
    }

    const { data: updated, error: updateError } = await supabase
      .from('customers')
      .update(updateData)
      .eq('organization_id', orgId)
      .eq('id', customerId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Log CRM Event
    await supabase
      .from('crm_events')
      .insert({
        organization_id: orgId,
        customer_id: customerId,
        event_type: 'lifecycle_changed',
        source_type: 'customer',
        source_id: customerId,
        actor_user_id: actorUserId,
        title: 'Changement de statut',
        description: `Statut modifié de ${current.lifecycle_status} à ${newStatus}.`,
        metadata: {
          old_status: current.lifecycle_status,
          new_status: newStatus,
          reason: reason || undefined,
        }
      });

    // Audit logs for all status changes
    await supabase
      .from('audit_logs')
      .insert({
        organization_id: orgId,
        actor_user_id: actorUserId,
        action: 'customer_lifecycle_changed',
        entity_type: 'customer',
        entity_id: customerId,
        metadata: {
          customer_name: current.legal_name,
          old_status: current.lifecycle_status,
          new_status: newStatus,
          reason: reason || undefined
        }
      });

    // Audit logs for blocked accounts
    if (newStatus === 'blocked' || current.lifecycle_status === 'blocked') {
      await supabase
        .from('audit_logs')
        .insert({
          organization_id: orgId,
          actor_user_id: actorUserId,
          action: newStatus === 'blocked' ? 'customer_blocked' : 'customer_unblocked',
          entity_type: 'customer',
          entity_id: customerId,
          metadata: { name: current.legal_name, reason }
        });
    }

    return updated;
  }

  /**
   * Réattribue le responsable commercial d'un client.
   */
  static async assignCustomer(
    supabase: SupabaseClient,
    orgId: string,
    customerId: string,
    newOwnerUserId: string,
    reassignOpenTasks: boolean,
    actorUserId: string
  ) {
    const { data: current, error: fetchError } = await supabase
      .from('customers')
      .select('owner_user_id, legal_name')
      .eq('organization_id', orgId)
      .eq('id', customerId)
      .single();

    if (fetchError || !current) {
      throw new Error('Client introuvable ou accès non autorisé.');
    }

    if (current.owner_user_id === newOwnerUserId) {
      return current;
    }

    // Récupérer le nom du nouveau responsable pour le log
    const { data: newOwner } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', newOwnerUserId)
      .single();

    const { data: updated, error: updateError } = await supabase
      .from('customers')
      .update({
        owner_user_id: newOwnerUserId,
        updated_by: actorUserId,
      })
      .eq('organization_id', orgId)
      .eq('id', customerId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Log CRM Event
    await supabase
      .from('crm_events')
      .insert({
        organization_id: orgId,
        customer_id: customerId,
        event_type: 'owner_changed',
        source_type: 'customer',
        source_id: customerId,
        actor_user_id: actorUserId,
        title: 'Changement de responsable',
        description: `Responsable commercial modifié. Nouveau : ${newOwner?.full_name || newOwnerUserId}.`,
        metadata: {
          old_owner_id: current.owner_user_id,
          new_owner_id: newOwnerUserId,
        }
      });

    // Enregistrement d'audit
    await supabase
      .from('audit_logs')
      .insert({
        organization_id: orgId,
        actor_user_id: actorUserId,
        action: 'customer_reassigned',
        entity_type: 'customer',
        entity_id: customerId,
        metadata: {
          customer_name: current.legal_name,
          old_owner_id: current.owner_user_id,
          new_owner_id: newOwnerUserId,
        }
      });

    // Réattribution optionnelle des tâches ouvertes
    if (reassignOpenTasks) {
      const { error: taskError } = await supabase
        .from('tasks')
        .update({ assigned_to: newOwnerUserId, updated_by: actorUserId })
        .eq('organization_id', orgId)
        .eq('customer_id', customerId)
        .in('status', ['open', 'in_progress']);
      
      if (taskError) console.error('Failed to reassign open tasks:', taskError);
    }

    return updated;
  }

  /**
   * Archive logiquement un client.
   */
  static async archiveCustomer(supabase: SupabaseClient, orgId: string, customerId: string, actorUserId: string) {
    const { data: customer, error: fetchError } = await supabase
      .from('customers')
      .select('legal_name')
      .eq('organization_id', orgId)
      .eq('id', customerId)
      .single();

    if (fetchError || !customer) {
      throw new Error('Client introuvable.');
    }

    const { error: updateError } = await supabase
      .from('customers')
      .update({ is_active: false, updated_by: actorUserId })
      .eq('organization_id', orgId)
      .eq('id', customerId);

    if (updateError) throw updateError;

    // Log CRM Event
    await supabase
      .from('crm_events')
      .insert({
        organization_id: orgId,
        customer_id: customerId,
        event_type: 'customer_archived',
        source_type: 'customer',
        source_id: customerId,
        actor_user_id: actorUserId,
        title: 'Archivage du compte',
        description: 'Le compte a été archivé logiquement.',
      });

    // Enregistrement d'audit
    await supabase
      .from('audit_logs')
      .insert({
        organization_id: orgId,
        actor_user_id: actorUserId,
        action: 'customer_archived',
        entity_type: 'customer',
        entity_id: customerId,
        metadata: { customer_name: customer.legal_name }
      });
  }

  /**
   * Réactive logiquement un client.
   */
  static async reactivateCustomer(supabase: SupabaseClient, orgId: string, customerId: string, actorUserId: string) {
    const { data: customer, error: fetchError } = await supabase
      .from('customers')
      .select('legal_name')
      .eq('organization_id', orgId)
      .eq('id', customerId)
      .single();

    if (fetchError || !customer) {
      throw new Error('Client introuvable.');
    }

    const { error: updateError } = await supabase
      .from('customers')
      .update({ is_active: true, updated_by: actorUserId })
      .eq('organization_id', orgId)
      .eq('id', customerId);

    if (updateError) throw updateError;

    // Log CRM Event
    await supabase
      .from('crm_events')
      .insert({
        organization_id: orgId,
        customer_id: customerId,
        event_type: 'customer_reactivated',
        source_type: 'customer',
        source_id: customerId,
        actor_user_id: actorUserId,
        title: 'Réactivation du compte',
        description: 'Le compte a été réactivé logiquement.',
      });

    // Enregistrement d'audit
    await supabase
      .from('audit_logs')
      .insert({
        organization_id: orgId,
        actor_user_id: actorUserId,
        action: 'customer_reactivated',
        entity_type: 'customer',
        entity_id: customerId,
        metadata: { customer_name: customer.legal_name }
      });
  }

  /**
   * Recalcule les caches CRM : last_activity_at et next_activity_at.
   */
  static async rebuildCustomerCrmCaches(supabase: SupabaseClient, customerId: string) {
    // 1. Calcul de last_activity_at (max occurred_at de ses activités terminées)
    const { data: lastAct, error: lastActError } = await supabase
      .from('activities')
      .select('occurred_at')
      .eq('customer_id', customerId)
      .order('occurred_at', { ascending: false })
      .limit(1);

    if (lastActError) throw lastActError;
    const lastActivityAt = lastAct && lastAct.length > 0 ? lastAct[0].occurred_at : null;

    // 2. Calcul de next_activity_at (min due_at de ses tâches ouvertes)
    const { data: nextAct, error: nextActError } = await supabase
      .from('tasks')
      .select('due_at')
      .eq('customer_id', customerId)
      .in('status', ['open', 'in_progress'])
      .order('due_at', { ascending: true })
      .limit(1);

    if (nextActError) throw nextActError;
    const nextActivityAt = nextAct && nextAct.length > 0 ? nextAct[0].due_at : null;

    // 3. Update customer cache
    const { error: updateError } = await supabase
      .from('customers')
      .update({
        last_activity_at: lastActivityAt,
        next_activity_at: nextActivityAt,
      })
      .eq('id', customerId);

    if (updateError) throw updateError;
  }
}
