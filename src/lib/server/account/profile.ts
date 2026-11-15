import "server-only";

import type { MeResponse } from "@/lib/shared/api";

import { getFavoriteMovie } from "../movies/favorites";
import type { SessionUser } from "../session";

/** The signed-in user's profile and favorites (SPEC §6), scoped to that user. */
export async function getProfile(user: SessionUser): Promise<MeResponse> {
  const favorite = await getFavoriteMovie(user.id);
  return {
    user: { id: user.id, name: user.name, email: user.email, image: user.image },
    favoriteMovies: favorite ? [favorite] : [],
  };
}
