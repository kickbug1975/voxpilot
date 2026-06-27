import { SupabaseClient } from '@supabase/supabase-js';

export interface ContactInput {
  organizationId: string;
  customerId: string;
  locationId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  email?: string | null;
  secondaryEmail?: string | null;
  phone?: string | null;
  mobile?: string | null;
  preferredChannel?: string | null;
  language?: string;
  decisionRole?: string;
  influenceLevel?: string;
  notes?: string | null;
  isPrimary?: boolean;
  doNotContact?: boolean;
}

export class ContactService {
  /**
   * Valide les champs obligatoires du contact
   */
  static validateContact(input: Partial<ContactInput>) {
    const hasFirstName = input.firstName && input.firstName.trim().length > 0;
    const hasLastName = input.lastName && input.lastName.trim().length > 0;
    if (!hasFirstName && !hasLastName) {
      throw new Error('Le prénom ou le nom du contact est obligatoire.');
    }
  }

  /**
   * Crée un contact. Gère automatiquement la désignation du contact principal.
   */
  static async createContact(supabase: SupabaseClient, input: ContactInput) {
    this.validateContact(input);

    // Vérifie si c'est le premier contact actif du client
    const { count, error: countError } = await supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', input.organizationId)
      .eq('customer_id', input.customerId)
      .eq('is_active', true);

    if (countError) throw countError;

    // Si premier contact, il devient principal automatiquement
    let isPrimary = input.isPrimary;
    if (count === 0) {
      isPrimary = true;
    }

    // Si on veut forcer ce contact comme principal, on désactive le statut principal des autres
    if (isPrimary) {
      const { error: unsetError } = await supabase
        .from('contacts')
        .update({ is_primary: false })
        .eq('organization_id', input.organizationId)
        .eq('customer_id', input.customerId);
      if (unsetError) throw unsetError;
    }

    const { data, error } = await supabase
      .from('contacts')
      .insert({
        organization_id: input.organizationId,
        customer_id: input.customerId,
        location_id: input.locationId || null,
        first_name: input.firstName || null,
        last_name: input.lastName || null,
        job_title: input.jobTitle || null,
        department: input.department || null,
        email: input.email || null,
        secondary_email: input.secondaryEmail || null,
        phone: input.phone || null,
        mobile: input.mobile || null,
        preferred_channel: input.preferredChannel || null,
        language: input.language || 'fr-BE',
        decision_role: input.decisionRole || 'other',
        influence_level: input.influenceLevel || 'unknown',
        notes: input.notes || null,
        is_primary: isPrimary || false,
        is_active: true,
        do_not_contact: input.doNotContact || false,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Modifie un contact.
   */
  static async updateContact(
    supabase: SupabaseClient,
    orgId: string,
    contactId: string,
    input: Partial<ContactInput> & { isActive?: boolean }
  ) {
    // Si on modifie le prénom ou le nom, on valide qu'au moins un des deux reste présent
    if (input.firstName !== undefined || input.lastName !== undefined) {
      // Récupère l'état actuel pour fusionner et valider
      const { data: current, error: fetchError } = await supabase
        .from('contacts')
        .select('first_name, last_name')
        .eq('organization_id', orgId)
        .eq('id', contactId)
        .single();
      if (fetchError || !current) {
        throw new Error('Contact introuvable.');
      }
      const testInput = {
        firstName: input.firstName !== undefined ? input.firstName : current.first_name,
        lastName: input.lastName !== undefined ? input.lastName : current.last_name,
      };
      this.validateContact(testInput);
    }

    // Récupère le customer_id du contact actuel
    const { data: current, error: fetchError } = await supabase
      .from('contacts')
      .select('customer_id, is_primary, is_active')
      .eq('organization_id', orgId)
      .eq('id', contactId)
      .single();

    if (fetchError || !current) {
      throw new Error('Contact introuvable ou accès non autorisé.');
    }

    const customerId = current.customer_id;
    let isPrimary = input.isPrimary;

    // Si le contact passe à principal, on désactive les autres
    if (isPrimary && !current.is_primary) {
      const { error: unsetError } = await supabase
        .from('contacts')
        .update({ is_primary: false })
        .eq('organization_id', orgId)
        .eq('customer_id', customerId);
      if (unsetError) throw unsetError;
    }

    // Si on désactive le contact principal, on checke le statut principal
    if (input.isActive === false && current.is_primary) {
      isPrimary = false;
    }

    const updateData: any = {};
    if (input.locationId !== undefined) updateData.location_id = input.locationId;
    if (input.firstName !== undefined) updateData.first_name = input.firstName;
    if (input.lastName !== undefined) updateData.last_name = input.lastName;
    if (input.jobTitle !== undefined) updateData.job_title = input.jobTitle;
    if (input.department !== undefined) updateData.department = input.department;
    if (input.email !== undefined) updateData.email = input.email;
    if (input.secondaryEmail !== undefined) updateData.secondary_email = input.secondaryEmail;
    if (input.phone !== undefined) updateData.phone = input.phone;
    if (input.mobile !== undefined) updateData.mobile = input.mobile;
    if (input.preferredChannel !== undefined) updateData.preferred_channel = input.preferredChannel;
    if (input.language !== undefined) updateData.language = input.language;
    if (input.decisionRole !== undefined) updateData.decision_role = input.decisionRole;
    if (input.influenceLevel !== undefined) updateData.influence_level = input.influenceLevel;
    if (input.notes !== undefined) updateData.notes = input.notes;
    if (isPrimary !== undefined) updateData.is_primary = isPrimary;
    if (input.isActive !== undefined) updateData.is_active = input.isActive;
    if (input.doNotContact !== undefined) updateData.do_not_contact = input.doNotContact;

    const { data, error } = await supabase
      .from('contacts')
      .update(updateData)
      .eq('organization_id', orgId)
      .eq('id', contactId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Définit un contact comme principal
   */
  static async setPrimaryContact(supabase: SupabaseClient, orgId: string, contactId: string) {
    const { data: contact, error: fetchError } = await supabase
      .from('contacts')
      .select('customer_id')
      .eq('organization_id', orgId)
      .eq('id', contactId)
      .single();

    if (fetchError || !contact) {
      throw new Error('Contact introuvable ou accès non autorisé.');
    }

    // Désactive les autres contacts principaux
    const { error: unsetError } = await supabase
      .from('contacts')
      .update({ is_primary: false })
      .eq('organization_id', orgId)
      .eq('customer_id', contact.customer_id);
    if (unsetError) throw unsetError;

    // Active celui-ci
    const { data, error } = await supabase
      .from('contacts')
      .update({ is_primary: true, is_active: true })
      .eq('organization_id', orgId)
      .eq('id', contactId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Archive un contact. Conserve le contact dans les offres historiques (via snapshots), mais l'exclut des sélecteurs.
   */
  static async archiveContact(supabase: SupabaseClient, orgId: string, contactId: string) {
    // Vérifier s'il est lié à des offres
    const { count, error: checkError } = await supabase
      .from('quotes')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('contact_id', contactId);

    if (checkError) throw checkError;

    if (count && count > 0) {
      // Liaison existante, archivage logique obligatoire pour ne pas casser le lien de table quotes
      const { error } = await supabase
        .from('contacts')
        .update({ is_active: false, is_primary: false })
        .eq('organization_id', orgId)
        .eq('id', contactId);
      if (error) throw error;
    } else {
      // Suppression physique autorisée
      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('organization_id', orgId)
        .eq('id', contactId);
      if (error) throw error;
    }
  }
}
