import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './env';
import { sendEmailDirect } from './emailSender';

const globalForRedis = globalThis as unknown as {
  redisConnection: IORedis | undefined;
  emailQueue: Queue | undefined;
  emailWorker: Worker | undefined;
  voiceQueue: Queue | undefined;
  voiceWorker: Worker | undefined;
};

// 1. Connection setup
export const redisConnection =
  globalForRedis.redisConnection ??
  (env.REDIS_URL
    ? new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null })
    : null);

if (process.env.NODE_ENV !== 'production' && redisConnection) {
  globalForRedis.redisConnection = redisConnection;
}

// 2. Queue definitions
const EMAIL_QUEUE_NAME = 'voxpilot-email-queue';
const VOICE_QUEUE_NAME = 'voxpilot-voice-queue';

export const emailQueue =
  redisConnection
    ? (globalForRedis.emailQueue ??
      new Queue(EMAIL_QUEUE_NAME, {
        connection: redisConnection as any,
        defaultJobOptions: {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 5000, // wait 5s on first fail, then 10s, 20s, 40s...
          },
          removeOnComplete: true, // remove successfully completed jobs from Redis to save memory
          removeOnFail: false,   // keep failed jobs for debugging
        },
      }))
    : null;

if (process.env.NODE_ENV !== 'production' && emailQueue) {
  globalForRedis.emailQueue = emailQueue;
}

export const voiceQueue =
  redisConnection
    ? (globalForRedis.voiceQueue ??
      new Queue(VOICE_QUEUE_NAME, {
        connection: redisConnection as any,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      }))
    : null;

if (process.env.NODE_ENV !== 'production' && voiceQueue) {
  globalForRedis.voiceQueue = voiceQueue;
}

// 3. Workers definition
export function initializeWorker() {
  if (!redisConnection) {
    console.log('[Queue] ⚠️ Redis non configuré. Mode asynchrone désactivé (repli direct actif).');
    return;
  }

  // 3.1 Initialize Email Worker
  if (globalForRedis.emailWorker) {
    console.log('[Queue] Worker de messagerie BullMQ déjà initialisé.');
  } else {
    console.log('[Queue] ⚙️ Initialisation du Worker de messagerie BullMQ pour VoxPilot...');
    const emailWorker = new Worker(
      EMAIL_QUEUE_NAME,
      async (job: Job) => {
        console.log(`[Worker] Job d'e-mail ${job.id} démarré (${job.name})...`);
        if (job.name === 'send-email') {
          const result = await sendEmailDirect(job.data);
          if ('error' in result) {
            throw new Error(`Échec de l'envoi de mail dans le worker : ${result.error}`);
          }
          console.log(`[Worker] Job d'e-mail ${job.id} terminé avec succès.`);
          return result;
        }
      },
      {
        connection: redisConnection as any,
        concurrency: 2, // process up to 2 emails concurrently
      }
    );

    emailWorker.on('failed', (job: Job | undefined, err: Error) => {
      console.error(`[Worker] Job d'e-mail ${job?.id} a échoué définitivement :`, err);
    });

    if (process.env.NODE_ENV !== 'production') {
      globalForRedis.emailWorker = emailWorker;
    }
  }

  // 3.2 Initialize Voice Worker
  if (globalForRedis.voiceWorker) {
    console.log('[Queue] Worker de voix BullMQ déjà initialisé.');
  } else {
    console.log('[Queue] ⚙️ Initialisation du Worker de voix BullMQ pour VoxPilot...');
    const voiceWorker = new Worker(
      VOICE_QUEUE_NAME,
      async (job: Job) => {
        console.log(`[Worker] Job de voix ${job.id} démarré (${job.name})...`);
        if (job.name === 'process-voice') {
          const { fileDataUri, apiKey, systemPrompt, NEXT_PUBLIC_APP_URL, response_format } = job.data;
          
          // Trace Langfuse inside the worker if active
          const { langfuse } = await import('./langfuse');
          const trace = langfuse
            ? langfuse.trace({
                name: 'voice-crm-processing-async',
                userId: job.data.userId,
                metadata: { orgId: job.data.orgId, orgSlug: job.data.orgSlug }
              })
            : null;

          const generation = trace
            ? trace.generation({
                name: 'voice-to-task-extraction',
                model: 'google/gemini-3.5-flash',
                input: {
                  systemPrompt,
                  filename: job.data.filename,
                  fileSize: job.data.fileSize
                }
              })
            : null;

          try {
            const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
                'X-Title': 'VoxPilot Voice Assistant Async'
              },
              body: JSON.stringify({
                model: 'google/gemini-3.5-flash',
                messages: [
                  { role: 'system', content: systemPrompt },
                  {
                    role: 'user',
                    content: [
                      { type: 'text', text: 'Analyse cet enregistrement audio commercial.' },
                      { type: 'file', file: { filename: 'audio.webm', file_data: fileDataUri } }
                    ]
                  }
                ],
                response_format
              })
            });

            if (!openRouterResponse.ok) {
              const errorText = await openRouterResponse.text();
              const errMsg = `Erreur OpenRouter API: ${openRouterResponse.statusText}`;
              console.error('Async OpenRouter error details:', errorText);
              if (generation) {
                generation.end({ statusMessage: errMsg + ' - ' + errorText, level: 'ERROR' });
              }
              if (langfuse) await langfuse.shutdownAsync();
              throw new Error(errMsg);
            }

            const resJson = await openRouterResponse.json();
            const content = resJson.choices?.[0]?.message?.content;
            if (!content) {
              const errMsg = 'Aucune analyse retournée par l\'IA';
              if (generation) {
                generation.end({ statusMessage: errMsg, level: 'ERROR' });
              }
              if (langfuse) await langfuse.shutdownAsync();
              throw new Error(errMsg);
            }

            const parsedResult = JSON.parse(content);

            if (generation) {
              generation.end({
                output: parsedResult,
                usage: resJson.usage ? {
                  promptTokens: resJson.usage.prompt_tokens,
                  completionTokens: resJson.usage.completion_tokens,
                  totalTokens: resJson.usage.total_tokens
                } : undefined
              });
            }

            if (langfuse) await langfuse.shutdownAsync();
            return parsedResult;

          } catch (err: any) {
            console.error('Async voice processing error:', err);
            if (generation) {
              generation.end({ statusMessage: err.message || String(err), level: 'ERROR' });
            }
            if (langfuse) await langfuse.shutdownAsync();
            throw err;
          }
        }
      },
      {
        connection: redisConnection as any,
        concurrency: 1, // process 1 voice job at a time to prevent CPU/memory spikes
      }
    );

    voiceWorker.on('failed', (job: Job | undefined, err: Error) => {
      console.error(`[Worker] Job de voix ${job?.id} a échoué définitivement :`, err);
    });

    if (process.env.NODE_ENV !== 'production') {
      globalForRedis.voiceWorker = voiceWorker;
    }
  }
}
