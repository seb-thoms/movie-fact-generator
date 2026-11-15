import { toErrorResponse } from "@/lib/server/errors";
import { addFavoriteMovie } from "@/lib/server/movies/onboarding";
import { requireUser } from "@/lib/server/session";
import { parseOrThrow, readJsonBody } from "@/lib/server/validation";
import type { FavoriteMovieResponse } from "@/lib/shared/api";
import { favoriteMovieInputSchema } from "@/lib/shared/schemas";

// POST /api/me/favorite-movies: onboarding (SPEC §6, §9).
// 201 created, 200 same movie again (idempotent), 409 a different favorite exists.
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const input = parseOrThrow(favoriteMovieInputSchema, await readJsonBody(request));
    const { movie, created } = await addFavoriteMovie(user.id, input);
    const body: FavoriteMovieResponse = { movie };
    return Response.json(body, { status: created ? 201 : 200 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
