// Title handling shared by the server and the browser (SPEC §4.1).

/**
 * The comparison key that identifies a movie (with its release year):
 * "Dune: Part Two" → "dune part two", "Amélie" → "amelie".
 *  1. NFKD: split accented letters into letter + accent, and expand
 *     compatibility characters ("ﬁ" → "fi", "Ⅻ" → "XII").
 *  2. Strip combining marks (the separated accents).
 *  3. Lowercase.
 *  4. Anything that isn't a letter or number (in any script) becomes a space.
 *     This also removes SQL LIKE wildcards (% and _).
 *  5. Collapse whitespace and trim.
 */
export function normalizeTitle(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The form we show: as entered, with whitespace trimmed and collapsed. */
export function toDisplayTitle(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}
