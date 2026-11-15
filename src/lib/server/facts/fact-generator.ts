import "server-only";

/**
 * What a fact source needs: only the movie's display title and release year
 * (SPEC §8: no personal data ever goes to the model), plus an AbortSignal that
 * carries the overall generation deadline.
 */
export type FactRequest = { title: string; releaseYear: number; signal: AbortSignal };

/**
 * `found: false` means the model didn't recognize a film with that title and
 * year. The union makes `fact` a string exactly when `found` is true.
 */
export type FactResult =
  { found: true; fact: string; model: string } | { found: false; fact: null; model: string };

/**
 * Produces a fun fact about a movie (SPEC §8). The production implementation
 * wraps OpenAI (step 4); tests inject a fake.
 *
 * Contract: resolves with a valid FactResult, or REJECTS on any failure
 * (timeout or abort, API error, invalid output, moderation flag). Callers treat
 * every rejection as a generation failure and use the fallback order (SPEC §7.4).
 */
export interface FactGenerator {
  generate(request: FactRequest): Promise<FactResult>;
}
