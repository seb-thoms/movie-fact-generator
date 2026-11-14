import "server-only";

import { z } from "zod";

/**
 * Every environment variable the app reads (SPEC §15), validated once at startup.
 * Code imports `env` from here instead of reading `process.env` directly, so a
 * missing or malformed variable fails fast with a clear message instead of
 * surfacing later as a confusing runtime error.
 *
 * TEST_DATABASE_URL is deliberately absent: the app never reads it. The test
 * runner maps it onto DATABASE_URL (see vitest.config.mts).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.url(),

  BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  BETTER_AUTH_URL: z.url(),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),

  OPENAI_API_KEY: z.string().min(1),
  // Optional: the production FactGenerator supplies a default (SPEC §8).
  OPENAI_MODEL: z.string().min(1).optional(),

  FACT_STRATEGY: z.enum(["generate", "pool"]).default("generate"),
  // Env values are always strings, so coerce "10" → 10 before validating.
  FACT_POOL_SIZE: z.coerce.number().int().positive().default(10),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parses a raw environment object. The error lists variable names and rule
 * violations only, never the values, so secrets can't leak into logs.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}

export const env: Env = parseEnv(process.env);
