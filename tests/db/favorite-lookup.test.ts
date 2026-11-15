import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getFavoriteMovie } from "@/lib/server/movies/favorites";

import { createMovie, createUser, db, resetDatabase } from "../helpers/db";

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

describe("getFavoriteMovie (dashboard, SPEC §11)", () => {
  it("returns null for a user with no favorite", async () => {
    const userId = await createUser("u1");

    expect(await getFavoriteMovie(userId)).toBeNull();
  });

  it("returns the favorite's id, title, year, and status", async () => {
    const userId = await createUser("u1");
    const dune = await createMovie("Dune", 2021);
    await db.userFavoriteMovie.create({ data: { userId, movieId: dune.id } });

    expect(await getFavoriteMovie(userId)).toEqual({
      id: dune.id,
      title: "Dune",
      releaseYear: 2021,
      status: "PENDING",
    });
  });

  it("only returns the given user's favorite (scoped to the session user)", async () => {
    const alice = await createUser("alice");
    const bob = await createUser("bob");
    const dune = await createMovie("dune", 2021);
    await db.userFavoriteMovie.create({ data: { userId: alice, movieId: dune.id } });

    expect(await getFavoriteMovie(bob)).toBeNull();
  });
});
