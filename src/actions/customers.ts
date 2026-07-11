'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { SupabaseClient } from '@supabase/supabase-js';
import { CustomerCrmService } from '@/domain/crm/CustomerCrmService';
import { LocationService } from '@/domain/crm/LocationService';
import { ContactService } from '@/domain/crm/ContactService';

// Helper to get organization ID and verify membership
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

export interface CustomerFilters {
  q?: string;
  lifecycle?: string;
  owner?: string;
  potential?: string;
  segment?: string;
  tag?: string;
  inactiveDays?: number;
  hasOverdueTask?: boolean;
  hasOpenQuote?: boolean;
}

export async function getCustomers(orgSlug: string, filters: CustomerFilters = {}) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    let query = supabase
      .from('customers')
      .select('id, code, legal_name, trade_name, segment, primary_email, phone, payment_terms, is_active, lifecycle_status, potential_level, owner_user_id, last_activity_at, next_activity_at')
      .eq('organization_id', orgId);

    // Apply simple filters
    if (filters.lifecycle) {
      query = query.eq('lifecycle_status', filters.lifecycle);
    }
    if (filters.owner) {
      query = query.eq('owner_user_id', filters.owner);
    }
    if (filters.potential) {
      query = query.eq('potential_level', filters.potential);
    }
    if (filters.segment) {
      query = query.eq('segment', filters.segment);
    }

    // Filter by text search
    if (filters.q) {
      const qClean = filters.q.trim();
      query = query.or(`legal_name.ilike.%${qClean}%,code.ilike.%${qClean}%`);
    }

    // Filter by inactivity
    if (filters.inactiveDays) {
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - filters.inactiveDays);
      query = query.or(`last_activity_at.lt.${thresholdDate.toISOString()},last_activity_at.is.null`);
    }

    // Filter by tag
    if (filters.tag) {
      const { data: tagLinks } = await supabase
        .from('customer_tags')
        .select('customer_id')
        .eq('organization_id', orgId)
        .eq('tag_id', filters.tag);
      const custIds = (tagLinks || []).map(link => link.customer_id);
      if (custIds.length > 0) {
        query = query.in('id', custIds);
      } else {
        return { data: [] }; // No matching tags
      }
    }

    // Filter by overdue task
    if (filters.hasOverdueTask) {
      const nowStr = new Date().toISOString();
      const { data: overdueTasks } = await supabase
        .from('tasks')
        .select('customer_id')
        .eq('organization_id', orgId)
        .in('status', ['open', 'in_progress'])
        .lt('due_at', nowStr);
      const custIds = (overdueTasks || []).map(t => t.customer_id).filter((id): id is string => id !== null);
      if (custIds.length > 0) {
        query = query.in('id', custIds);
      } else {
        return { data: [] };
      }
    }

    // Filter by open quote
    if (filters.hasOpenQuote) {
      const { data: openQuotes } = await supabase
        .from('quotes')
        .select('customer_id')
        .eq('organization_id', orgId)
        .in('status', ['draft', 'sent', 'viewed']);
      const custIds = (openQuotes || []).map(q => q.customer_id);
      if (custIds.length > 0) {
        query = query.in('id', custIds);
      } else {
        return { data: [] };
      }
    }

    const { data: customers, error } = await query.order('legal_name');

    if (error) throw error;

    const formattedCustomers = (customers || []).map(c => ({
      id: c.id,
      name: c.legal_name,
      trade_name: c.trade_name,
      code: c.code,
      segment: c.segment,
      email: c.primary_email,
      phone: c.phone,
      payment_terms: c.payment_terms,
      is_active: c.is_active,
      lifecycle_status: c.lifecycle_status,
      potential_level: c.potential_level,
      owner_user_id: c.owner_user_id,
      last_activity_at: c.last_activity_at,
      next_activity_at: c.next_activity_at,
    }));

    return { data: formattedCustomers };
  } catch (err) {
    console.error('Error fetching customers:', err);
    const message = err instanceof Error ? err.message : 'Impossible de charger les clients.';
    return { error: message };
  }
}

