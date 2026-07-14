import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const apiKey = searchParams.get('apiKey');

    // Use CRON_SECRET as primary, fallback to APP_ENCRYPTION_KEY. No insecure default fallback.
    const expectedKey = process.env.CRON_SECRET || process.env.APP_ENCRYPTION_KEY;
    
    if (!expectedKey) {
      console.error('[RESET_GHLIN_STOCK_CRON] Security configuration missing (CRON_SECRET and APP_ENCRYPTION_KEY are not set).');
      return NextResponse.json({ error: 'Configuration de sécurité manquante sur le serveur' }, { status: 500 });
    }
    
    if (apiKey !== expectedKey) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Réinitialise in_stock_ghlin à false pour tous les produits (uniquement ceux qui sont à true pour économiser les I/O)
    const { error } = await supabase
      .from('products')
      .update({ in_stock_ghlin: false })
      .eq('in_stock_ghlin', true);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, message: 'Le stock de Ghlin a été réinitialisé avec succès.' });
  } catch (err: any) {
    console.error('Error in reset-ghlin-stock cron:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
