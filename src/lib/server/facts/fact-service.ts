import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma, type MovieStatus } from "@/generated/prisma/client";
import type { FactSource } from "@/lib/shared/api";

import { db } from "../db";
import { AppError } from "../errors";
import {
  GENERATION_DEADLINE_MS,
  LOST_LEASE_POLL_INTERVAL_MS,
  LOST_LEASE_POLL_MAX_MS,
} from "./constants";
import type { FactGenerator, FactResult } from "./fact-generator";
import {
  countMovieFacts,
  findFreshDelivery,
  findLatestFactForVerifiedMovie,
  findLatestUserFact,
  findLeastRecentlySeenFact,
  findOldestUnseenFact,
  type StoredFact,
} from "./fact-queries";
import { releaseLease, tryAcquireLease } from "./lease";

export type FactOutcome = { fact: StoredFact; source: FactSource };

export type FactServiceOptions = {
  generator: FactGenerator;
  strategy: "generate" | "pool";
  poolSize: number;
  /** Overridable so tests run fast; production uses the SPEC §7.1 values. */
  deadlineMs?: number;
  pollIntervalMs?: number;
  pollMaxMs?: number;
};

type FavoriteMovie = { id: string; title: string; releaseYear: number | null; status: MovieStatus };

const MAX_MOVIE_ID_LENGTH = 100;

/**
 * GET /api/movies/:movieId/fact (SPEC §7.2). `userId` comes from the session.
 *
 *  1. Authorize: the movie must be this user's favorite (else 404);
 *     a NOT_RECOGNIZED movie is a 422 with no API call.
 *  2. Cache: the user's own delivery from the last 60 s (DB clock).
 *  3. Lease: one atomic statement decides who may generate.
 *  4. Lost it: poll the cache briefly, then fall back.
 *  5. Won it: re-check the cache, then produce a fact; always release.
 * No transaction is held open during the OpenAI call.
 */
export async function getFactForUser(
  userId: string,
  movieId: string,
  options: FactServiceOptions,
): Promise<FactOutcome> {
  const movie = await findFavoriteMovie(userId, movieId);
  if (movie.status === "NOT_RECOGNIZED") throw movieNotRecognized();

  const cached = await findFreshDelivery(userId, movieId);
  if (cached) return { fact: cached, source: "cache" };

  const holderId = randomUUID();
  if (!(await tryAcquireLease(userId, movieId, holderId))) {
    return waitForOtherRequest(userId, movie, options);
  }

  try {
    // Another request may have finished between our cache check and our lease.
    const justDelivered = await findFreshDelivery(userId, movieId);
    if (justDelivered) return { fact: justDelivered, source: "cache" };

    // Pool only for VERIFIED movies; an unconfirmed movie always generates.
    if (options.strategy === "pool" && movie.status === "VERIFIED") {
      return await serveFromPool(userId, movie, options);
    }
    return await generateFact(userId, movie, options);
  } finally {
    await releaseLease(userId, movieId, holderId);
  }
}

/** Step 1: ownership check. Anything the user can't access is a 404, never a 403. */
async function findFavoriteMovie(userId: string, movieId: string): Promise<FavoriteMovie> {
  if (movieId.length === 0 || movieId.length > MAX_MOVIE_ID_LENGTH) throw notFound();
  const favorite = await db.userFavoriteMovie.findUnique({
    where: { userId_movieId: { userId, movieId } },
    select: { movie: { select: { id: true, title: true, releaseYear: true, status: true } } },
  });
  if (!favorite) throw notFound();
  return favorite.movie;
}

/** Step 4: another request holds the lease. Poll for its result, then fall back. */
async function waitForOtherRequest(
  userId: string,
  movie: FavoriteMovie,
  options: FactServiceOptions,
): Promise<FactOutcome> {
  const interval = options.pollIntervalMs ?? LOST_LEASE_POLL_INTERVAL_MS;
  const giveUpAt = Date.now() + (options.pollMaxMs ?? LOST_LEASE_POLL_MAX_MS);
  while (Date.now() < giveUpAt) {
    await sleep(interval);
    const delivered = await findFreshDelivery(userId, movie.id);
    if (delivered) return { fact: delivered, source: "cache" };
  }
  return fallback(userId, movie.id);
}

/**
 * Step 6, pool strategy (SPEC §7.2): reuse facts other users already paid for.
 *  1. The oldest fact this user hasn't seen → deliver it, no API call.
 *  2. Fewer than FACT_POOL_SIZE facts → generate a new one.
 *  3. Otherwise (seen them all) → the one this user saw longest ago.
 */
async function serveFromPool(
  userId: string,
  movie: FavoriteMovie,
  options: FactServiceOptions,
): Promise<FactOutcome> {
  const unseen = await findOldestUnseenFact(userId, movie.id);
  if (unseen) return deliverExistingFact(userId, movie.id, unseen);

  if ((await countMovieFacts(movie.id)) < options.poolSize) {
    return generateFact(userId, movie, options);
  }

  const leastRecent = await findLeastRecentlySeenFact(userId, movie.id);
  if (leastRecent) return deliverExistingFact(userId, movie.id, leastRecent);
  return generateFact(userId, movie, options); // unreachable in practice: a full pool was seen
}

