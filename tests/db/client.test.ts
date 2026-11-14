import { afterAll, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/server/db";

afterAll(() => db.$disconnect());

describe("db client", () => {
  it("is cached on globalThis outside production", () => {
    const globalForPrisma = globalThis as unknown as { prisma?: unknown };

    expect(globalForPrisma.prisma).toBe(db);
  });

  it("returns the same client when the module is re-evaluated (as on a dev hot reload)", async () => {
    vi.resetModules();
    const { db: reloaded } = await import("@/lib/server/db");

    expect(reloaded).toBe(db);
  });

  it("can query the database", async () => {
    const [row] = await db.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;

    expect(row?.ok).toBe(1);
  });
});
