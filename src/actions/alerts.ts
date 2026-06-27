'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { SupabaseClient } from '@supabase/supabase-js';

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

export interface AlertsFilters {
  priority?: string;
  status?: string;
  type?: string;
  page?: number;
  limit?: number;
}

/**
 * Récupère les alertes filtrées et paginées de l'organisation
 */
export async function getAlerts(orgSlug: string, filters: AlertsFilters = {}) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('alerts')
      .select('*', { count: 'exact' })
      .eq('organization_id', orgId);

    // Filter by priority
    if (filters.priority && filters.priority !== 'all') {
      query = query.eq('priority', filters.priority);
    }

    // Filter by status (default to unread if not specified, or support 'all')
    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    } else if (!filters.status) {
      // By default show unread and read, but exclude resolved/ignored unless requested
      query = query.in('status', ['unread', 'read']);
    }

    // Filter by type
    if (filters.type && filters.type !== 'all') {
      query = query.eq('type', filters.type);
    }

    // Order and range
    const { data: alerts, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return {
      data: alerts || [],
      count: count || 0,
      page,
      limit,
      totalPages: count ? Math.ceil(count / limit) : 0
    };
  } catch (err) {
    console.error('Error fetching alerts:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de récupérer les alertes.' };
  }
}

/**
 * Met à jour le statut d'une alerte spécifique
 */
export async function updateAlertStatus(
  orgSlug: string,
  alertId: string,
  status: 'unread' | 'read' | 'resolved' | 'ignored'
) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const updatePayload: Record<string, any> = { status };
    if (status === 'read') {
      updatePayload.read_at = new Date().toISOString();
    } else if (status === 'resolved') {
      updatePayload.resolved_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('alerts')
      .update(updatePayload)
      .eq('organization_id', orgId)
      .eq('id', alertId);

    if (error) throw error;

    revalidatePath(`/${orgSlug}/alerts`);
    revalidatePath(`/${orgSlug}`);
    return { success: true };
  } catch (err) {
    console.error('Error updating alert status:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de modifier le statut de l\'alerte.' };
  }
}

/**
 * Met à jour les statuts de plusieurs alertes en une seule opération
 */
export async function bulkUpdateAlertStatus(
  orgSlug: string,
  alertIds: string[],
  status: 'read' | 'resolved'
) {
  try {
    if (!alertIds || alertIds.length === 0) {
      return { success: true };
    }

    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const updatePayload: Record<string, any> = { status };
    const now = new Date().toISOString();
    if (status === 'read') {
      updatePayload.read_at = now;
    } else if (status === 'resolved') {
      updatePayload.resolved_at = now;
    }

    const { error } = await supabase
      .from('alerts')
      .update(updatePayload)
      .eq('organization_id', orgId)
      .in('id', alertIds);

    if (error) throw error;

    revalidatePath(`/${orgSlug}/alerts`);
    revalidatePath(`/${orgSlug}`);
    return { success: true };
  } catch (err) {
    console.error('Error bulk updating alert statuses:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de modifier les statuts des alertes.' };
  }
}
