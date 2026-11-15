import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { hasFavoriteMovie } from "@/lib/server/movies/onboarding-state";

import { createMovie, createUser, db, resetDatabase } from "../helpers/db";

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

describe("hasFavoriteMovie", () => {
  it("is false for a user with no favorite", async () => {
    const userId = await createUser("u1");

    expect(await hasFavoriteMovie(userId)).toBe(false);
  });

  it("is true once the user has a favorite", async () => {
    const userId = await createUser("u1");
    const dune = await createMovie("dune", 2021);
    await db.userFavoriteMovie.create({ data: { userId, movieId: dune.id } });

    expect(await hasFavoriteMovie(userId)).toBe(true);
  });

  it("only counts the given user's favorites (scoped to the session user)", async () => {
    const alice = await createUser("alice");
    const bob = await createUser("bob");
    const dune = await createMovie("dune", 2021);
    await db.userFavoriteMovie.create({ data: { userId: alice, movieId: dune.id } });

    expect(await hasFavoriteMovie(bob)).toBe(false);
  });
});
