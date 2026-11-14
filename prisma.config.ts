import { existsSync } from "node:fs";

import { defineConfig } from "prisma/config";

// Prisma 7 doesn't read .env by itself. Load it when present. Variables already
// set in the shell (or by a hosting platform) take precedence over the file.
if (existsSync(".env")) process.loadEnvFile(".env");

// `npm run db:test:prepare` sets PRISMA_USE_TEST_DB=1 to apply migrations to the
// test database instead of the dev database.
const useTestDb = process.env.PRISMA_USE_TEST_DB === "1";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // Read process.env directly (not Prisma's env() helper, which throws when
    // unset) so `prisma generate` works without a database URL, e.g. in CI.
    url: useTestDb ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL,
  },
});
