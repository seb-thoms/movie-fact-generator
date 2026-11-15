// Maps a GET /api/movies/:movieId/fact response to what the fact panel shows
// (SPEC §11). Pure, so every state is unit-tested without a browser.
import { z } from "zod";

export type FactView =
  | { kind: "loading" }
  | { kind: "fact"; content: string; stale: boolean }
  | { kind: "notRecognized" }
  | { kind: "unavailable" }
  | { kind: "signedOut" }
  | { kind: "favoriteChanged" };

// Validate even our own API's body: a malformed response shows "unavailable"
// instead of crashing the panel.
const factBodySchema = z.object({
  fact: z.object({ content: z.string() }),
  stale: z.boolean(),
});
const errorBodySchema = z.object({ error: z.object({ code: z.string() }) });

export function toFactView(status: number, body: unknown): FactView {
  if (status === 200) {
    const parsed = factBodySchema.safeParse(body);
    return parsed.success
      ? { kind: "fact", content: parsed.data.fact.content, stale: parsed.data.stale }
      : { kind: "unavailable" };
  }
  if (status === 401) return { kind: "signedOut" };
  // 404: the movie isn't the user's favorite anymore (changed in another tab).
  if (status === 404) return { kind: "favoriteChanged" };

  const code = errorBodySchema.safeParse(body).data?.error.code;
  if (status === 422 && code === "MOVIE_NOT_RECOGNIZED") return { kind: "notRecognized" };
  return { kind: "unavailable" };
}
