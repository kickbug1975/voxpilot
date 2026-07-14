import { z } from 'zod';

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().optional(),
});

const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1).optional(),
  EMAIL_MODE: z.enum(['log', 'resend']).default('log'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('BlueMargin <offres@example.com>'),
  AI_MODE: z.enum(['heuristic', 'openai']).default('heuristic'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_STARTER: z.string().optional(),
  PUBLIC_QUOTE_TOKEN_PEPPER: z.string().min(1),
  APP_ENCRYPTION_KEY: z.string().min(1),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_TENANT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
});

const isServer = typeof window === 'undefined';

const envSchema = isServer ? clientSchema.merge(serverSchema) : clientSchema;

const parseResult = envSchema.safeParse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  ...(isServer ? {
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    EMAIL_MODE: process.env.EMAIL_MODE,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    AI_MODE: process.env.AI_MODE,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    SENTRY_DSN: process.env.SENTRY_DSN,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_PRICE_STARTER: process.env.STRIPE_PRICE_STARTER,
    PUBLIC_QUOTE_TOKEN_PEPPER: process.env.PUBLIC_QUOTE_TOKEN_PEPPER,
    APP_ENCRYPTION_KEY: process.env.APP_ENCRYPTION_KEY,
    MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
    MICROSOFT_TENANT_ID: process.env.MICROSOFT_TENANT_ID,
    MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
    REDIS_URL: process.env.REDIS_URL,
  } : {}),
});

let envData: any = parseResult.success ? parseResult.data : null;

if (!parseResult.success) {
  if (process.env.NEXT_PHASE === 'phase-production-build' || process.env.SKIP_ENV_VALIDATION === 'true') {
    console.warn('⚠️ Environment validation failed during build time. Bypassing validation to allow compilation.');
    envData = {
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'dummy',
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || 'dummy',
      DATABASE_URL: process.env.DATABASE_URL,
      EMAIL_MODE: (process.env.EMAIL_MODE as any) || 'log',
      EMAIL_FROM: process.env.EMAIL_FROM || 'BlueMargin <offres@example.com>',
      AI_MODE: (process.env.AI_MODE as any) || 'heuristic',
      PUBLIC_QUOTE_TOKEN_PEPPER: process.env.PUBLIC_QUOTE_TOKEN_PEPPER || 'dummy',
      APP_ENCRYPTION_KEY: process.env.APP_ENCRYPTION_KEY || 'dummy',
    };
  } else {
    const errors = parseResult.error.flatten().fieldErrors;
    console.error('❌ Invalid environment variables:', errors);
    throw new Error(`Invalid environment variables: ${JSON.stringify(errors)}`);
  }
}

export const env = envData as z.infer<typeof clientSchema> & Partial<z.infer<typeof serverSchema>>;
export type Env = typeof env;
