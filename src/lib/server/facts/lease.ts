import "server-only";

import { db } from "../db";
import { LEASE_TTL_SECONDS } from "./constants";

/**
 * Tries to claim the right to generate a fact for (user, movie), SPEC §7.2 step 3.
 * One atomic statement, so Read Committed is enough:
 * - no lease row → INSERT succeeds → we hold it;
 * - a row exists → ON CONFLICT … DO UPDATE runs only if it has EXPIRED
 *   (lockedUntil < now()), taking it over;
 * - a live lease → the WHERE fails, nothing is returned → someone else holds it.
 * `now()` is the database clock, shared by every app server.
 */
export async function tryAcquireLease(
  userId: string,
  movieId: string,
  holderId: string,
): Promise<boolean> {
  const rows = await db.$queryRaw<{ holderId: string }[]>`
    INSERT INTO "FactGenerationLease" ("userId", "movieId", "holderId", "lockedUntil")
    VALUES (${userId}, ${movieId}, ${holderId}, now() + make_interval(secs => ${LEASE_TTL_SECONDS}))
    ON CONFLICT ("userId", "movieId") DO UPDATE
      SET "holderId" = EXCLUDED."holderId", "lockedUntil" = EXCLUDED."lockedUntil"
      WHERE "FactGenerationLease"."lockedUntil" < now()
    RETURNING "holderId"`;
  return rows[0]?.holderId === holderId;
}

/**
 * Releases the lease, but only if we still hold it (SPEC §7.2 step 8). If it
 * expired and someone else took it over, their lease is left alone.
 */
export async function releaseLease(
  userId: string,
  movieId: string,
  holderId: string,
): Promise<void> {
  await db.$executeRaw`
    DELETE FROM "FactGenerationLease"
    WHERE "userId" = ${userId} AND "movieId" = ${movieId} AND "holderId" = ${holderId}`;
}
