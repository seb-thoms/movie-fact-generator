import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { GENERATION_DEADLINE_MS, LEASE_TTL_SECONDS } from "@/lib/server/facts/constants";
import { releaseLease, tryAcquireLease } from "@/lib/server/facts/lease";

import { createMovie, createUser, db, resetDatabase } from "../helpers/db";

let userId: string;
let movieId: string;

beforeEach(async () => {
  await resetDatabase();
  userId = await createUser("u1");
  movieId = (await createMovie("dune", 2021)).id;
});
afterAll(() => db.$disconnect());

async function leaseRow() {
  return db.factGenerationLease.findUnique({ where: { userId_movieId: { userId, movieId } } });
}

describe("generation lease (SPEC §7.2 steps 3 and 8)", () => {
  it("is acquired when nobody holds it, expiring LEASE_TTL_SECONDS from now (DB clock)", async () => {
    expect(await tryAcquireLease(userId, movieId, "holder-a")).toBe(true);

    const [row] = await db.$queryRaw<{ secondsLeft: number }[]>`
      SELECT EXTRACT(EPOCH FROM ("lockedUntil" - now()))::float AS "secondsLeft"
      FROM "FactGenerationLease" WHERE "userId" = ${userId} AND "movieId" = ${movieId}`;
    expect(row?.secondsLeft).toBeGreaterThan(LEASE_TTL_SECONDS - 2);
    expect(row?.secondsLeft).toBeLessThanOrEqual(LEASE_TTL_SECONDS);
  });

  it("can't be taken while another holder's lease is live", async () => {
    await tryAcquireLease(userId, movieId, "holder-a");

    expect(await tryAcquireLease(userId, movieId, "holder-b")).toBe(false);
    expect((await leaseRow())?.holderId).toBe("holder-a");
  });

  it("can be taken over once it has expired (e.g. the holder crashed)", async () => {
    await db.$executeRaw`
      INSERT INTO "FactGenerationLease" ("userId", "movieId", "holderId", "lockedUntil")
      VALUES (${userId}, ${movieId}, 'crashed-holder', now() - interval '1 second')`;

    expect(await tryAcquireLease(userId, movieId, "holder-b")).toBe(true);
    expect((await leaseRow())?.holderId).toBe("holder-b");
  });

  it("is per user and movie: another user's lease doesn't block", async () => {
    const otherUser = await createUser("u2");
    await tryAcquireLease(otherUser, movieId, "holder-a");

    expect(await tryAcquireLease(userId, movieId, "holder-b")).toBe(true);
  });

  it("is released by its holder", async () => {
    await tryAcquireLease(userId, movieId, "holder-a");

    await releaseLease(userId, movieId, "holder-a");

    expect(await leaseRow()).toBeNull();
  });

  it("is never released by anyone but its holder", async () => {
    await tryAcquireLease(userId, movieId, "holder-a");

    await releaseLease(userId, movieId, "holder-b");

    expect((await leaseRow())?.holderId).toBe("holder-a");
  });

  it("outlives the generation deadline, so it can't expire mid-generation (SPEC §7.1)", () => {
    expect(LEASE_TTL_SECONDS * 1000).toBeGreaterThan(GENERATION_DEADLINE_MS);
  });
});
