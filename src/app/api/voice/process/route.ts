import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const orgSlug = formData.get('orgSlug') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'Fichier audio manquant' }, { status: 400 });
    }

    if (!orgSlug) {
      return NextResponse.json({ error: 'orgSlug manquant' }, { status: 400 });
    }

    // Get organization ID
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', orgSlug)
      .single();

    if (orgError || !org) {
      return NextResponse.json({ error: 'Organisation introuvable' }, { status: 404 });
    }

    // Fetch active customers for the organization to pass to the LLM for mapping
    const { data: customers, error: custError } = await supabase
      .from('customers')
      .select('id, legal_name')
      .eq('organization_id', org.id);

    if (custError) {
      console.error('Error fetching customers for voice mapping:', custError);
    }

    const customersContext = (customers || [])
      .map(c => `- ID: "${c.id}", Nom: "${c.legal_name}"`)
      .join('\n');

    // Convert audio to base64
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Audio = buffer.toString('base64');
    const fileDataUri = `data:${file.type};base64,${base64Audio}`;

    const apiKey = env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Clé d\'API OpenRouter manquante' }, { status: 500 });
    }

    const currentDate = new Date().toISOString();
    const systemPrompt = `Tu es l'assistant vocal intelligent embarqué de VoxPilot CRM. 
Ton rôle est de comprendre l'instruction vocale dictée par un commercial et d'en extraire de manière structurée l'action demandée.

Tu dois identifier l'action principale parmi :
1. "create_task" (créer un rappel, une relance de devis, un rendez-vous, un appel à passer, etc.)
2. "create_activity" (enregistrer un appel passé, un email envoyé, une visite effectuée, etc.)
3. "unknown" (si l'audio n'est pas clair ou ne correspond pas à une action CRM).

Voici le contexte actuel pour t'aider dans l'analyse :
- Date et heure actuelles : ${currentDate}
- Liste des clients de l'organisation :
${customersContext || '(Aucun client dans la base)'}

Règles de détection et d'extraction :
1. Transcription : Transcris fidèlement l'audio en français sous la clé "transcript".
2. Correspondance Client : Fais correspondre le client mentionné oralement avec l'un des clients de la liste ci-dessus. Remplis "customerId" avec l'ID correspondant, et "customerName" avec son nom officiel. Si aucun ne correspond ou si ce n'est pas mentionné, laisse ces clés à null.
3. Date d'échéance : Si c'est une tâche ("create_task"), calcule la date d'échéance "dueDate" au format ISO en te basant sur la date actuelle (${currentDate}) et les indications orales (ex: "lundi prochain", "dans 3 jours", "demain matin").
4. Types : Mappe le type d'action sur "taskType" : 'call', 'email', 'visit', 'meeting', 'quote', 'quote_follow_up' ou 'other'.
5. Sens : Pour les appels/emails, indique la direction ("inbound" ou "outbound").`;

    const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'VoxPilot Voice Assistant'
      },
      body: JSON.stringify({
        model: 'google/gemini-flash-1.5',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyse cet enregistrement audio commercial.'
              },
              {
                type: 'file',
                file: {
                  filename: 'audio.webm',
                  file_data: fileDataUri
                }
              }
            ]
          }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'voice_crm_extraction',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                action: { type: 'string', enum: ['create_task', 'create_activity', 'unknown'] },
                transcript: { type: 'string' },
                confidence: { type: 'number' },
                data: {
                  type: 'object',
                  properties: {
                    customerId: { type: ['string', 'null'] },
                    customerName: { type: ['string', 'null'] },
                    title: { type: 'string' },
                    content: { type: ['string', 'null'] },
                    dueDate: { type: ['string', 'null'] },
                    taskType: { type: 'string', enum: ['call', 'email', 'visit', 'meeting', 'quote', 'quote_follow_up', 'other'] },
                    direction: { type: ['string', 'null'], enum: ['inbound', 'outbound', null] }
                  },
                  required: [
                    'customerId',
                    'customerName',
                    'title',
                    'content',
                    'dueDate',
                    'taskType',
                    'direction'
                  ],
                  additionalProperties: false
                }
              },
              required: ['action', 'transcript', 'confidence', 'data'],
              additionalProperties: false
            }
          }
        }
      })
    });

    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text();
      console.error('OpenRouter voice processing error:', errorText);
      return NextResponse.json({ error: `Erreur OpenRouter API: ${openRouterResponse.statusText}` }, { status: 500 });
    }

    const resJson = await openRouterResponse.json();
    const content = resJson.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json({ error: 'Aucune analyse retournée par l\'IA' }, { status: 500 });
    }

    const parsedResult = JSON.parse(content);
    return NextResponse.json(parsedResult);

  } catch (error: any) {
    console.error('Voice processing router crash:', error);
    return NextResponse.json({ error: error.message || 'Erreur interne de traitement' }, { status: 500 });
  }
}
