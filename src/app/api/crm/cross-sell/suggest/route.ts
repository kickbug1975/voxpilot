import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    // 2. Parse body
    const body = await req.json();
    const { orgSlug, customerId, currentProducts } = body;

    if (!orgSlug) {
      return NextResponse.json({ error: 'Paramètre orgSlug manquant' }, { status: 400 });
    }

    // 3. Fetch org ID
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', orgSlug)
      .single();

    if (orgError || !org) {
      return NextResponse.json({ error: 'Organisation introuvable' }, { status: 404 });
    }

    const currentProdsNorm = (currentProducts || []).map((p: string) => p.toLowerCase().trim());

    // 4. Fetch orders from the last 90 days for this customer (or org if no customer)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);

    let query = supabase
      .from('orders')
      .select('id, created_at, order_items(product_name, quantity_kg)')
      .eq('organization_id', org.id)
      .gte('created_at', cutoffDate.toISOString());

    if (customerId) {
      query = query.eq('customer_id', customerId);
    }

    const { data: orders, error: ordersErr } = await query;
    if (ordersErr) {
      console.error('[CROSS-SELL API] Orders fetch error:', ordersErr);
      return NextResponse.json({ error: 'Erreur lors de la recherche des commandes' }, { status: 500 });
    }

    // Count product frequencies
    const productCounts: Record<string, { count: number; totalQty: number }> = {};

    (orders || []).forEach(o => {
      (o.order_items || []).forEach((item: any) => {
        if (item.product_name) {
          const cleanName = item.product_name.trim();
          const lowerName = cleanName.toLowerCase();

          const isAlreadyInCurrent = currentProdsNorm.some(
            (cp: string) => lowerName.includes(cp) || cp.includes(lowerName)
          );

          if (!isAlreadyInCurrent) {
            if (!productCounts[cleanName]) {
              productCounts[cleanName] = { count: 0, totalQty: 0 };
            }
            productCounts[cleanName].count += 1;
            productCounts[cleanName].totalQty += (parseFloat(item.quantity_kg) || 1);
          }
        }
      });
    });

    // Take top 2 suggestions
    const suggestions = Object.entries(productCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 2)
      .map(([name, stats]) => {
        const avgQty = Math.round((stats.totalQty / stats.count) * 10) / 10;
        return {
          productName: name,
          avgQuantity: avgQty > 0 ? avgQty : 1,
          reasonText: `Acheté ${stats.count}x par ce client (moyenne : ${avgQty} kg)`
        };
      });

    return NextResponse.json({ success: true, suggestions });

  } catch (error: any) {
    console.error('Cross-Sell API crash:', error);
    return NextResponse.json({ error: error.message || 'Erreur interne' }, { status: 500 });
  }
}
