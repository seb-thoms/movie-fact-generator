// API response shapes shared by route handlers and the browser (SPEC §6).

/** Error codes from the SPEC §6 API contract. */
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "FAVORITE_EXISTS"
  | "MOVIE_NOT_RECOGNIZED"
  | "FACT_UNAVAILABLE"
  | "BAD_CONFIRMATION"
  | "INTERNAL";

export type ValidationDetails = { fieldErrors: Record<string, string[]> };

/** The body of every error response. */
export type ApiErrorBody = {
  error: { code: ErrorCode; message: string; details?: ValidationDetails };
};

/** One autocomplete suggestion (GET /api/movies/search). */
export type MovieSearchResult = { id: string; title: string; releaseYear: number | null };
export type MovieSearchResponse = { movies: MovieSearchResult[] };

/** A user's favorite movie as the API returns it. */
export type FavoriteMovie = {
  id: string;
  title: string;
  releaseYear: number | null;
  status: "PENDING" | "VERIFIED" | "NOT_RECOGNIZED";
};
export type FavoriteMovieResponse = { movie: FavoriteMovie };

/** GET /api/movies/:movieId/fact (SPEC §6). `stale` is true exactly when source is "fallback". */
export type FactSource = "cache" | "generated" | "pool" | "fallback";
export type FactResponse = {
  fact: { id: string; content: string; createdAt: string };
  source: FactSource;
  stale: boolean;
};

/** GET /api/me (SPEC §6). A list, so multiple favorites can be added later. */
export type MeResponse = {
  user: { id: string; name: string; email: string; image: string | null };
  favoriteMovies: FavoriteMovie[];
};
