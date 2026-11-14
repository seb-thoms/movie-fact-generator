import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createUser, db, resetDatabase } from "../helpers/db";

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

function inOneHour(): Date {
  return new Date(Date.now() + 60 * 60 * 1000);
}

describe("session and account tables", () => {
  it("rejects two sessions with the same token", async () => {
    const userId = await createUser("u1");
    const session = { userId, token: "same-token", expiresAt: inOneHour() };
    await db.session.create({ data: { id: "s1", ...session } });

    await expect(db.session.create({ data: { id: "s2", ...session } })).rejects.toMatchObject({
      code: "P2002",
    });
  });

  it("removes a user's sessions and Google account link when the user is deleted", async () => {
    // Account deletion (SPEC §12) relies on these cascades to log the user
    // out everywhere and drop their stored OAuth tokens.
    const userId = await createUser("u1");
    await db.session.create({
      data: { id: "s1", userId, token: "t1", expiresAt: inOneHour() },
    });
    await db.account.create({
      data: { id: "a1", userId, accountId: "google-sub-123", providerId: "google" },
    });

    await db.user.delete({ where: { id: userId } });

    expect(await db.session.count()).toBe(0);
    expect(await db.account.count()).toBe(0);
  });
});

describe("schema-wide rules", () => {
  it("stores every timestamp column as timestamptz", async () => {
    const plainTimestamps = await db.$queryRaw<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name <> '_prisma_migrations'
        AND data_type = 'timestamp without time zone'`;

    expect(plainTimestamps).toEqual([]);
  });
});
