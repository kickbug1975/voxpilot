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

/**
 * Récupère toutes les commandes de l'organisation avec leurs lignes d'articles
 */
export async function getOrders(orgSlug: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: orders, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data: orders };
  } catch (err) {
    console.error('Error fetching orders:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de charger les commandes.' };
  }
}

/**
 * Met à jour le statut d'une commande
 */
export async function updateOrderStatus(orgSlug: string, orderId: string, status: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { data: order, error } = await supabase
      .from('orders')
      .update({ 
        status, 
        updated_at: new Date().toISOString() 
      })
      .eq('organization_id', orgId)
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw error;

    revalidatePath(`/${orgSlug}/orders`);
    return { success: true, data: order };
  } catch (err) {
    console.error('Error updating order status:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de modifier le statut de la commande.' };
  }
}

/**
 * Supprime une commande
 */
export async function deleteOrder(orgSlug: string, orderId: string) {
  try {
    const supabase = await createClient();
    const orgId = await getOrgId(supabase, orgSlug);

    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('organization_id', orgId)
      .eq('id', orderId);

    if (error) throw error;

    revalidatePath(`/${orgSlug}/orders`);
    return { success: true };
  } catch (err) {
    console.error('Error deleting order:', err);
    return { error: err instanceof Error ? err.message : 'Impossible de supprimer la commande.' };
  }
}
