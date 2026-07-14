import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { voiceQueue } from '@/lib/queue';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ error: 'jobId manquant' }, { status: 400 });
    }

    if (!voiceQueue) {
      return NextResponse.json({ error: 'Le service de file d\'attente est indisponible' }, { status: 500 });
    }

    const job = await voiceQueue.getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: 'Tâche introuvable ou déjà nettoyée' }, { status: 404 });
    }

    const state = await job.getState();

    if (state === 'completed') {
      return NextResponse.json({
        status: 'completed',
        result: job.returnvalue
      });
    }

    if (state === 'failed') {
      return NextResponse.json({
        status: 'failed',
        error: job.failedReason || 'Le traitement audio a échoué.'
      });
    }

    // Includes 'waiting', 'active', 'delayed', etc.
    return NextResponse.json({
      status: 'processing'
    });

  } catch (error: any) {
    console.error('Error fetching voice job status:', error);
    return NextResponse.json({ error: error.message || 'Erreur interne de traitement' }, { status: 500 });
  }
}