export async function getCustomerById(orgSlug: string, id: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const [customerResult, rulesResult, quotesResult, contactsResult, locationsResult] = await Promise.all([
      supabase
        .from('customers')
        .select('id, code, legal_name, trade_name, segment, primary_email, phone, payment_terms, public_notes, internal_notes, is_active, lifecycle_status, potential_level, owner_user_id, last_activity_at, next_activity_at, created_at')
        .eq('organization_id', orgId)
        .eq('id', id)
        .single(),
      supabase
        .from('margin_rules')
        .select('id, scope, target_margin_rate, product_id, priority')
        .eq('organization_id', orgId)
        .eq('customer_id', id),
      supabase
        .from('quotes')
        .select('id, quote_number, status, grand_total, created_at, revision, contact_name, contact_email')
        .eq('organization_id', orgId)
        .eq('customer_id', id),
      supabase
        .from('contacts')
        .select('*')
        .eq('organization_id', orgId)
        .eq('customer_id', id),
      supabase
        .from('customer_locations')
        .select('*')
        .eq('organization_id', orgId)
        .eq('customer_id', id)
    ]);

    if (customerResult.error) throw customerResult.error;

    const customer = customerResult.data;
    const rawRules = rulesResult.data;
    const rawQuotes = quotesResult.data;
    const rawContacts = contactsResult.data;
    const rawLocations = locationsResult.data;

    const marginRules = (rawRules || []).map(r => ({
      id: r.id,
      rule_type: r.scope,
      margin_rate: String(r.target_margin_rate),
      product_id: r.product_id,
      priority: r.priority,
    }));

    const quotes = (rawQuotes || []).map(q => ({
      id: q.id,
      quote_number: q.quote_number,
      status: q.status,
      total_amount: q.grand_total !== null ? String(q.grand_total) : null,
      created_at: q.created_at,
      revision: q.revision,
      contact_name: q.contact_name,
      contact_email: q.contact_email,
    }));

    const formatted = {
      id: customer.id,
      name: customer.legal_name,
      trade_name: customer.trade_name,
      code: customer.code,
      segment: customer.segment,
      email: customer.primary_email,
      phone: customer.phone,
      payment_terms: customer.payment_terms,
      notes: customer.public_notes,
      internal_notes: customer.internal_notes,
      is_active: customer.is_active,
      lifecycle_status: customer.lifecycle_status,
      potential_level: customer.potential_level,
      owner_user_id: customer.owner_user_id,
      last_activity_at: customer.last_activity_at,
      next_activity_at: customer.next_activity_at,
      created_at: customer.created_at,
      marginRules,
      quotes,
      contacts: rawContacts || [],
      locations: rawLocations || [],
    };

    return { data: formatted };
  } catch (err) {
    console.error('Error fetching customer details:', err);
    const message = err instanceof Error ? err.message : 'Impossible de charger les détails du client.';
    return { error: message };
  }
}

const customerFormSchema = z.object({
  name: z.string().trim().optional(),
  tradeName: z.string().trim().optional(),
  code: z.string().trim().max(50, "Le code client ne doit pas dépasser 50 caractères").optional(),
  vatNumber: z.string().trim().max(30, "Le numéro de TVA ne doit pas dépasser 30 caractères").optional(),
  segment: z.string().trim().optional().default('retail'),
  email: z.union([z.string().email("L'adresse e-mail est invalide"), z.literal("")]).optional(),
  phone: z.string().trim().max(30).optional(),
  paymentTerms: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  internalNotes: z.string().trim().optional(),
  lifecycleStatus: z.enum(['prospect', 'qualified', 'customer', 'dormant', 'lost', 'blocked']).optional().default('prospect'),
  potentialLevel: z.enum(['unknown', 'low', 'medium', 'high', 'strategic']).optional().default('unknown'),
  ownerUserId: z.string().uuid().optional(),
  // Location
  line1: z.string().trim().optional(),
  line2: z.string().trim().optional(),
  postalCode: z.string().trim().optional(),
  city: z.string().trim().optional(),
  region: z.string().trim().optional(),
  countryCode: z.string().trim().max(2).optional().default('BE'),
  // Contact
  contactFirstName: z.string().trim().optional(),
  contactLastName: z.string().trim().optional(),
  contactEmail: z.union([z.string().email("L'e-mail du contact est invalide"), z.literal("")]).optional(),
  contactPhone: z.string().trim().optional(),
  contactMobile: z.string().trim().optional(),
  contactJobTitle: z.string().trim().optional(),
}).refine(data => data.name || data.tradeName, {
  message: "Le nom légal ou le nom commercial est requis.",
  path: ['name']
});

