import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CrmAutomationService } from '@/domain/crm/CrmAutomationService';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const cronSecret = process.env.CRON_SECRET || process.env.SUPABASE_SECRET_KEY;

    // Enforce auth if secret is defined
    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && authHeader !== `Bearer ${process.env.SUPABASE_SECRET_KEY}`) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const results = await CrmAutomationService.runDailyAutomations(supabase);

    return NextResponse.json({
      success: true,
      message: 'Automatisations CRM quotidiennes exécutées avec succès.',
      results
    });
  } catch (err) {
    console.error('Error in CRM daily cron route:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Une erreur interne est survenue.' },
      { status: 500 }
    );
  }
}
