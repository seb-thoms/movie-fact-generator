import { toErrorResponse } from "@/lib/server/errors";
import { searchVerifiedMovies } from "@/lib/server/movies/search";
import { requireUser } from "@/lib/server/session";
import { parseOrThrow } from "@/lib/server/validation";
import type { MovieSearchResponse } from "@/lib/shared/api";
import { searchQuerySchema } from "@/lib/shared/schemas";

// GET /api/movies/search?q=du: autocomplete suggestions (SPEC §6).
export async function GET(request: Request): Promise<Response> {
  try {
    await requireUser();
    const { q } = parseOrThrow(searchQuerySchema, {
      q: new URL(request.url).searchParams.get("q") ?? undefined,
    });
    const body: MovieSearchResponse = { movies: await searchVerifiedMovies(q) };
    return Response.json(body);
  } catch (error) {
    return toErrorResponse(error);
  }
}
