import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv as parseDotenv } from "node:util";

import { defineConfig } from "vitest/config";

/**
 * Tests talk to the real Postgres test database and never to real external
 * services. Build the test environment explicitly:
 * - DATABASE_URL comes ONLY from TEST_DATABASE_URL (shell first, then .env), so
 *   tests can never touch the dev database.
 * - Secrets get obvious dummy values, so a test can't accidentally call Google
 *   or OpenAI with real credentials.
 */
function readTestDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const dotenvPath = fileURLToPath(new URL("./.env", import.meta.url));
  const fromFile = existsSync(dotenvPath)
    ? parseDotenv(readFileSync(dotenvPath, "utf8")).TEST_DATABASE_URL
    : undefined;
  if (!fromFile) {
    throw new Error("TEST_DATABASE_URL is not set (in the shell or in .env). See .env.example.");
  }
  return fromFile;
}

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // The real "server-only" package throws when imported outside a React
      // Server Component build. Tests run server code directly in Node, so swap
      // it for an empty module. Next.js builds still use the real guard.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // All test files share one database and truncate it between tests, so they
    // must not run at the same time.
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: readTestDatabaseUrl(),
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-1234",
      BETTER_AUTH_URL: "http://localhost:3000",
      GOOGLE_CLIENT_ID: "test-google-client-id",
      GOOGLE_CLIENT_SECRET: "test-google-client-secret",
      OPENAI_API_KEY: "test-openai-key-never-used",
      FACT_STRATEGY: "generate",
      FACT_POOL_SIZE: "10",
    },
  },
});