export async function createCustomer(orgSlug: string, formData: FormData) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: userData } = await supabase.auth.getUser();
    const actorUserId = userData?.user?.id;
    if (!actorUserId) throw new Error('Utilisateur non connecté.');

    // Extraction et validation avec Zod
    const rawData: Record<string, any> = {};
    formData.forEach((value, key) => {
      rawData[key] = value;
    });

    const parseResult = customerFormSchema.safeParse(rawData);
    if (!parseResult.success) {
      const errMsgs = parseResult.error.issues.map((e: z.ZodIssue) => e.message).join(', ');
      throw new Error(`Données de formulaire invalides : ${errMsgs}`);
    }

    const validated = parseResult.data;
    let name = validated.name;
    const tradeName = validated.tradeName;
    const code = validated.code;
    const vatNumber = validated.vatNumber;
    const segment = validated.segment;
    const email = validated.email || null;
    const phone = validated.phone || null;
    const paymentTerms = validated.paymentTerms || null;
    const notes = validated.notes || null;
    const internalNotes = validated.internalNotes || null;
    const lifecycleStatus = validated.lifecycleStatus;
    const potentialLevel = validated.potentialLevel;
    const ownerUserId = validated.ownerUserId ?? actorUserId;

    // Location fields
    const line1 = validated.line1;
    const line2 = validated.line2;
    const postalCode = validated.postalCode;
    const city = validated.city;
    const region = validated.region;
    const countryCode = validated.countryCode;

    // Contact fields
    const contactFirstName = validated.contactFirstName;
    const contactLastName = validated.contactLastName;
    const contactEmail = validated.contactEmail || null;
    const contactPhone = validated.contactPhone || null;
    const contactMobile = validated.contactMobile || null;
    const contactJobTitle = validated.contactJobTitle || null;

    if (!name && !tradeName) {
      throw new Error('Le nom légal ou le nom commercial de l\'entreprise est obligatoire.');
    }

    const legalName = name || tradeName || '';

    const data = await CustomerCrmService.createCustomer(supabase, {
      organizationId: orgId,
      legalName: legalName,
      tradeName: tradeName || undefined,
      code: code || undefined,
      vatNumber: vatNumber || undefined,
      segment: segment || undefined,
      primaryEmail: email,
      phone,
      paymentTerms,
      publicNotes: notes,
      internalNotes,
      lifecycleStatus,
      potentialLevel,
      ownerUserId,
    }, actorUserId);

    let locationId = null;
    if (line1 || city || postalCode) {
      if (!line1 || !city || !postalCode) {
        throw new Error('L\'adresse de l\'établissement est incomplète (rue, code postal et ville obligatoires).');
      }
      const loc = await LocationService.createLocation(supabase, {
        organizationId: orgId,
        customerId: data.id,
        name: 'Siège social / Principal',
        locationType: 'billing_and_delivery',
        address: {
          line1,
          line2: line2 || undefined,
          postalCode,
          city,
          region: region || undefined,
          countryCode,
        },
        isPrimary: true,
      });
      locationId = loc.id;
    }

    if (contactFirstName || contactLastName) {
      await ContactService.createContact(supabase, {
        organizationId: orgId,
        customerId: data.id,
        locationId,
        firstName: contactFirstName || null,
        lastName: contactLastName || null,
        email: contactEmail || null,
        phone: contactPhone || null,
        mobile: contactMobile || null,
        jobTitle: contactJobTitle || null,
        isPrimary: true,
      });
    }

    revalidatePath(`/${orgSlug}/customers`);
    return { success: true, data: { id: data.id, name: data.legal_name, code: data.code, segment: data.segment, email: data.primary_email, phone: data.phone, is_active: data.is_active } };
  } catch (err) {
    console.error('Error creating customer:', err);
    const message = err instanceof Error ? err.message : 'Impossible de créer le client.';
    return { error: message };
  }
}

export async function updateCustomer(orgSlug: string, id: string, formData: FormData) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: userData } = await supabase.auth.getUser();
    const actorUserId = userData?.user?.id;
    if (!actorUserId) throw new Error('Utilisateur non connecté.');

    let name = formData.get('name') as string;
    const tradeName = formData.get('tradeName') as string;
    const code = formData.get('code') as string;
    const vatNumber = formData.get('vatNumber') as string;
    const segment = formData.get('segment') as string || 'retail';
    const email = formData.get('email') as string;
    const phone = formData.get('phone') as string;
    const paymentTerms = formData.get('paymentTerms') as string;
    const notes = formData.get('notes') as string;
    const internalNotes = formData.get('internalNotes') as string;
    const isActive = formData.get('isActive') === 'true';
    const potentialLevel = formData.get('potentialLevel') as any;
    const lifecycleStatus = formData.get('lifecycleStatus') as any;
    const ownerUserId = formData.get('ownerUserId') as string;
    const lostReason = formData.get('lostReason') as string;

    if (!name && !tradeName) {
      throw new Error('Le nom légal ou le nom commercial de l\'entreprise est obligatoire.');
    }

    if (!name) {
      name = tradeName;
    }

    // Fetch current state to check if owner or status changed
    const { data: currentCustomer } = await supabase
      .from('customers')
      .select('lifecycle_status, owner_user_id')
      .eq('organization_id', orgId)
      .eq('id', id)
      .single();

    if (currentCustomer) {
      if (ownerUserId && ownerUserId !== currentCustomer.owner_user_id) {
        await CustomerCrmService.assignCustomer(supabase, orgId, id, ownerUserId, false, actorUserId);
      }
      if (lifecycleStatus && lifecycleStatus !== currentCustomer.lifecycle_status) {
        await CustomerCrmService.changeLifecycleStatus(supabase, orgId, id, lifecycleStatus, lostReason || null, actorUserId);
      }
    }

    const updateData: any = {
      legal_name: name,
      trade_name: tradeName || null,
      code: code || null,
      vat_number: vatNumber || null,
      segment,
      primary_email: email || null,
      phone: phone || null,
      payment_terms: paymentTerms || null,
      public_notes: notes || null,
      internal_notes: internalNotes || null,
      is_active: isActive,
    };

    if (potentialLevel) {
      updateData.potential_level = potentialLevel;
    }

    const { data, error } = await supabase
      .from('customers')
      .update(updateData)
      .eq('organization_id', orgId)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    revalidatePath(`/${orgSlug}/customers`);
    revalidatePath(`/${orgSlug}/customers/${id}`);
    return { success: true, data: { id: data.id, name: data.legal_name, code: data.code, segment: data.segment, email: data.primary_email, phone: data.phone, is_active: data.is_active } };
  } catch (err) {
    console.error('Error updating customer:', err);
    const message = err instanceof Error ? err.message : 'Impossible de modifier le client.';
    return { error: message };
  }
}

