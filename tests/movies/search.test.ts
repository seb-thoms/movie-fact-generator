import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { MovieStatus } from "@/generated/prisma/client";
import { searchVerifiedMovies } from "@/lib/server/movies/search";
import { normalizeTitle } from "@/lib/shared/movies";

import { db, resetDatabase } from "../helpers/db";

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

async function addMovie(title: string, releaseYear: number, status: MovieStatus = "VERIFIED") {
  return db.movie.create({
    data: { title, normalizedTitle: normalizeTitle(title), releaseYear, status },
  });
}

function titles(results: { title: string; releaseYear: number }[]) {
  return results.map((movie) => `${movie.title} (${movie.releaseYear})`);
}

describe("searchVerifiedMovies (SPEC §6, §10)", () => {
  it("returns only VERIFIED movies", async () => {
    await addMovie("Dune", 2021, "VERIFIED");
    await addMovie("Dune Messiah", 2027, "PENDING");
    await addMovie("Dunkirk", 2017, "NOT_RECOGNIZED");

    expect(titles(await searchVerifiedMovies("du"))).toEqual(["Dune (2021)"]);
  });

  it("lists titles that start with the query before titles that contain it", async () => {
    await addMovie("The Dune Chronicles", 2000);
    await addMovie("Dune", 2021);

    expect(titles(await searchVerifiedMovies("dune"))).toEqual([
      "Dune (2021)",
      "The Dune Chronicles (2000)",
    ]);
  });

  it("orders ties alphabetically, then by year", async () => {
    await addMovie("Dune", 2021);
    await addMovie("Dunkirk", 2017);
    await addMovie("Dune", 1984);
    await addMovie("Return to Dune", 2010);
    await addMovie("A Dune Story", 2015);

    expect(titles(await searchVerifiedMovies("dun"))).toEqual([
      "Dune (1984)",
      "Dune (2021)",
      "Dunkirk (2017)",
      "A Dune Story (2015)",
      "Return to Dune (2010)",
    ]);
  });

  it("returns at most 8 results, filling with prefix matches first", async () => {
    for (let i = 1; i <= 9; i++) await addMovie(`Star ${i}`, 2000 + i);
    await addMovie("Lone Star", 1996);

    const results = await searchVerifiedMovies("star");

    expect(results).toHaveLength(8);
    expect(titles(results)).not.toContain("Lone Star (1996)");
  });

  it("normalizes the query before matching", async () => {
    await addMovie("Amélie", 2001);

    expect(titles(await searchVerifiedMovies("  AMÉLIE!! "))).toEqual(["Amélie (2001)"]);
  });

  it("returns only id, title, and releaseYear", async () => {
    const dune = await addMovie("Dune", 2021);

    expect(await searchVerifiedMovies("dune")).toEqual([
      { id: dune.id, title: "Dune", releaseYear: 2021 },
    ]);
  });
});

describe("LIKE wildcards (SPEC §10: confirm Prisma's handling)", () => {
  it("Prisma does NOT escape _ and % in contains/startsWith (verified behavior)", async () => {
    // Documents a real finding: Prisma passes these through to SQL LIKE as
    // wildcards. Normalization is therefore our only defense.
    await addMovie("abc", 2000);

    expect(await db.movie.count({ where: { normalizedTitle: { contains: "a_c" } } })).toBe(1);
    expect(await db.movie.count({ where: { normalizedTitle: { startsWith: "%" } } })).toBe(1);
  });

  it("search neutralizes wildcards: _ and % in a query never act as wildcards", async () => {
    await addMovie("abc", 2000);

    expect(await searchVerifiedMovies("a_c")).toEqual([]);
    expect(await searchVerifiedMovies("a%c")).toEqual([]);
  });
});
