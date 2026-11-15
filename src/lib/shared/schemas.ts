// Zod schemas for request input (SPEC §4.2). Shared so the browser can reuse
// them for form hints; the server always re-validates.
import { z } from "zod";

import { normalizeTitle } from "./movies";

const FIRST_FILM_YEAR = 1888;
// Control characters (Cc: newline, tab, NUL…) and invisible format characters
// (Cf: right-to-left overrides, zero-width spaces). Titles are shown to other
// users, so text that displays differently from what it contains is rejected.
const CONTROL_OR_FORMAT_CHARACTER = /[\p{Cc}\p{Cf}]/u;

/** Latest accepted release year: announced films up to two years out. */
export function maxReleaseYear(): number {
  return new Date().getUTCFullYear() + 2;
}

const titleSchema = z
  .string({ error: "Enter a movie title." })
  .trim()
  .min(1, "Enter a movie title.")
  .max(100, "Titles can be at most 100 characters.")
  .refine((title) => !CONTROL_OR_FORMAT_CHARACTER.test(title), {
    message: "Titles can't contain line breaks or hidden characters.",
  })
  .refine((title) => normalizeTitle(title) !== "", {
    message: "Titles need at least one letter or number.",
  });

const releaseYearSchema = z
  .number({ error: "Enter the release year as a number." })
  .int("Enter a whole year, like 2021.")
  .min(FIRST_FILM_YEAR, `Movies start in ${FIRST_FILM_YEAR}.`)
  .refine((year) => year <= maxReleaseYear(), {
    message: "That year is too far in the future.",
  });

export const favoriteMovieInputSchema = z.object({
  title: titleSchema,
  releaseYear: releaseYearSchema,
});
export type FavoriteMovieInput = z.infer<typeof favoriteMovieInputSchema>;

export const searchQuerySchema = z.object({
  q: z
    .string({ error: "Enter a search term." })
    .min(1, "Enter a search term.")
    .max(100, "Search terms can be at most 100 characters.")
    .refine((q) => normalizeTitle(q).length >= 2, {
      message: "Type at least 2 letters or numbers.",
    }),
});

// Exactly { "confirm": "delete" }: no extra keys, exact spelling.
export const deleteConfirmationSchema = z.strictObject({ confirm: z.literal("delete") });
