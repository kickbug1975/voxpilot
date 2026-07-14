import { Langfuse } from 'langfuse';
import { env } from './env';

export const langfuse =
  env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY
    ? new Langfuse({
        publicKey: env.LANGFUSE_PUBLIC_KEY,
        secretKey: env.LANGFUSE_SECRET_KEY,
        baseUrl: env.LANGFUSE_HOST || 'https://cloud.langfuse.com',
      })
    : null;
