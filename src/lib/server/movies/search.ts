import "server-only";

import type { MovieSearchResult } from "@/lib/shared/api";
import { normalizeTitle } from "@/lib/shared/movies";

import { db } from "../db";

const MAX_RESULTS = 8;
const select = { id: true, title: true, releaseYear: true } as const;
// "Alphabetically" means by the normalized title (ignores case and accents),
// then by year so remakes are listed oldest first, with no-year rows last.
const orderBy = [
  { normalizedTitle: "asc" },
  { releaseYear: { sort: "asc", nulls: "last" } },
] as const;

/**
 * Autocomplete over VERIFIED movies only (SPEC §6, §10): titles starting with
 * the query first, then titles containing it, at most 8.
 *
 * Always matches on the NORMALIZED query. Prisma does not escape LIKE
 * wildcards in startsWith/contains, and normalization is what strips % and _.
 */
export async function searchVerifiedMovies(rawQuery: string): Promise<MovieSearchResult[]> {
  const query = normalizeTitle(rawQuery);

  const prefixMatches = await db.movie.findMany({
    where: { status: "VERIFIED", normalizedTitle: { startsWith: query } },
    orderBy: [...orderBy],
    take: MAX_RESULTS,
    select,
  });
  if (prefixMatches.length === MAX_RESULTS) return prefixMatches;

  const otherMatches = await db.movie.findMany({
    where: {
      status: "VERIFIED",
      normalizedTitle: { contains: query },
      NOT: { normalizedTitle: { startsWith: query } },
    },
    orderBy: [...orderBy],
    take: MAX_RESULTS - prefixMatches.length,
    select,
  });
  return [...prefixMatches, ...otherMatches];
}
