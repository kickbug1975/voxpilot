'use server';

import { createClient } from '@/lib/supabase/server';
import { LocationService, LocationInput } from '@/domain/crm/LocationService';
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

export async function getLocations(orgSlug: string, customerId: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: locations, error } = await supabase
      .from('customer_locations')
      .select('*')
      .eq('organization_id', orgId)
      .eq('customer_id', customerId)
      .order('is_primary', { ascending: false })
      .order('name');

    if (error) throw error;
    return { data: locations || [] };
  } catch (err) {
    console.error('Error fetching locations:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de charger les établissements.' };
  }
}

export async function createLocation(orgSlug: string, customerId: string, formData: FormData) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: userData } = await supabase.auth.getUser();
    const actorUserId = userData?.user?.id;
    if (!actorUserId) throw new Error('Utilisateur non connecté.');

    const name = formData.get('name') as string;
    const locationType = formData.get('locationType') as string || 'other';
    const line1 = formData.get('line1') as string;
    const line2 = formData.get('line2') as string;
    const postalCode = formData.get('postalCode') as string;
    const city = formData.get('city') as string;
    const region = formData.get('region') as string;
    const countryCode = formData.get('countryCode') as string || 'BE';
    const phone = formData.get('phone') as string;
    const email = formData.get('email') as string;
    const deliveryNotes = formData.get('deliveryNotes') as string;
    const isPrimary = formData.get('isPrimary') === 'true';

    const input: LocationInput = {
      organizationId: orgId,
      customerId,
      name,
      locationType,
      address: {
        line1,
        line2: line2 || undefined,
        postalCode,
        city,
        region: region || undefined,
        countryCode,
      },
      phone: phone || null,
      email: email || null,
      deliveryNotes: deliveryNotes || null,
      isPrimary,
    };

    const location = await LocationService.createLocation(supabase, input);

    // Revalidate paths
    revalidatePath(`/${orgSlug}/customers/${customerId}`);
    return { success: true, data: location };
  } catch (err) {
    console.error('Error creating location:', err);
    return { error: err instanceof Error ? err.message : "Impossible de créer l'établissement." };
  }
}

export async function updateLocation(orgSlug: string, customerId: string, locationId: string, formData: FormData) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const name = formData.get('name') as string;
    const locationType = formData.get('locationType') as string;
    const line1 = formData.get('line1') as string;
    const line2 = formData.get('line2') as string;
    const postalCode = formData.get('postalCode') as string;
    const city = formData.get('city') as string;
    const region = formData.get('region') as string;
    const countryCode = formData.get('countryCode') as string;
    const phone = formData.get('phone') as string;
    const email = formData.get('email') as string;
    const deliveryNotes = formData.get('deliveryNotes') as string;
    const isPrimary = formData.get('isPrimary') === 'true';
    const isActive = formData.get('isActive') !== 'false'; // default true

    const address = (line1 || postalCode || city) ? {
      line1,
      line2: line2 || undefined,
      postalCode,
      city,
      region: region || undefined,
      countryCode: countryCode || 'BE',
    } : undefined;

    const input: Partial<LocationInput> & { isActive?: boolean } = {
      name,
      locationType,
      address,
      phone: phone !== undefined ? (phone || null) : undefined,
      email: email !== undefined ? (email || null) : undefined,
      deliveryNotes: deliveryNotes !== undefined ? (deliveryNotes || null) : undefined,
      isPrimary,
      isActive,
    };

    const location = await LocationService.updateLocation(supabase, orgId, locationId, input);

    revalidatePath(`/${orgSlug}/customers/${customerId}`);
    return { success: true, data: location };
  } catch (err) {
    console.error('Error updating location:', err);
    return { error: err instanceof Error ? err.message : "Impossible de modifier l'établissement." };
  }
}

export async function setPrimaryLocation(orgSlug: string, customerId: string, locationId: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const location = await LocationService.setPrimaryLocation(supabase, orgId, locationId);

    revalidatePath(`/${orgSlug}/customers/${customerId}`);
    return { success: true, data: location };
  } catch (err) {
    console.error('Error setting primary location:', err);
    return { error: err instanceof Error ? err.message : "Impossible de définir l'établissement principal." };
  }
}

export async function archiveLocation(orgSlug: string, customerId: string, locationId: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    await LocationService.archiveLocation(supabase, orgId, locationId);

    revalidatePath(`/${orgSlug}/customers/${customerId}`);
    return { success: true };
  } catch (err) {
    console.error('Error archiving location:', err);
    return { error: err instanceof Error ? err.message : "Impossible de supprimer/archiver l'établissement." };
  }
}
