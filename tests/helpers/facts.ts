import type { MovieStatus } from "@/generated/prisma/client";

import { db } from "./db";

/** A movie with the given status (title doubles as the normalized key). */
export function createMovieWithStatus(
  title: string,
  releaseYear: number | null,
  status: MovieStatus,
) {
  return db.movie.create({
    data: { title, normalizedTitle: title.toLowerCase(), releaseYear, status },
  });
}

/** Makes `movieId` the user's favorite. */
export function favorite(userId: string, movieId: string) {
  return db.userFavoriteMovie.create({ data: { userId, movieId } });
}

/** Inserts a MovieFact created `secondsAgo` seconds ago by the DB clock. */
export async function createFactAgo(movieId: string, content: string, secondsAgo = 0) {
  const [row] = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO "MovieFact" (id, "movieId", content, model, "createdAt")
    VALUES (gen_random_uuid()::text, ${movieId}, ${content}, 'test-model',
            now() - make_interval(secs => ${secondsAgo}))
    RETURNING id`;
  if (!row) throw new Error("insert failed");
  return row.id;
}

/**
 * Records that `userId` was shown `factId`, `secondsAgo` seconds ago by the DB
 * clock. This is how tests control time: backdated rows, never fake timers.
 */
export async function deliverAgo(
  userId: string,
  movieId: string,
  factId: string,
  secondsAgo: number,
) {
  await db.$executeRaw`
    INSERT INTO "FactDelivery" (id, "userId", "movieId", "movieFactId", "deliveredAt")
    VALUES (gen_random_uuid()::text, ${userId}, ${movieId}, ${factId},
            now() - make_interval(secs => ${secondsAgo}))`;
}
