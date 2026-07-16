import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';

function matchProduct(itemProductName: string, selectedProductName: string): boolean {
  const cleanItem = itemProductName.toLowerCase().trim();
  const cleanSelected = selectedProductName.toLowerCase().trim();
  
  if (cleanItem.includes(cleanSelected)) return true;
  
  // Split selected product name into lowercase alphanumeric words, filtering out weight unit keywords
  const selectedWords = cleanSelected.split(/[\s,.'"\(\)\/-]+/).filter(w => w.length > 0 && w !== 'kg');
  if (selectedWords.length === 0) return false;
  
  return selectedWords.every(word => cleanItem.includes(word));
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    // 1. Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    // 2. Parse request body
    const body = await req.json();
    const { productId, productName, totalQty, price, orgSlug } = body;

    if (!productId || !productName || !totalQty || !price || !orgSlug) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
    }

    // 3. Fetch organization ID
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', orgSlug)
      .single();

    if (orgError || !org) {
      return NextResponse.json({ error: 'Organisation introuvable' }, { status: 404 });
    }

    // 4. Fetch active customers of the organization
    const { data: customers, error: custError } = await supabase
      .from('customers')
      .select('id, legal_name, trade_name, phone')
      .eq('organization_id', org.id)
      .eq('is_active', true);

    if (custError) {
      console.error('[DESTOCKAGE API] Customers fetch error:', custError);
      return NextResponse.json({ error: 'Impossible de récupérer la liste des clients' }, { status: 500 });
    }

    // 5. Fetch orders from the last 30 days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);

    const { data: orders, error: ordersErr } = await supabase
      .from('orders')
      .select('id, client_name, created_at, order_items(product_id, product_name, quantity_kg)')
      .eq('organization_id', org.id)
      .gte('created_at', cutoffDate.toISOString());

    if (ordersErr) {
      console.error('[DESTOCKAGE API] Orders fetch error:', ordersErr);
      return NextResponse.json({ error: 'Impossible de récupérer l\'historique des commandes' }, { status: 500 });
    }

    // 6. Identify customers who already ordered today (exclude them)
    const todayStr = new Date().toISOString().split('T')[0];
    const customersWithOrdersToday = new Set<string>();
    
    (orders || []).forEach(o => {
      if (o.created_at.startsWith(todayStr)) {
        const clientNameNorm = o.client_name?.toLowerCase().trim();
        if (clientNameNorm) {
          customersWithOrdersToday.add(clientNameNorm);
        }
      }
    });

    // 7. Calculate total purchase volume for the target product in the last 30 days
    interface CustomerVolume {
      id: string;
      legal_name: string;
      trade_name: string | null;
      phone: string | null;
      volume30d: number;
    }

    const customerVolumes: CustomerVolume[] = [];

    for (const c of customers || []) {
      const legalNorm = c.legal_name?.toLowerCase().trim();
      const tradeNorm = c.trade_name?.toLowerCase().trim();

      // Check exclusion rule
      if (
        (legalNorm && customersWithOrdersToday.has(legalNorm)) ||
        (tradeNorm && customersWithOrdersToday.has(tradeNorm))
      ) {
        continue; // Skip this customer
      }

      // Sum volumes for the target product
      let totalVolume = 0;
      const clientNames = [legalNorm, tradeNorm].filter(Boolean) as string[];

      (orders || []).forEach(o => {
        const orderClientNorm = o.client_name?.toLowerCase().trim();
        if (orderClientNorm && clientNames.some(name => orderClientNorm === name || orderClientNorm.includes(name) || name.includes(orderClientNorm))) {
          const items = o.order_items || [];
          items.forEach((item: any) => {
            const matchesProduct = 
              item.product_id === productId || 
              (item.product_name && matchProduct(item.product_name, productName));

            if (matchesProduct) {
              const qty = item.quantity_kg ? parseFloat(item.quantity_kg) : 0;
              totalVolume += qty;
            }
          });
        }
      });

      if (totalVolume > 0) {
        customerVolumes.push({
          id: c.id,
          legal_name: c.legal_name,
          trade_name: c.trade_name,
          phone: c.phone,
          volume30d: totalVolume
        });
      }
    }

    // 8. Sort by volume desc and take top 5
    const topCustomers = customerVolumes
      .sort((a, b) => b.volume30d - a.volume30d)
      .slice(0, 5);

    // If less than 5 customers with historical volumes, fill with active customers without history
    if (topCustomers.length < 5) {
      const existingIds = new Set(topCustomers.map(c => c.id));
      for (const c of customers || []) {
        if (topCustomers.length >= 5) break;
        if (existingIds.has(c.id)) continue;

        const legalNorm = c.legal_name?.toLowerCase().trim();
        const tradeNorm = c.trade_name?.toLowerCase().trim();

        if (
          (legalNorm && customersWithOrdersToday.has(legalNorm)) ||
          (tradeNorm && customersWithOrdersToday.has(tradeNorm))
        ) {
          continue;
        }

        topCustomers.push({
          id: c.id,
          legal_name: c.legal_name,
          trade_name: c.trade_name,
          phone: c.phone,
          volume30d: 0
        });
      }
    }

    // 9. Generate personalized messages using Gemini 3.5 Flash via OpenRouter
    const apiKey = env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Clé d\'API OpenRouter manquante' }, { status: 500 });
    }

    const suggestions = [];

    // Distribute total volume equally or adaptively among suggested customers
    const distributedQty = Math.round((totalQty / Math.max(1, topCustomers.length)) * 10) / 10;

    for (const client of topCustomers) {
      const clientDisplayName = client.trade_name || client.legal_name;

      const systemPrompt = `Tu es l'assistant commercial de Maison Fumesse (marée fraîche). 
Rédige un message WhatsApp de déstockage court, direct, amical et percutant pour le client "${clientDisplayName}".
Le ton doit être de type "poissonnier professionnel de confiance" (tutoiement chaleureux ou vouvoiement professionnel selon le prénom, mais préfère un ton direct commercial). 
N'inclus aucune formule d'introduction robotique, réponds directement avec le texte du message.`;

      const userPrompt = `Rédige l'offre de déstockage :
- Produit : ${productName}
- Quantité proposée : ${distributedQty} kg
- Prix proposé : ${price} €/kg
Ajoute un emoji lié à la mer/poisson (ex: 🐟, 🚚). Le message doit inciter à répondre rapidement par oui ou non pour réserver.`;

      try {
        const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
            'X-Title': 'VoxPilot CRM Destockage'
          },
          body: JSON.stringify({
            model: 'google/gemini-3.5-flash',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.7
          })
        });

        if (!openRouterResponse.ok) {
          throw new Error(`OpenRouter error status: ${openRouterResponse.status}`);
        }

        const resJson: any = await openRouterResponse.json();
        const generatedMessage = resJson.choices?.[0]?.message?.content?.trim() || 
          `Salut, il me reste ${distributedQty}kg de ${productName} à Ghlin aujourd'hui au prix de ${price}€/kg. Intéressé ? Dis-moi vite ! 🐟`;

        suggestions.push({
          customerId: client.id,
          customerName: client.legal_name,
          tradeName: client.trade_name,
          phone: client.phone,
          volume30d: client.volume30d,
          proposedQty: distributedQty,
          message: generatedMessage
        });
      } catch (err) {
        console.error(`[DESTOCKAGE API] Error generating message for ${client.legal_name}:`, err);
        suggestions.push({
          customerId: client.id,
          customerName: client.legal_name,
          tradeName: client.trade_name,
          phone: client.phone,
          volume30d: client.volume30d,
          proposedQty: distributedQty,
          message: `Salut, il me reste ${distributedQty}kg de ${productName} à Ghlin aujourd'hui au prix de ${price}€/kg. Intéressé ? Dis-moi vite ! 🐟`
        });
      }
    }

    return NextResponse.json({ success: true, suggestions });

  } catch (error: any) {
    console.error('Destockage API crash:', error);
    return NextResponse.json({ error: error.message || 'Erreur interne de traitement' }, { status: 500 });
  }
}