/** SPEC §7.3: delivering an existing fact records a delivery (it starts the 60 s cache). */
async function deliverExistingFact(
  userId: string,
  movieId: string,
  fact: StoredFact,
): Promise<FactOutcome> {
  try {
    await db.factDelivery.create({ data: { userId, movieId, movieFactId: fact.id } });
  } catch (error) {
    throw userDeletedOr(error, movieId);
  }
  return { fact, source: "pool" };
}

/** Steps 6-7: call the generator (outside any transaction) and handle its answer. */
async function generateFact(
  userId: string,
  movie: FavoriteMovie,
  options: FactServiceOptions,
): Promise<FactOutcome> {
  let result: FactResult;
  try {
    result = await options.generator.generate({
      title: movie.title,
      releaseYear: movie.releaseYear,
      signal: AbortSignal.timeout(options.deadlineMs ?? GENERATION_DEADLINE_MS),
    });
  } catch (error) {
    // Timeout, API error, invalid output, or moderation flag (SPEC §7.2 step 7).
    console.warn({
      event: "fact_generation_failed",
      movieId: movie.id,
      errorClass: error instanceof Error ? error.constructor.name : typeof error,
    });
    return fallback(userId, movie.id);
  }

  if (!result.found) return handleNotFound(userId, movie);

  try {
    const fact = await saveGeneratedFact(userId, movie.id, result.fact, result.model);
    return { fact, source: "generated" };
  } catch (error) {
    throw userDeletedOr(error, movie.id);
  }
}

/**
 * SPEC §7.5: if the user was deleted mid-request, the delivery's foreign key
 * fails (Prisma P2003) and the transaction rolls back. Catch exactly that,
 * log it, and answer 401; any other error is rethrown unchanged.
 */
function userDeletedOr(error: unknown, movieId: string): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
    console.warn({ event: "fact_discarded_user_deleted", movieId });
    return new AppError("UNAUTHENTICATED", 401, "Please sign in to continue.");
  }
  return error;
}

/**
 * found: false. For a PENDING movie it means "not recognized" (422). For a
 * VERIFIED movie the model is being inconsistent, so it's a failure (fallback).
 * The status change is conditional, so it can't overwrite a concurrent VERIFIED.
 */
async function handleNotFound(userId: string, movie: FavoriteMovie): Promise<FactOutcome> {
  if (movie.status === "VERIFIED") return fallback(userId, movie.id);

  const changed = await db.$executeRaw`
    UPDATE "Movie" SET status = 'NOT_RECOGNIZED', "statusUpdatedAt" = now()
    WHERE id = ${movie.id} AND status = 'PENDING'`;
  if (changed === 1) throw movieNotRecognized();

  // 0 rows: a concurrent request changed the status first. Follow what it decided.
  const current = await db.movie.findUniqueOrThrow({
    where: { id: movie.id },
    select: { status: true },
  });
  if (current.status === "VERIFIED") return fallback(userId, movie.id);
  throw movieNotRecognized();
}

/**
 * In one transaction: the fact, the user's delivery, and the move to VERIFIED.
 * VERIFIED is never downgraded and wins over NOT_RECOGNIZED (SPEC §3.3 notes).
 */
async function saveGeneratedFact(
  userId: string,
  movieId: string,
  content: string,
  model: string,
): Promise<StoredFact> {
  return db.$transaction(async (tx) => {
    const fact = await tx.movieFact.create({
      data: { movieId, content, model },
      select: { id: true, content: true, createdAt: true },
    });
    await tx.factDelivery.create({ data: { userId, movieId, movieFactId: fact.id } });
    await tx.$executeRaw`
      UPDATE "Movie" SET status = 'VERIFIED', "statusUpdatedAt" = now()
      WHERE id = ${movieId} AND status IN ('PENDING', 'NOT_RECOGNIZED')`;
    return fact;
  });
}

/**
 * SPEC §7.4: the user's own latest fact, then the newest fact for a VERIFIED
 * movie from anyone, else 503. Serving a fallback records no delivery.
 */
async function fallback(userId: string, movieId: string): Promise<FactOutcome> {
  const fact =
    (await findLatestUserFact(userId, movieId)) ?? (await findLatestFactForVerifiedMovie(movieId));
  if (!fact) {
    throw new AppError(
      "FACT_UNAVAILABLE",
      503,
      "We couldn't get a fact right now. Please try again in a moment.",
    );
  }
  return { fact, source: "fallback" };
}

function notFound(): AppError {
  return new AppError("NOT_FOUND", 404, "We couldn't find that movie.");
}

function movieNotRecognized(): AppError {
  return new AppError("MOVIE_NOT_RECOGNIZED", 422, "We couldn't find any facts about that movie.");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
