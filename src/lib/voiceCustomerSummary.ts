import { PricingEngine } from '@/domain/PricingEngine';

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString('fr-BE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return 'N/A';
  }
}

export async function getCustomerSummary(
  customerId: string,
  orgId: string,
  supabase: any
): Promise<string> {
  try {
    // 1. Fetch customer details
    const { data: customer, error: custError } = await supabase
      .from('customers')
      .select('id, legal_name, trade_name, code, payment_terms, segment')
      .eq('id', customerId)
      .eq('organization_id', orgId)
      .single();

    if (custError || !customer) {
      console.error('[VOICE SUMMARY] Customer fetch error:', custError);
      return 'Client introuvable dans l\'organisation.';
    }

    // 2. Fetch default margin rate for the organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('default_margin_rate')
      .eq('id', orgId)
      .single();

    if (orgError) {
      console.error('[VOICE SUMMARY] Organization fetch error:', orgError);
    }
    const defaultMarginRate = org?.default_margin_rate ? parseFloat(org.default_margin_rate) : 0.20;

    // 3. Fetch active margin rules for the organization to resolve target margin
    const { data: rules, error: rulesError } = await supabase
      .from('margin_rules')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true);

    if (rulesError) {
      console.error('[VOICE SUMMARY] Margin rules fetch error:', rulesError);
    }

    const resolvedRule = PricingEngine.resolveMarginRule(
      {
        productId: null,
        categoryId: null,
        customerId: customerId,
        referenceDate: new Date().toISOString(),
      },
      (rules || []).map((r: any) => ({
        id: r.id,
        scope: r.scope,
        customer_id: r.customer_id,
        category_id: r.category_id,
        product_id: r.product_id,
        target_margin_rate: parseFloat(r.target_margin_rate),
        priority: r.priority,
        is_active: r.is_active,
        valid_from: r.valid_from,
        valid_to: r.valid_to,
      })),
      defaultMarginRate
    );

    const targetMarginPct = (resolvedRule.targetMarginRate.toNumber() * 100).toFixed(1);

    // 4. Fetch last order (fuzzy matched on client_name)
    const clientNames = [
      customer.legal_name,
      customer.trade_name
    ].filter(Boolean) as string[];

    const { data: allOrgOrders, error: ordersErr } = await supabase
      .from('orders')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (ordersErr) {
      console.error('[VOICE SUMMARY] Orders fetch error:', ordersErr);
    }

    let lastOrder: any = null;
    if (allOrgOrders && clientNames.length > 0) {
      const matchedOrders = allOrgOrders.filter((o: any) => {
        const orderClientNorm = (o.client_name || '').toLowerCase().trim();
        return clientNames.some(name => {
          const nameNorm = name.toLowerCase().trim();
          return orderClientNorm === nameNorm || 
                 orderClientNorm.includes(nameNorm) || 
                 nameNorm.includes(orderClientNorm);
        });
      });
      if (matchedOrders.length > 0) {
        lastOrder = matchedOrders[0];
      }
    }

    // 5. Fetch active pending quotes
    const { data: quotes, error: quotesErr } = await supabase
      .from('quotes')
      .select('quote_number, title, grand_total, status')
      .eq('customer_id', customerId)
      .eq('organization_id', orgId)
      .in('status', ['draft', 'sent', 'viewed'])
      .order('created_at', { ascending: false });

    if (quotesErr) {
      console.error('[VOICE SUMMARY] Quotes fetch error:', quotesErr);
    }

    // 6. Fetch open tasks
    const { data: tasks, error: tasksErr } = await supabase
      .from('tasks')
      .select('title, due_at')
      .eq('customer_id', customerId)
      .eq('organization_id', orgId)
      .in('status', ['open', 'in_progress'])
      .order('due_at', { ascending: true });

    if (tasksErr) {
      console.error('[VOICE SUMMARY] Tasks fetch error:', tasksErr);
    }

    // 7. Format markdown output
    let markdown = `### Résumé Client: **${customer.legal_name}**\n`;
    if (customer.code) markdown += `- **Code** : ${customer.code}\n`;
    if (customer.trade_name) markdown += `- **Enseigne** : ${customer.trade_name}\n`;
    if (customer.segment) {
      const segmentTranslations: Record<string, string> = {
        horeca: 'Horeca',
        retail: 'Retail',
        collectivite: 'Collectivité',
        grossiste: 'Grossiste',
        autre: 'Autre'
      };
      markdown += `- **Segment** : ${segmentTranslations[customer.segment] || customer.segment}\n`;
    }
    markdown += `- **Marge cible** : ${targetMarginPct}%\n`;
    if (customer.payment_terms) markdown += `- **Conditions de paiement** : ${customer.payment_terms}\n`;

    markdown += `\n### Dernière Commande\n`;
    if (lastOrder) {
      const channelTranslations: Record<string, string> = {
        meeting: 'Visite/Réunion',
        whatsapp: 'WhatsApp',
        vapi: 'Assistant Vocal'
      };
      const orderDate = formatDate(lastOrder.created_at);
      const orderWeight = lastOrder.total_weight_kg !== null && lastOrder.total_weight_kg !== undefined
        ? `${parseFloat(lastOrder.total_weight_kg).toFixed(1)} kg`
        : 'Non spécifié';
      const orderSource = channelTranslations[lastOrder.source_channel] || lastOrder.source_channel || 'Non spécifié';
      
      markdown += `- **Date** : ${orderDate}\n`;
      markdown += `- **Poids** : ${orderWeight}\n`;
      markdown += `- **Canal** : ${orderSource}\n`;
    } else {
      markdown += `*Aucune commande trouvée.*\n`;
    }

    const pendingQuotes = quotes || [];
    markdown += `\n### Devis en cours (${pendingQuotes.length})\n`;
    if (pendingQuotes.length > 0) {
      const statusTranslations: Record<string, string> = {
        draft: 'Brouillon',
        sent: 'Envoyé',
        viewed: 'Vu'
      };
      pendingQuotes.forEach((q: any) => {
        const grandTotal = q.grand_total !== null && q.grand_total !== undefined
          ? `${parseFloat(q.grand_total).toFixed(2)} €`
          : 'N/A';
        const qStatus = statusTranslations[q.status] || q.status;
        markdown += `- **N°${q.quote_number}** : ${q.title} — **${grandTotal}** (${qStatus})\n`;
      });
    } else {
      markdown += `*Aucun devis en cours.*\n`;
    }

    const openTasks = tasks || [];
    markdown += `\n### Tâches ouvertes (${openTasks.length})\n`;
    if (openTasks.length > 0) {
      openTasks.forEach((t: any) => {
        const dueDate = formatDate(t.due_at);
        markdown += `- **${t.title}** (Échéance : ${dueDate})\n`;
      });
    } else {
      markdown += `*Aucune tâche ouverte.*\n`;
    }

    return markdown;

  } catch (error: any) {
    console.error('[VOICE SUMMARY] Critical error in getCustomerSummary:', error);
    return 'Une erreur est survenue lors de la récupération du résumé client.';
  }
}
