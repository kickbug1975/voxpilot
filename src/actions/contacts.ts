'use server';

import { createClient } from '@/lib/supabase/server';
import { ContactService, ContactInput } from '@/domain/crm/ContactService';
import { revalidatePath } from 'next/cache';

// Helper to get organization ID and verify membership
async function getOrgId(supabase: any, orgSlug: string): Promise<string> {
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

export async function getContacts(orgSlug: string, customerId: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('organization_id', orgId)
      .eq('customer_id', customerId)
      .order('is_primary', { ascending: false })
      .order('last_name');

    if (error) throw error;
    return { data: contacts || [] };
  } catch (err) {
    console.error('Error fetching contacts:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de charger les contacts.' };
  }
}

export async function createContact(orgSlug: string, customerId: string, formData: FormData) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: userData } = await supabase.auth.getUser();
    const actorUserId = userData?.user?.id;
    if (!actorUserId) throw new Error('Utilisateur non connecté.');

    const firstName = formData.get('firstName') as string;
    const lastName = formData.get('lastName') as string;
    const locationId = formData.get('locationId') as string;
    const jobTitle = formData.get('jobTitle') as string;
    const department = formData.get('department') as string;
    const email = formData.get('email') as string;
    const secondaryEmail = formData.get('secondaryEmail') as string;
    const phone = formData.get('phone') as string;
    const mobile = formData.get('mobile') as string;
    const preferredChannel = formData.get('preferredChannel') as string;
    const language = formData.get('language') as string || 'fr-BE';
    const decisionRole = formData.get('decisionRole') as string || 'other';
    const influenceLevel = formData.get('influenceLevel') as string || 'unknown';
    const notes = formData.get('notes') as string;
    const isPrimary = formData.get('isPrimary') === 'true';
    const doNotContact = formData.get('doNotContact') === 'true';

    const input: ContactInput = {
      organizationId: orgId,
      customerId,
      locationId: locationId || null,
      firstName: firstName || null,
      lastName: lastName || null,
      jobTitle: jobTitle || null,
      department: department || null,
      email: email || null,
      secondaryEmail: secondaryEmail || null,
      phone: phone || null,
      mobile: mobile || null,
      preferredChannel: preferredChannel || null,
      language,
      decisionRole,
      influenceLevel,
      notes: notes || null,
      isPrimary,
      doNotContact,
    };

    const contact = await ContactService.createContact(supabase, input);

    revalidatePath(`/${orgSlug}/customers/${customerId}`);
    return { success: true, data: contact };
  } catch (err) {
    console.error('Error creating contact:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de créer le contact.' };
  }
}

export async function updateContact(orgSlug: string, customerId: string, contactId: string, formData: FormData) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const input: Partial<ContactInput> & { isActive?: boolean } = {};
    if (formData.has('firstName')) input.firstName = formData.get('firstName') as string || null;
    if (formData.has('lastName')) input.lastName = formData.get('lastName') as string || null;
    if (formData.has('locationId')) input.locationId = formData.get('locationId') as string || null;
    if (formData.has('jobTitle')) input.jobTitle = formData.get('jobTitle') as string || null;
    if (formData.has('department')) input.department = formData.get('department') as string || null;
    if (formData.has('email')) input.email = formData.get('email') as string || null;
    if (formData.has('secondaryEmail')) input.secondaryEmail = formData.get('secondaryEmail') as string || null;
    if (formData.has('phone')) input.phone = formData.get('phone') as string || null;
    if (formData.has('mobile')) input.mobile = formData.get('mobile') as string || null;
    if (formData.has('preferredChannel')) input.preferredChannel = formData.get('preferredChannel') as string || null;
    if (formData.has('language')) input.language = formData.get('language') as string;
    if (formData.has('decisionRole')) input.decisionRole = formData.get('decisionRole') as string;
    if (formData.has('influenceLevel')) input.influenceLevel = formData.get('influenceLevel') as string;
    if (formData.has('notes')) input.notes = formData.get('notes') as string || null;

    const isPrimary = formData.has('isPrimary') ? formData.get('isPrimary') === 'true' : undefined;
    const isActive = formData.has('isActive') ? formData.get('isActive') !== 'false' : undefined;
    const doNotContact = formData.has('doNotContact') ? formData.get('doNotContact') === 'true' : undefined;

    if (isPrimary !== undefined) input.isPrimary = isPrimary;
    if (isActive !== undefined) input.isActive = isActive;
    if (doNotContact !== undefined) input.doNotContact = doNotContact;

    const { data: currentContact } = await supabase
      .from('contacts')
      .select('is_primary, first_name, last_name')
      .eq('organization_id', orgId)
      .eq('id', contactId)
      .single();

    const contact = await ContactService.updateContact(supabase, orgId, contactId, input);

    if (currentContact && currentContact.is_primary && isActive === false) {
      const { data: userData } = await supabase.auth.getUser();
      const actorUserId = userData?.user?.id;
      
      await supabase
        .from('audit_logs')
        .insert({
          organization_id: orgId,
          actor_user_id: actorUserId || null,
          action: 'contact_deactivated',
          entity_type: 'contact',
          entity_id: contactId,
          metadata: {
            contact_name: `${currentContact.first_name || ''} ${currentContact.last_name || ''}`.trim(),
            is_primary: true
          }
        });
    }

    revalidatePath(`/${orgSlug}/customers/${customerId}`);
    return { success: true, data: contact };
  } catch (err) {
    console.error('Error updating contact:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de modifier le contact.' };
  }
}

export async function setPrimaryContact(orgSlug: string, customerId: string, contactId: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const contact = await ContactService.setPrimaryContact(supabase, orgId, contactId);

    revalidatePath(`/${orgSlug}/customers/${customerId}`);
    return { success: true, data: contact };
  } catch (err) {
    console.error('Error setting primary contact:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de définir le contact principal.' };
  }
}

export async function archiveContact(orgSlug: string, customerId: string, contactId: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: currentContact } = await supabase
      .from('contacts')
      .select('is_primary, first_name, last_name')
      .eq('organization_id', orgId)
      .eq('id', contactId)
      .single();

    await ContactService.archiveContact(supabase, orgId, contactId);

    if (currentContact && currentContact.is_primary) {
      const { data: userData } = await supabase.auth.getUser();
      const actorUserId = userData?.user?.id;
      
      await supabase
        .from('audit_logs')
        .insert({
          organization_id: orgId,
          actor_user_id: actorUserId || null,
          action: 'contact_archived',
          entity_type: 'contact',
          entity_id: contactId,
          metadata: {
            contact_name: `${currentContact.first_name || ''} ${currentContact.last_name || ''}`.trim(),
            is_primary: true
          }
        });
    }

    revalidatePath(`/${orgSlug}/customers/${customerId}`);
    return { success: true };
  } catch (err) {
    console.error('Error archiving contact:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de supprimer/archiver le contact.' };
  }
}
