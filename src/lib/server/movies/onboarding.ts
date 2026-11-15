import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { FavoriteMovie } from "@/lib/shared/api";
import { normalizeTitle, toDisplayTitle } from "@/lib/shared/movies";
import type { FavoriteMovieInput } from "@/lib/shared/schemas";

import { db } from "../db";
import { AppError } from "../errors";

const favoriteMovieSelect = { id: true, title: true, releaseYear: true, status: true } as const;

type StoredFavorite = FavoriteMovie & { normalizedTitle: string };

/**
 * Onboarding (SPEC §9): set the user's one favorite movie.
 * - Same movie as the existing favorite → idempotent (created: false → 200).
 * - A different movie → 409 FAVORITE_EXISTS.
 * - Otherwise find-or-create the shared Movie (new ones start PENDING) and
 *   link it, in one transaction.
 * No OpenAI call: recognition is learned later from the first fact request.
 */
export async function addFavoriteMovie(
  userId: string,
  input: FavoriteMovieInput,
): Promise<{ movie: FavoriteMovie; created: boolean }> {
  const normalizedTitle = normalizeTitle(input.title);
  const target = { normalizedTitle, releaseYear: input.releaseYear };

  const existing = await findFavorite(userId);
  if (existing) return resolveAgainstExisting(existing, target);

  try {
    const movie = await db.$transaction(async (tx) => {
      // Race-safe find-or-create: createMany + skipDuplicates compiles to
      // INSERT … ON CONFLICT DO NOTHING, so concurrent creators of the same
      // movie never fail; then select whichever row exists.
      await tx.movie.createMany({
        data: [{ ...target, title: toDisplayTitle(input.title) }],
        skipDuplicates: true,
      });
      // findFirst, not findUnique: the year can be null, and "null" isn't a
      // value Prisma's compound unique lookup accepts. The where still matches
      // exactly one row (both unique indexes guarantee it).
      const movie = await tx.movie.findFirstOrThrow({
        where: target,
        select: favoriteMovieSelect,
      });
      await tx.userFavoriteMovie.create({ data: { userId, movieId: movie.id } });
      return movie;
    });
    return { movie, created: true };
  } catch (error) {
    // A concurrent submit by the same user won the race: the favorite's unique
    // constraint rejected ours and rolled back the whole transaction (including
    // any movie row we inserted). Answer as if we'd arrived second.
    if (!isUniqueViolation(error)) throw error;
    const winner = await findFavorite(userId);
    if (!winner) throw error;
    return resolveAgainstExisting(winner, target);
  }
}

async function findFavorite(userId: string): Promise<StoredFavorite | null> {
  const favorite = await db.userFavoriteMovie.findFirst({
    where: { userId },
    select: { movie: { select: { ...favoriteMovieSelect, normalizedTitle: true } } },
  });
  return favorite?.movie ?? null;
}

function resolveAgainstExisting(
  existing: StoredFavorite,
  target: { normalizedTitle: string; releaseYear: number | null },
): { movie: FavoriteMovie; created: boolean } {
  const isSameMovie =
    existing.normalizedTitle === target.normalizedTitle &&
    existing.releaseYear === target.releaseYear;
  if (!isSameMovie) {
    throw new AppError("FAVORITE_EXISTS", 409, "You've already picked a favorite movie.");
  }
  const { normalizedTitle: _key, ...movie } = existing;
  return { movie, created: false };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
