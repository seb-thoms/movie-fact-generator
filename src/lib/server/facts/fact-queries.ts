import "server-only";

import { db } from "../db";
import { CACHE_WINDOW_SECONDS } from "./constants";

/** A stored fact as the fact service returns it. */
export type StoredFact = { id: string; content: string; createdAt: Date };

/**
 * The user's own delivery for this movie from the last 60 seconds, if any
 * (SPEC §7.2 step 2). The age check runs in SQL against the database clock.
 */
export async function findFreshDelivery(
  userId: string,
  movieId: string,
): Promise<StoredFact | null> {
  const rows = await db.$queryRaw<StoredFact[]>`
    SELECT f.id, f.content, f."createdAt"
    FROM "FactDelivery" d
    JOIN "MovieFact" f ON f.id = d."movieFactId"
    WHERE d."userId" = ${userId} AND d."movieId" = ${movieId}
      AND d."deliveredAt" > now() - make_interval(secs => ${CACHE_WINDOW_SECONDS})
    ORDER BY d."deliveredAt" DESC
    LIMIT 1`;
  return rows[0] ?? null;
}

/** Fallback 1 (SPEC §7.4): the user's most recent delivery for this movie, any age. */
export async function findLatestUserFact(
  userId: string,
  movieId: string,
): Promise<StoredFact | null> {
  const delivery = await db.factDelivery.findFirst({
    where: { userId, movieId },
    orderBy: { deliveredAt: "desc" },
    select: { movieFact: { select: { id: true, content: true, createdAt: true } } },
  });
  return delivery?.movieFact ?? null;
}

/**
 * Fallback 2 (SPEC §7.4): the newest fact for this movie from ANY user, only
 * for a VERIFIED movie, so facts for an unconfirmed title are never shared.
 */
export async function findLatestFactForVerifiedMovie(movieId: string): Promise<StoredFact | null> {
  return db.movieFact.findFirst({
    where: { movieId, movie: { status: "VERIFIED" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, content: true, createdAt: true },
  });
}

/** Pool step 1: the oldest fact for this movie that this user has never been shown. */
export async function findOldestUnseenFact(
  userId: string,
  movieId: string,
): Promise<StoredFact | null> {
  return db.movieFact.findFirst({
    where: { movieId, deliveries: { none: { userId } } },
    orderBy: { createdAt: "asc" },
    select: { id: true, content: true, createdAt: true },
  });
}

/** Pool step 2: how many facts exist for this movie (all users). */
export async function countMovieFacts(movieId: string): Promise<number> {
  return db.movieFact.count({ where: { movieId } });
}

/**
 * Pool step 3: the fact this user saw longest ago, judged by their MOST RECENT
 * viewing of each fact (a fact seen long ago but again yesterday is "recent").
 */
export async function findLeastRecentlySeenFact(
  userId: string,
  movieId: string,
): Promise<StoredFact | null> {
  const rows = await db.$queryRaw<StoredFact[]>`
    SELECT f.id, f.content, f."createdAt"
    FROM "MovieFact" f
    JOIN (
      SELECT "movieFactId", max("deliveredAt") AS "lastSeenAt"
      FROM "FactDelivery"
      WHERE "userId" = ${userId} AND "movieId" = ${movieId}
      GROUP BY "movieFactId"
    ) seen ON seen."movieFactId" = f.id
    ORDER BY seen."lastSeenAt" ASC, f."createdAt" ASC
    LIMIT 1`;
  return rows[0] ?? null;
}
