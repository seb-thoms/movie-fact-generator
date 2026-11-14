import { afterEach, describe, expect, it, vi } from "vitest";

const DEV_URL = "postgresql://dev-user@localhost:5432/dev_db";
const TEST_URL = "postgresql://dev-user@localhost:5432/dev_db_test";

/** Imports prisma.config.ts fresh, so it re-reads the stubbed environment. */
async function loadPrismaConfig(useTestDb: string | undefined) {
  vi.stubEnv("DATABASE_URL", DEV_URL);
  vi.stubEnv("TEST_DATABASE_URL", TEST_URL);
  vi.stubEnv("PRISMA_USE_TEST_DB", useTestDb);
  vi.resetModules();
  const { default: config } = await import("../prisma.config");
  return config;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("prisma.config.ts", () => {
  it("points Prisma CLI commands at DATABASE_URL by default", async () => {
    const config = await loadPrismaConfig(undefined);

    expect(config.datasource?.url).toBe(DEV_URL);
  });

  it("points at TEST_DATABASE_URL when PRISMA_USE_TEST_DB=1 (npm run db:test:prepare)", async () => {
    const config = await loadPrismaConfig("1");

    expect(config.datasource?.url).toBe(TEST_URL);
  });

  it("uses the schema and migrations folders under prisma/", async () => {
    const config = await loadPrismaConfig(undefined);

    expect(config.schema).toBe("prisma/schema.prisma");
    expect(config.migrations?.path).toBe("prisma/migrations");
  });
});
