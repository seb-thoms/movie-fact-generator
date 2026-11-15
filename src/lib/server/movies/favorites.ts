import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { FavoriteMovie } from "@/lib/shared/api";
import { normalizeTitle, toDisplayTitle } from "@/lib/shared/movies";
import type { FavoriteMovieInput } from "@/lib/shared/schemas";

import { db } from "../db";
import { AppError } from "../errors";

const favoriteMovieSelect = { id: true, title: true, releaseYear: true, status: true } as const;

type MovieKey = { normalizedTitle: string; releaseYear: number | null };
type StoredFavorite = FavoriteMovie & { normalizedTitle: string };
type FavoriteResult = { movie: FavoriteMovie; created: boolean };

/** The user's favorite movie, or null (SPEC §11). Always scoped to `userId`. */
export async function getFavoriteMovie(userId: string): Promise<FavoriteMovie | null> {
  const favorite = await db.userFavoriteMovie.findFirst({
    where: { userId },
    select: { movie: { select: favoriteMovieSelect } },
  });
  return favorite?.movie ?? null;
}

/**
 * POST /api/me/favorite-movies (SPEC §9): create-only.
 * - Same movie as the existing favorite → idempotent (created: false → 200).
 * - A different movie → 409 FAVORITE_EXISTS.
 * - Otherwise find-or-create the movie and link it, in one transaction.
 * No OpenAI call: recognition is learned later from the first fact request.
 */
export async function addFavoriteMovie(
  userId: string,
  input: FavoriteMovieInput,
): Promise<FavoriteResult> {
  const key = movieKey(input);

  const existing = await findStoredFavorite(userId);
  if (existing) return resolveAgainstExisting(existing, key);

  try {
    const movie = await db.$transaction(async (tx) => {
      const movie = await findOrCreateMovie(tx, input);
      await tx.userFavoriteMovie.create({ data: { userId, movieId: movie.id } });
      return movie;
    });
    return { movie, created: true };
  } catch (error) {
    // A concurrent submit by the same user won the race: the favorite's unique
    // constraint rejected ours and rolled back the whole transaction (including
    // any movie row we inserted). Answer as if we'd arrived second.
    if (!isUniqueViolation(error)) throw error;
    const winner = await findStoredFavorite(userId);
    if (!winner) throw error;
    return resolveAgainstExisting(winner, key);
  }
}

/**
 * PUT /api/me/favorite-movie (SPEC §9.1): set or replace the favorite.
 * created: true (201) when the user had none; otherwise false (200).
 * Old fact history is kept: deliveries belong to the old movie, not the link.
 */
export async function setFavoriteMovie(
  userId: string,
  input: FavoriteMovieInput,
): Promise<FavoriteResult> {
  return db.$transaction(async (tx) => {
    // Per-user lock: concurrent edits by the same user wait here and run one at
    // a time, so the last to commit wins and two favorites can never collide.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`;
    if (locked.length === 0) {
      throw new AppError("UNAUTHENTICATED", 401, "Please sign in to continue.");
    }

    const previous = await tx.userFavoriteMovie.findFirst({
      where: { userId },
      select: { movieId: true },
    });
    const movie = await findOrCreateMovie(tx, input);

    if (previous?.movieId !== movie.id) {
      if (previous) await tx.userFavoriteMovie.deleteMany({ where: { userId } });
      await tx.userFavoriteMovie.create({ data: { userId, movieId: movie.id } });
    }
    return { movie, created: previous === null };
  });
}

/**
 * Race-safe find-or-create (CLAUDE.md): createMany + skipDuplicates compiles to
 * INSERT … ON CONFLICT DO NOTHING (no conflict target, so it covers both the
 * (title, year) index and the no-year partial index); then select the row.
 * New movies start PENDING; an existing movie keeps its status and title.
 */
async function findOrCreateMovie(
  tx: Prisma.TransactionClient,
  input: FavoriteMovieInput,
): Promise<FavoriteMovie> {
  const key = movieKey(input);
  await tx.movie.createMany({
    data: [{ ...key, title: toDisplayTitle(input.title) }],
    skipDuplicates: true,
  });
  // findFirst, not findUnique: the year can be null, which Prisma's compound
  // unique lookup doesn't accept. The two unique indexes still allow one match.
  return tx.movie.findFirstOrThrow({ where: key, select: favoriteMovieSelect });
}

function movieKey(input: FavoriteMovieInput): MovieKey {
  return { normalizedTitle: normalizeTitle(input.title), releaseYear: input.releaseYear };
}

async function findStoredFavorite(userId: string): Promise<StoredFavorite | null> {
  const favorite = await db.userFavoriteMovie.findFirst({
    where: { userId },
    select: { movie: { select: { ...favoriteMovieSelect, normalizedTitle: true } } },
  });
  return favorite?.movie ?? null;
}

function resolveAgainstExisting(existing: StoredFavorite, key: MovieKey): FavoriteResult {
  const isSameMovie =
    existing.normalizedTitle === key.normalizedTitle && existing.releaseYear === key.releaseYear;
  if (!isSameMovie) {
    throw new AppError("FAVORITE_EXISTS", 409, "You've already picked a favorite movie.");
  }
  const { normalizedTitle: _key, ...movie } = existing;
  return { movie, created: false };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