export async function changeCustomerLifecycle(orgSlug: string, id: string, status: any, reason: string | null) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: userData } = await supabase.auth.getUser();
    const actorUserId = userData?.user?.id;
    if (!actorUserId) throw new Error('Utilisateur non connecté.');

    const customer = await CustomerCrmService.changeLifecycleStatus(supabase, orgId, id, status, reason, actorUserId);

    revalidatePath(`/${orgSlug}/customers`);
    revalidatePath(`/${orgSlug}/customers/${id}`);
    return { success: true, data: customer };
  } catch (err) {
    console.error('Error changing customer lifecycle:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de modifier le cycle de vie.' };
  }
}

export async function assignCustomer(orgSlug: string, id: string, ownerUserId: string, reassignOpenTasks: boolean) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: userData } = await supabase.auth.getUser();
    const actorUserId = userData?.user?.id;
    if (!actorUserId) throw new Error('Utilisateur non connecté.');

    const customer = await CustomerCrmService.assignCustomer(supabase, orgId, id, ownerUserId, reassignOpenTasks, actorUserId);

    revalidatePath(`/${orgSlug}/customers`);
    revalidatePath(`/${orgSlug}/customers/${id}`);
    return { success: true, data: customer };
  } catch (err) {
    console.error('Error reassigning customer:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de réattribuer le client.' };
  }
}

export async function deleteCustomer(orgSlug: string, id: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: userData } = await supabase.auth.getUser();
    const actorUserId = userData?.user?.id;
    if (!actorUserId) throw new Error('Utilisateur non connecté.');

    // Check if customer is linked to quotes, tasks, or activities
    const [quotesCheck, tasksCheck, activitiesCheck] = await Promise.all([
      supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('customer_id', id),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('customer_id', id),
      supabase.from('activities').select('id', { count: 'exact', head: true }).eq('customer_id', id)
    ]);

    const hasQuotes = (quotesCheck.count || 0) > 0;
    const hasTasks = (tasksCheck.count || 0) > 0;
    const hasActivities = (activitiesCheck.count || 0) > 0;

    if (hasQuotes || hasTasks || hasActivities) {
      // Archive customer logically instead of deleting
      await CustomerCrmService.archiveCustomer(supabase, orgId, id, actorUserId);
      revalidatePath(`/${orgSlug}/customers`);
      return { success: true, archived: true };
    } else {
      // Physically delete
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('organization_id', orgId)
        .eq('id', id);

      if (error) throw error;

      revalidatePath(`/${orgSlug}/customers`);
      return { success: true, deleted: true };
    }
  } catch (err) {
    console.error('Error deleting customer:', err);
    const message = err instanceof Error ? err.message : 'Impossible de supprimer le client.';
    return { error: message };
  }
}

export async function reactivateCustomer(orgSlug: string, id: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: userData } = await supabase.auth.getUser();
    const actorUserId = userData?.user?.id;
    if (!actorUserId) throw new Error('Utilisateur non connecté.');

    await CustomerCrmService.reactivateCustomer(supabase, orgId, id, actorUserId);

    revalidatePath(`/${orgSlug}/customers`);
    revalidatePath(`/${orgSlug}/customers/${id}`);
    return { success: true };
  } catch (err) {
    console.error('Error reactivating customer:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de réactiver le client.' };
  }
}
