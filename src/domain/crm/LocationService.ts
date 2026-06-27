import { SupabaseClient } from '@supabase/supabase-js';

export interface LocationAddress {
  line1: string;
  line2?: string;
  postalCode: string;
  city: string;
  region?: string;
  countryCode: string;
}

export interface LocationInput {
  organizationId: string;
  customerId: string;
  name: string;
  locationType: string;
  address: LocationAddress;
  phone?: string | null;
  email?: string | null;
  deliveryNotes?: string | null;
  openingHours?: any;
  preferredVisitDays?: number[];
  latitude?: number | null;
  longitude?: number | null;
  isPrimary?: boolean;
}

export class LocationService {
  /**
   * Valide l'adresse d'un établissement
   */
  static validateAddress(address: LocationAddress) {
    if (!address || !address.line1 || !address.postalCode || !address.city || !address.countryCode) {
      throw new Error("L'adresse de l'établissement est incomplète.");
    }
  }

  /**
   * Crée un établissement. Gère automatiquement la désignation de l'adresse principale.
   */
  static async createLocation(supabase: SupabaseClient, input: LocationInput) {
    this.validateAddress(input.address);

    // Vérifie si c'est le premier établissement actif du client
    const { count, error: countError } = await supabase
      .from('customer_locations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', input.organizationId)
      .eq('customer_id', input.customerId)
      .eq('is_active', true);

    if (countError) throw countError;

    // Si premier établissement, il devient principal automatiquement
    let isPrimary = input.isPrimary;
    if (count === 0) {
      isPrimary = true;
    }

    // Si on veut forcer cet établissement comme principal, on désactive le statut principal des autres
    if (isPrimary) {
      const { error: unsetError } = await supabase
        .from('customer_locations')
        .update({ is_primary: false })
        .eq('organization_id', input.organizationId)
        .eq('customer_id', input.customerId);
      if (unsetError) throw unsetError;
    }

    const { data, error } = await supabase
      .from('customer_locations')
      .insert({
        organization_id: input.organizationId,
        customer_id: input.customerId,
        name: input.name,
        location_type: input.locationType,
        address: input.address,
        phone: input.phone || null,
        email: input.email || null,
        delivery_notes: input.deliveryNotes || null,
        opening_hours: input.openingHours || {},
        preferred_visit_days: input.preferredVisitDays || [],
        latitude: input.latitude || null,
        longitude: input.longitude || null,
        is_primary: isPrimary || false,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Modifie un établissement.
   */
  static async updateLocation(
    supabase: SupabaseClient,
    orgId: string,
    locationId: string,
    input: Partial<LocationInput> & { isActive?: boolean }
  ) {
    if (input.address) {
      this.validateAddress(input.address);
    }

    // Récupère l'établissement actuel pour connaître le customer_id
    const { data: current, error: fetchError } = await supabase
      .from('customer_locations')
      .select('customer_id, is_primary, is_active')
      .eq('organization_id', orgId)
      .eq('id', locationId)
      .single();

    if (fetchError || !current) {
      throw new Error('Établissement introuvable ou accès non autorisé.');
    }

    const customerId = current.customer_id;
    let isPrimary = input.isPrimary;

    // Si l'établissement passe à principal, on désactive les autres
    if (isPrimary && !current.is_primary) {
      const { error: unsetError } = await supabase
        .from('customer_locations')
        .update({ is_primary: false })
        .eq('organization_id', orgId)
        .eq('customer_id', customerId);
      if (unsetError) throw unsetError;
    }

    // Si on désactive l'établissement principal, on lance un avertissement ou on checke s'il y a un remplaçant
    if (input.isActive === false && current.is_primary) {
      // Oblige à sélectionner un autre ou laisse l'avertissement
      isPrimary = false;
    }

    const updateData: any = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.locationType !== undefined) updateData.location_type = input.locationType;
    if (input.address !== undefined) updateData.address = input.address;
    if (input.phone !== undefined) updateData.phone = input.phone;
    if (input.email !== undefined) updateData.email = input.email;
    if (input.deliveryNotes !== undefined) updateData.delivery_notes = input.deliveryNotes;
    if (input.openingHours !== undefined) updateData.opening_hours = input.openingHours;
    if (input.preferredVisitDays !== undefined) updateData.preferred_visit_days = input.preferredVisitDays;
    if (input.latitude !== undefined) updateData.latitude = input.latitude;
    if (input.longitude !== undefined) updateData.longitude = input.longitude;
    if (isPrimary !== undefined) updateData.is_primary = isPrimary;
    if (input.isActive !== undefined) updateData.is_active = input.isActive;

    const { data, error } = await supabase
      .from('customer_locations')
      .update(updateData)
      .eq('organization_id', orgId)
      .eq('id', locationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Définit un établissement comme principal
   */
  static async setPrimaryLocation(supabase: SupabaseClient, orgId: string, locationId: string) {
    const { data: loc, error: fetchError } = await supabase
      .from('customer_locations')
      .select('customer_id')
      .eq('organization_id', orgId)
      .eq('id', locationId)
      .single();

    if (fetchError || !loc) {
      throw new Error('Établissement introuvable ou accès non autorisé.');
    }

    // Désactive les autres établissements principaux
    const { error: unsetError } = await supabase
      .from('customer_locations')
      .update({ is_primary: false })
      .eq('organization_id', orgId)
      .eq('customer_id', loc.customer_id);
    if (unsetError) throw unsetError;

    // Active celui-ci
    const { data, error } = await supabase
      .from('customer_locations')
      .update({ is_primary: true, is_active: true })
      .eq('organization_id', orgId)
      .eq('id', locationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Archive un établissement. Un établissement lié à une offre envoyée ne peut pas être supprimé physiquement.
   */
  static async archiveLocation(supabase: SupabaseClient, orgId: string, locationId: string) {
    // Vérifier s'il est lié à des offres
    const { count, error: checkError } = await supabase
      .from('quotes')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('location_id', locationId);

    if (checkError) throw checkError;

    if (count && count > 0) {
      // Liaison existante, archivage logique obligatoire
      const { error } = await supabase
        .from('customer_locations')
        .update({ is_active: false, is_primary: false })
        .eq('organization_id', orgId)
        .eq('id', locationId);
      if (error) throw error;
    } else {
      // Suppression physique autorisée
      const { error } = await supabase
        .from('customer_locations')
        .delete()
        .eq('organization_id', orgId)
        .eq('id', locationId);
      if (error) throw error;
    }
  }
}
