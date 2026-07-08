'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

const CRM_TABLES = [
  'activities',
  'tasks',
  'contacts',
  'customer_locations',
  'customer_tags',
  'crm_events',
  'quotes',
  'margin_rules',
  'product_sales_prices'
];

/**
 * Fusionne manuellement le client source (doublon à supprimer) vers le client cible (à conserver).
 * Ré-associe en cascade toutes les tables d'activités, tâches, contacts, etc.
 */
export async function mergeCustomersAction(
  orgSlug: string,
  sourceCustomerId: string,
  targetCustomerId: string
) {
  try {
    const supabase = await createClient();

    // 1. Récupérer les noms des clients pour les transferts textuels
    const { data: sourceCust, error: srcErr } = await supabase
      .from('customers')
      .select('legal_name')
      .eq('id', sourceCustomerId)
      .single();

    const { data: targetCust, error: tgtErr } = await supabase
      .from('customers')
      .select('legal_name, trade_name')
      .eq('id', targetCustomerId)
      .single();

    if (srcErr || !sourceCust || tgtErr || !targetCust) {
      return { success: false, error: 'Impossible de récupérer les fiches clients pour la fusion.' };
    }

    // 2. Mettre à jour le trade_name du client cible s'il est vide
    if (!targetCust.trade_name) {
      await supabase
        .from('customers')
        .update({ trade_name: sourceCust.legal_name })
        .eq('id', targetCustomerId);
    }

    // 3. Ré-associer les commandes textuelles (client_name) et d'ID (customer_id)
    await supabase
      .from('orders')
      .update({ client_name: targetCust.legal_name })
      .eq('client_name', sourceCust.legal_name);

    try {
      await supabase
        .from('orders')
        .update({ customer_id: targetCustomerId })
        .eq('customer_id', sourceCustomerId);
    } catch {}

    // 4. Ré-associer l'intégralité des tables liées en base de données
    for (const tableName of CRM_TABLES) {
      try {
        await supabase
          .from(tableName)
          .update({ customer_id: targetCustomerId })
          .eq('customer_id', sourceCustomerId);
      } catch (err: any) {
        console.warn(`[Merge Action] Avertissement lors de la ré-association sur "${tableName}" :`, err.message);
      }
    }

    // 5. Supprimer définitivement la fiche doublon source
    const { error: delErr } = await supabase
      .from('customers')
      .delete()
      .eq('id', sourceCustomerId);

    if (delErr) {
      return { success: false, error: `Impossible de supprimer le prospect doublon après transfert : ${delErr.message}` };
    }

    // Révalider les caches Next.js
    revalidatePath(`/${orgSlug}/customers`);
    revalidatePath(`/${orgSlug}/customers/${targetCustomerId}`);
    revalidatePath(`/${orgSlug}/customers/${sourceCustomerId}`);

    return { success: true };
  } catch (err: any) {
    console.error('[Merge Action] Erreur lors de la fusion :', err.message);
    return { success: false, error: err.message || 'Une erreur inattendue est survenue.' };
  }
}
