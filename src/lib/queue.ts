import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './env';
import { sendEmailDirect } from './emailSender';

const globalForRedis = globalThis as unknown as {
  redisConnection: IORedis | undefined;
  emailQueue: Queue | undefined;
  emailWorker: Worker | undefined;
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

// 2. Queue definition
const QUEUE_NAME = 'voxpilot-email-queue';

export const emailQueue =
  redisConnection
    ? (globalForRedis.emailQueue ??
      new Queue(QUEUE_NAME, {
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

// 3. Worker definition
export function initializeWorker() {
  if (!redisConnection) {
    console.log('[Queue] ⚠️ Redis non configuré. Mode asynchrone désactivé (repli direct actif).');
    return;
  }

  if (globalForRedis.emailWorker) {
    console.log('[Queue] Worker BullMQ déjà initialisé.');
    return;
  }

  console.log('[Queue] ⚙️ Initialisation du Worker BullMQ pour VoxPilot...');

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      console.log(`[Worker] Job ${job.id} démarré (${job.name})...`);
      if (job.name === 'send-email') {
        const result = await sendEmailDirect(job.data);
        if ('error' in result) {
          throw new Error(`Échec de l'envoi de mail dans le worker : ${result.error}`);
        }
        console.log(`[Worker] Job ${job.id} terminé avec succès.`);
        return result;
      }
    },
    {
      connection: redisConnection as any,
      concurrency: 2, // process up to 2 emails concurrently
    }
  );

  worker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(`[Worker] Job ${job?.id} a échoué définitivement :`, err);
  });

  if (process.env.NODE_ENV !== 'production') {
    globalForRedis.emailWorker = worker;
  }
}
