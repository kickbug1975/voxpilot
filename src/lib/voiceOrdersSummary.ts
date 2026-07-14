export async function getCustomerOrdersSummary(
  customerId: string | null,
  orgId: string,
  days: number,
  supabase: any
): Promise<string> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // 1. Fetch orders from the database
    const { data: allOrders, error: ordersErr } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('organization_id', orgId)
      .gte('created_at', cutoffDate.toISOString());

    if (ordersErr) {
      console.error('[VOICE ORDERS SUMMARY] Orders query error:', ordersErr);
      return 'Une erreur est survenue lors de la récupération de l\'historique des commandes.';
    }

    let matchedOrders = allOrders || [];
    let clientTitle = 'Toutes les commandes';

    // 2. If customerId is provided, filter the orders using client names
    if (customerId) {
      const { data: customer, error: custError } = await supabase
        .from('customers')
        .select('legal_name, trade_name')
        .eq('id', customerId)
        .eq('organization_id', orgId)
        .single();

      if (custError || !customer) {
        console.error('[VOICE ORDERS SUMMARY] Customer fetch error:', custError);
        return 'Client introuvable.';
      }

      clientTitle = `Commandes pour le client **${customer.legal_name}**`;

      const clientNames = [
        customer.legal_name,
        customer.trade_name
      ].filter(Boolean) as string[];

      if (clientNames.length > 0) {
        matchedOrders = (allOrders || []).filter((o: any) => {
          const orderClientNorm = (o.client_name || '').toLowerCase().trim();
          return clientNames.some(name => {
            const nameNorm = name.toLowerCase().trim();
            return orderClientNorm === nameNorm || 
                   orderClientNorm.includes(nameNorm) || 
                   nameNorm.includes(orderClientNorm);
          });
        });
      } else {
        matchedOrders = [];
      }
    }

    // 3. Compute aggregations
    const orderCount = matchedOrders.length;
    let totalWeight = 0;
    let totalSales = 0;

    for (const order of matchedOrders) {
      const items = order.order_items || [];
      for (const item of items) {
        const qty = item.quantity_kg ? parseFloat(item.quantity_kg) : 0;
        const price = item.price_applied ? parseFloat(item.price_applied) : 0;
        totalWeight += qty;
        totalSales += qty * price;
      }
    }

    // 4. Format markdown summary
    let markdown = `### ${clientTitle} (les ${days} derniers jours)\n`;
    markdown += `- **Nombre de commandes** : ${orderCount}\n`;
    markdown += `- **Volume total** : ${totalWeight.toFixed(1)} kg\n`;
    markdown += `- **Chiffre d'affaires** : ${totalSales.toFixed(2)} €\n`;

    return markdown;
  } catch (error: any) {
    console.error('[VOICE ORDERS SUMMARY] Critical error in getCustomerOrdersSummary:', error);
    return 'Une erreur est survenue lors de la récupération du résumé des commandes.';
  }
}

export async function getAlertsSummary(orgId: string, supabase: any): Promise<string> {
  try {
    const { data: alerts, error: alertsErr } = await supabase
      .from('alerts')
      .select('*')
      .eq('organization_id', orgId)
      .eq('status', 'unread');

    if (alertsErr) {
      console.error('[VOICE ALERTS SUMMARY] Alerts query error:', alertsErr);
      return 'Une erreur est survenue lors de la récupération des alertes.';
    }

    if (!alerts || alerts.length === 0) {
      return 'Aucune alerte active. Tout est au vert ! 🟢';
    }

    const priorityOrder: Record<string, number> = {
      high: 1,
      medium: 2,
      low: 3
    };

    const sortedAlerts = [...alerts].sort((a: any, b: any) => {
      const aOrder = priorityOrder[a.priority?.toLowerCase()] ?? 99;
      const bOrder = priorityOrder[b.priority?.toLowerCase()] ?? 99;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });

    const priorityLabels: Record<string, string> = {
      high: 'Haute',
      medium: 'Moyenne',
      low: 'Faible'
    };

    let markdown = `### Alertes Actives (${sortedAlerts.length})\n`;
    for (const alert of sortedAlerts) {
      const pLabel = priorityLabels[alert.priority?.toLowerCase()] || alert.priority || 'Normale';
      markdown += `- **[Priorité ${pLabel}]** ${alert.title}\n`;
      if (alert.message) {
        markdown += `  _${alert.message}_\n`;
      }
    }

    return markdown;
  } catch (error: any) {
    console.error('[VOICE ALERTS SUMMARY] Critical error in getAlertsSummary:', error);
    return 'Une erreur est survenue lors de la récupération des alertes.';
  }
}
