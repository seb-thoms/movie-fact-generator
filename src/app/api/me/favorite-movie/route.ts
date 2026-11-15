import { toErrorResponse } from "@/lib/server/errors";
import { setFavoriteMovie } from "@/lib/server/movies/favorites";
import { requireUser } from "@/lib/server/session";
import { parseOrThrow, readJsonBody } from "@/lib/server/validation";
import type { FavoriteMovieResponse } from "@/lib/shared/api";
import { favoriteMovieInputSchema } from "@/lib/shared/schemas";

// PUT /api/me/favorite-movie: set or replace the favorite (SPEC §6, §9.1).
// 201 when there was no favorite, 200 when replaced or unchanged.
export async function PUT(request: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const input = parseOrThrow(favoriteMovieInputSchema, await readJsonBody(request));
    const { movie, created } = await setFavoriteMovie(user.id, input);
    const body: FavoriteMovieResponse = { movie };
    return Response.json(body, { status: created ? 201 : 200 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
