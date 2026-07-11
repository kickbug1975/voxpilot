'use server';

import { createClient } from '@/lib/supabase/server';
import { getPriceForCustomerProduct } from './portalPricing';
import { revalidatePath } from 'next/cache';

export async function submitPortalOrder(
  token: string,
  items: { productId: string; quantity: number }[],
  deliveryDateStr: string
) {
  try {
    const supabase = await createClient();

    // 1. Valider le token
    const { data: tokenData, error: tokenError } = await supabase
      .from('client_portal_tokens')
      .select('customer_id, organization_id, expires_at')
      .eq('token', token)
      .single();

    if (tokenError || !tokenData) {
      throw new Error('Lien d\'accès non valide ou expiré.');
    }

    if (new Date(tokenData.expires_at) < new Date()) {
      throw new Error('Lien d\'accès expiré.');
    }

    // 2. Charger les informations du client
    const { data: customer } = await supabase
      .from('customers')
      .select('id, name, trade_name')
      .eq('id', tokenData.customer_id)
      .single();

    if (!customer) {
      throw new Error('Client introuvable.');
    }

    // 3. Valider le jour de livraison (dimanche = 0, lundi = 1)
    const deliveryDate = new Date(deliveryDateStr);
    const dayOfWeek = deliveryDate.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 1) {
      throw new Error('Pas de livraison le dimanche et le lundi.');
    }

    // 4. Validation temporelle et cut-off de stock (14h30)
    const now = new Date();
    const reqDateStr = now.toLocaleDateString('en-US', { timeZone: 'Europe/Brussels' });
    const requestDateLocal = new Date(reqDateStr);
    
    const deliveryDateLocalStr = deliveryDate.toLocaleDateString('en-US', { timeZone: 'Europe/Brussels' });
    const deliveryDateLocal = new Date(deliveryDateLocalStr);

    const diffTime = deliveryDateLocal.getTime() - requestDateLocal.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const brusselsTimeStr = now.toLocaleTimeString('fr-FR', {
      timeZone: 'Europe/Brussels',
      hour12: false
    });
    const [hours, minutes] = brusselsTimeStr.split(':').map(Number);
    const isPostCutoff = (hours === 14 && minutes >= 30) || hours > 14;

    const matchedClientName = customer.trade_name || customer.name;

    // 5. Créer ou récupérer la commande pour ce jour-là
    const { data: order } = await supabase
      .from('orders')
      .select('id')
      .eq('organization_id', tokenData.organization_id)
      .eq('client_name', matchedClientName)
      .eq('delivery_date', deliveryDateStr)
      .eq('status', 'transmitted')
      .maybeSingle();

    let orderId = order?.id;

    if (!orderId) {
      const { data: newOrder, error: newOrderErr } = await supabase
        .from('orders')
        .insert({
          organization_id: tokenData.organization_id,
          client_name: matchedClientName,
          status: 'transmitted',
          source_channel: 'portal',
          delivery_date: deliveryDateStr
        })
        .select()
        .single();

      if (newOrderErr || !newOrder) {
        throw new Error(`Échec de création de la commande : ${newOrderErr?.message}`);
      }
      orderId = newOrder.id;
    }

    // 6. Insérer les articles avec leur tarification exacte
    const orderItemsPayload = await Promise.all(items.map(async (item) => {
      const { data: product } = await supabase
        .from('products')
        .select('name, is_available, in_stock_ghlin')
        .eq('id', item.productId)
        .single();

      if (!product) {
        throw new Error(`Produit introuvable.`);
      }

      // Si livraison pour demain et après le cut-off de 14h30
      if (diffDays <= 1 && isPostCutoff && !product.in_stock_ghlin) {
        throw new Error(`Le produit "${product.name}" n'est plus disponible en magasin pour demain.`);
      }

      const priceApplied = await getPriceForCustomerProduct(
        tokenData.customer_id,
        item.productId,
        tokenData.organization_id
      );

      return {
        order_id: orderId,
        product_name: product.name,
        quantity_kg: item.quantity,
        product_id: item.productId,
        price_applied: priceApplied
      };
    }));

    const { error: itemsErr } = await supabase
      .from('order_items')
      .insert(orderItemsPayload);

    if (itemsErr) {
      throw itemsErr;
    }

    // 7. Enregistrer l'activité
    await supabase
      .from('activities')
      .insert({
        organization_id: tokenData.organization_id,
        customer_id: tokenData.customer_id,
        activity_type: 'note',
        direction: 'inbound',
        subject: 'Commande Portail B2B',
        content: `Commande passée via le portail en libre-service.\nDate de livraison : ${deliveryDateStr}\nArticles : ${orderItemsPayload.map(i => `${i.quantity_kg}x ${i.product_name}`).join(', ')}`
      });

    // 8. Créer une alerte dans le CRM
    await supabase
      .from('alerts')
      .insert({
        organization_id: tokenData.organization_id,
        title: `🛒 Nouvelle commande portail B2B`,
        message: `Le client ${matchedClientName} a commandé ${items.length} articles pour le ${deliveryDateStr}.`,
        status: 'unread',
        type: 'info'
      });

    revalidatePath(`/(app)/[orgSlug]/orders`, 'layout');
    return { success: true };
  } catch (err: any) {
    console.error('Error submitting portal order:', err);
    return { error: err.message || 'Impossible de valider la commande.' };
  }
}
