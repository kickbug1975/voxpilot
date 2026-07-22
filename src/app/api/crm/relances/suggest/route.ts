import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';

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
    const { orgSlug, singleCustomerId, customInstruction, currentMessage } = body;

    if (!orgSlug) {
      return NextResponse.json({ error: 'Paramètre orgSlug manquant' }, { status: 400 });
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
      console.error('[RELANCES API] Customers fetch error:', custError);
      return NextResponse.json({ error: 'Impossible de récupérer la liste des clients' }, { status: 500 });
    }

    // Handle single customer AI regeneration with custom instruction
    if (singleCustomerId && customInstruction) {
      const apiKey = env.OPENROUTER_API_KEY;
      const targetCustomer = (customers || []).find(c => c.id === singleCustomerId);
      const displayName = targetCustomer?.trade_name || targetCustomer?.legal_name || 'Client';

      const prompt = `Tu es l'assistant commercial de Maison Fumesse.
Voici le message de relance WhatsApp actuel pour le client "${displayName}" :
"${currentMessage || ''}"

L'utilisateur demande d'adapter le message selon cette consigne :
"${customInstruction}"

Rédige le nouveau message WhatsApp de relance en intégrant parfaitement cette consigne. Reste chaleureux, professionnel et concis. N'inclus aucun commentaire hors du message.`;

      try {
        const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [{ role: 'system', content: prompt }],
            temperature: 0.7
          })
        });

        const json: any = await aiRes.json();
        const newMsg = json.choices?.[0]?.message?.content?.trim();
        return NextResponse.json({ success: true, relanceMessage: newMsg });
      } catch (err: any) {
        console.error('[RELANCES API] Single customer regeneration failed:', err);
        return NextResponse.json({ error: 'Échec de la régénération IA' }, { status: 500 });
      }
    }

    // 5. Fetch orders from the last 60 days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 60);

    const { data: orders, error: ordersErr } = await supabase
      .from('orders')
      .select('id, client_name, created_at, order_items(product_name, quantity_kg)')
      .eq('organization_id', org.id)
      .gte('created_at', cutoffDate.toISOString());

    if (ordersErr) {
      console.error('[RELANCES API] Orders fetch error:', ordersErr);
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

    const currentDayOfWeek = new Date().getDay(); // 0 (Sun) to 6 (Sat)
    const daysMap = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const currentDayName = daysMap[currentDayOfWeek];

    interface CustomerHabit {
      customer: any;
      orderCountOnThisDay: number;
      topProducts: string[];
      lastOrderDate?: string;
    }

    const expectedCustomers: CustomerHabit[] = [];

    for (const c of customers || []) {
      const legalNorm = c.legal_name?.toLowerCase().trim();
      const tradeNorm = c.trade_name?.toLowerCase().trim();

      // Skip if client already ordered today
      if (
        (legalNorm && customersWithOrdersToday.has(legalNorm)) ||
        (tradeNorm && customersWithOrdersToday.has(tradeNorm))
      ) {
        continue;
      }

      const clientNames = [legalNorm, tradeNorm].filter(Boolean) as string[];

      // Analyze orders for this customer
      const clientOrders = (orders || []).filter(o => {
        const orderClientNorm = o.client_name?.toLowerCase().trim();
        return orderClientNorm && clientNames.some(name => orderClientNorm === name || orderClientNorm.includes(name) || name.includes(orderClientNorm));
      });

      if (clientOrders.length === 0) continue;

      // Count orders placed on the current day of the week
      let ordersOnThisDay = 0;
      const productCounts: Record<string, number> = {};
      let lastDate = '';

      clientOrders.forEach(o => {
        const orderDate = new Date(o.created_at);
        if (orderDate.getDay() === currentDayOfWeek) {
          ordersOnThisDay++;
        }
        if (!lastDate || o.created_at > lastDate) {
          lastDate = o.created_at;
        }

        // Count product frequencies
        (o.order_items || []).forEach((item: any) => {
          if (item.product_name) {
            const cleanName = item.product_name.trim();
            productCounts[cleanName] = (productCounts[cleanName] || 0) + 1;
          }
        });
      });

      // If customer orders at least twice on this day of the week (or has >2 total orders)
      if (ordersOnThisDay >= 1 || clientOrders.length >= 3) {
        const sortedProducts = Object.entries(productCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(([p]) => p);

        expectedCustomers.push({
          customer: c,
          orderCountOnThisDay: ordersOnThisDay,
          topProducts: sortedProducts.length > 0 ? sortedProducts : ['Poissons frais'],
          lastOrderDate: lastDate
        });
      }
    }

    // Sort expected customers by habits frequency (desc) and take top 6
    const topRelances = expectedCustomers
      .sort((a, b) => b.orderCountOnThisDay - a.orderCountOnThisDay)
      .slice(0, 6);

    // 7. Generate personalized AI follow-up messages using Gemini 3.6 Flash via OpenRouter
    const apiKey = env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Clé d\'API OpenRouter manquante' }, { status: 500 });
    }

    const relances = [];

    for (const item of topRelances) {
      const client = item.customer;
      const clientDisplayName = client.trade_name || client.legal_name;
      const usualProductsStr = item.topProducts.join(' et ');

      const systemPrompt = `Tu es l'assistant commercial de Maison Fumesse (marée fraîche).
Rédige un message WhatsApp de relance court, très naturel et chaleureux pour le client "${clientDisplayName}".
Le ton doit être de type "poissonnier professionnel de confiance".
N'inclus aucune formule d'introduction robotique, réponds directement avec le texte du message.`;

      const userPrompt = `Le client "${clientDisplayName}" commande habituellement le ${currentDayName} (ex: ${usualProductsStr}).
Rédige un message amical pour lui rappeler poliment les arrivages de demain et lui proposer de réserver ses produits habituels (${usualProductsStr}).
Inclus 1 ou 2 emojis marée (ex: 🐟, 🚚).`;

      try {
        const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
            'X-Title': 'VoxPilot CRM Relances'
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
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
          `Salut ${clientDisplayName}, je prépare les arrivages pour demain. Tu souhaites que je te réserve tes ${usualProductsStr} habituels ? 🐟🚚`;

        relances.push({
          customerId: client.id,
          customerName: client.legal_name,
          tradeName: client.trade_name,
          phone: client.phone,
          dayName: currentDayName,
          orderCountOnThisDay: item.orderCountOnThisDay,
          topProducts: item.topProducts,
          message: generatedMessage
        });
      } catch (err) {
        console.error(`[RELANCES API] Error generating message for ${client.legal_name}:`, err);
        relances.push({
          customerId: client.id,
          customerName: client.legal_name,
          tradeName: client.trade_name,
          phone: client.phone,
          dayName: currentDayName,
          orderCountOnThisDay: item.orderCountOnThisDay,
          topProducts: item.topProducts,
          message: `Salut ${clientDisplayName}, je prépare les arrivages pour demain. Tu souhaites que je te réserve tes ${usualProductsStr} habituels ? 🐟🚚`
        });
      }
    }

    return NextResponse.json({ success: true, relances, dayName: currentDayName });

  } catch (error: any) {
    console.error('Relances API crash:', error);
    return NextResponse.json({ error: error.message || 'Erreur interne de traitement' }, { status: 500 });
  }
}
