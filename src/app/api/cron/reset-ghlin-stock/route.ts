import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const apiKey = searchParams.get('apiKey');

    // Utilisation d'un token sécurisé basé sur l'APP_ENCRYPTION_KEY
    const expectedKey = process.env.APP_ENCRYPTION_KEY || 'default-secret-cron-token-938210';
    
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
