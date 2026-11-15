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
export type MovieSearchResult = { id: string; title: string; releaseYear: number };
export type MovieSearchResponse = { movies: MovieSearchResult[] };
