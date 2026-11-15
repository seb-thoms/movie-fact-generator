import "server-only";

import { db } from "../db";

/** Whether this user has finished onboarding, i.e. picked a favorite movie. */
export async function hasFavoriteMovie(userId: string): Promise<boolean> {
  const favorite = await db.userFavoriteMovie.findFirst({
    where: { userId },
    select: { movieId: true },
  });
  return favorite !== null;
}
