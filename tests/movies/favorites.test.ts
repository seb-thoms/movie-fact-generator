import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { MovieStatus } from "@/generated/prisma/client";
import { AppError } from "@/lib/server/errors";
import {
  addFavoriteMovie,
  getFavoriteMovie,
  setFavoriteMovie,
} from "@/lib/server/movies/favorites";

import { createUser, db, raceAgainstUncommitted, resetDatabase } from "../helpers/db";

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

const dune = { title: "Dune", releaseYear: 2021 };

async function existingMovie(title: string, releaseYear: number, status: MovieStatus) {
  return db.movie.create({
    data: { title, normalizedTitle: title.toLowerCase(), releaseYear, status },
  });
}

describe("addFavoriteMovie (SPEC §9)", () => {
  it("saves a new movie as PENDING and creates the favorite", async () => {
    const userId = await createUser("u1");

    const result = await addFavoriteMovie(userId, {
      title: "Dune:   Part  Two",
      releaseYear: 2024,
    });

    expect(result.created).toBe(true);
    expect(result.movie).toMatchObject({
      title: "Dune: Part Two",
      releaseYear: 2024,
      status: "PENDING",
    });
    const stored = await db.movie.findUniqueOrThrow({ where: { id: result.movie.id } });
    expect(stored.normalizedTitle).toBe("dune part two");
    expect(await db.userFavoriteMovie.count({ where: { userId, movieId: stored.id } })).toBe(1);
  });

  it("links an existing VERIFIED movie without creating another or changing it", async () => {
    const userId = await createUser("u1");
    const movie = await existingMovie("Dune", 2021, "VERIFIED");

    const result = await addFavoriteMovie(userId, { title: "DUNE", releaseYear: 2021 });

    expect(result).toEqual({
      created: true,
      movie: { id: movie.id, title: "Dune", releaseYear: 2021, status: "VERIFIED" },
    });
    expect(await db.movie.count()).toBe(1);
  });

  it("links an existing NOT_RECOGNIZED movie normally, keeping its status", async () => {
    const userId = await createUser("u1");
    await existingMovie("Zzyzx", 2003, "NOT_RECOGNIZED");

    const result = await addFavoriteMovie(userId, { title: "Zzyzx", releaseYear: 2003 });

    expect(result.movie.status).toBe("NOT_RECOGNIZED");
    expect(result.created).toBe(true);
  });

  it("treats the same movie again (any spelling) as an idempotent retry", async () => {
    const userId = await createUser("u1");
    const first = await addFavoriteMovie(userId, dune);

    const retry = await addFavoriteMovie(userId, { title: "  dune! ", releaseYear: 2021 });

    expect(retry).toEqual({ created: false, movie: first.movie });
    expect(await db.movie.count()).toBe(1);
    expect(await db.userFavoriteMovie.count()).toBe(1);
  });

  it("rejects a different movie with 409 FAVORITE_EXISTS and saves nothing", async () => {
    const userId = await createUser("u1");
    await addFavoriteMovie(userId, dune);

    const attempt = addFavoriteMovie(userId, { title: "Alien", releaseYear: 1979 });

    await expect(attempt).rejects.toBeInstanceOf(AppError);
    await expect(attempt).rejects.toMatchObject({ code: "FAVORITE_EXISTS", status: 409 });
    expect(await db.movie.count()).toBe(1);
    expect(await db.userFavoriteMovie.count()).toBe(1);
  });

  it("saves a movie without a year as releaseYear null", async () => {
    const userId = await createUser("u1");

    const result = await addFavoriteMovie(userId, { title: "Dune", releaseYear: null });

    expect(result.movie).toMatchObject({ title: "Dune", releaseYear: null, status: "PENDING" });
  });

  it("treats a no-year retry as the same movie, and a dated one as different", async () => {
    const userId = await createUser("u1");
    const first = await addFavoriteMovie(userId, { title: "Dune", releaseYear: null });

    const retry = await addFavoriteMovie(userId, { title: "dune", releaseYear: null });
    const dated = addFavoriteMovie(userId, dune);

    expect(retry).toEqual({ created: false, movie: first.movie });
    await expect(dated).rejects.toMatchObject({ code: "FAVORITE_EXISTS" });
  });

  it("isn't blocked by another user's favorite", async () => {
    const alice = await createUser("alice");
    const bob = await createUser("bob");
    await addFavoriteMovie(alice, dune);

    const result = await addFavoriteMovie(bob, { title: "Alien", releaseYear: 1979 });

    expect(result.created).toBe(true);
  });
});

describe("addFavoriteMovie under concurrency (SPEC §9 step 6)", () => {
  it("5 parallel submits of the same movie: one favorite, one 201, the rest idempotent", async () => {
    const userId = await createUser("u1");

    const results = await Promise.all(
      Array.from({ length: 5 }, () => addFavoriteMovie(userId, dune)),
    );

    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.movie.id)).size).toBe(1);
    expect(await db.userFavoriteMovie.count()).toBe(1);
    expect(await db.movie.count()).toBe(1);
  });

  it("2 parallel submits of different movies: one wins, the other gets 409, no orphan movie", async () => {
    const userId = await createUser("u1");

    const results = await Promise.allSettled([
      addFavoriteMovie(userId, dune),
      addFavoriteMovie(userId, { title: "Alien", releaseYear: 1979 }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.status === "rejected" && rejected[0].reason).toMatchObject({
      code: "FAVORITE_EXISTS",
    });
    expect(await db.userFavoriteMovie.count()).toBe(1);
    expect(await db.movie.count()).toBe(1);
  });

  it("2 users adding the same new movie at once: one movie row, two favorites", async () => {
    const alice = await createUser("alice");
    const bob = await createUser("bob");

    const [a, b] = await Promise.all([addFavoriteMovie(alice, dune), addFavoriteMovie(bob, dune)]);

    expect(a.movie.id).toBe(b.movie.id);
    expect(await db.movie.count()).toBe(1);
    expect(await db.userFavoriteMovie.count()).toBe(2);
  });
});

// The tests above race naturally, so whether they hit the collision depends on
// timing. These force it: a competing transaction holds the conflicting rows
// uncommitted until every call under test is blocked on them.
describe("addFavoriteMovie losing a race (deterministic)", () => {
  async function holdFavorite(
    tx: Parameters<Parameters<typeof raceAgainstUncommitted>[0]>[0],
    userId: string,
  ) {
    const movie = await tx.movie.create({
      data: { title: "Dune", normalizedTitle: "dune", releaseYear: 2021 },
    });
    await tx.userFavoriteMovie.create({ data: { userId, movieId: movie.id } });
  }

  it("calls that lose to the same movie all get the idempotent result", async () => {
    const userId = await createUser("u1");

    const results = await raceAgainstUncommitted(
      (tx) => holdFavorite(tx, userId),
      () => Array.from({ length: 5 }, () => addFavoriteMovie(userId, dune)),
      5,
    );

    expect(results.every((r) => r.status === "fulfilled" && !r.value.created)).toBe(true);
    expect(await db.userFavoriteMovie.count()).toBe(1);
    expect(await db.movie.count()).toBe(1);
  });

  it("a call that loses to a different movie gets 409 and its movie row is rolled back", async () => {
    const userId = await createUser("u1");

    const [result] = await raceAgainstUncommitted(
      (tx) => holdFavorite(tx, userId),
      () => [addFavoriteMovie(userId, { title: "Alien", releaseYear: 1979 })],
      1,
    );

    expect(result?.status === "rejected" && result.reason).toMatchObject({
      code: "FAVORITE_EXISTS",
    });
    expect(await db.movie.count()).toBe(1);
  });

  it("creators of the same new movie never fail: ON CONFLICT DO NOTHING, then select", async () => {
    const alice = await createUser("alice");
    const bob = await createUser("bob");

    const results = await raceAgainstUncommitted(
      (tx) =>
        tx.movie.create({ data: { title: "Dune", normalizedTitle: "dune", releaseYear: 2021 } }),
      () => [addFavoriteMovie(alice, dune), addFavoriteMovie(bob, dune)],
      2,
    );

    expect(results.every((r) => r.status === "fulfilled" && r.value.created)).toBe(true);
    expect(await db.movie.count()).toBe(1);
    expect(await db.userFavoriteMovie.count()).toBe(2);
  });

  it("creators of the same no-year movie never fail (the partial index is a conflict too)", async () => {
    const alice = await createUser("alice");
    const bob = await createUser("bob");
    const noYear = { title: "Dune", releaseYear: null };

    const results = await raceAgainstUncommitted(
      (tx) => tx.movie.create({ data: { title: "Dune", normalizedTitle: "dune" } }),
      () => [addFavoriteMovie(alice, noYear), addFavoriteMovie(bob, noYear)],
      2,
    );

    expect(results.every((r) => r.status === "fulfilled" && r.value.created)).toBe(true);
    expect(await db.movie.count()).toBe(1);
  });
});

describe("setFavoriteMovie (SPEC §9.1: PUT sets or replaces)", () => {
  it("sets the favorite when there is none (created → 201)", async () => {
    const userId = await createUser("u1");

    const result = await setFavoriteMovie(userId, dune);

    expect(result.created).toBe(true);
    expect(result.movie).toMatchObject({ title: "Dune", releaseYear: 2021, status: "PENDING" });
    expect(await db.userFavoriteMovie.count({ where: { userId } })).toBe(1);
  });

  it("replaces a different favorite (200) and keeps the old movie's fact history", async () => {
    const userId = await createUser("u1");
    const first = await setFavoriteMovie(userId, dune);
    const fact = await db.movieFact.create({
      data: { movieId: first.movie.id, content: "A Dune fact.", model: "test" },
    });
    await db.factDelivery.create({
      data: { userId, movieId: first.movie.id, movieFactId: fact.id },
    });

    const result = await setFavoriteMovie(userId, { title: "Alien", releaseYear: 1979 });

    expect(result.created).toBe(false);
    expect(result.movie.title).toBe("Alien");
    const favorites = await db.userFavoriteMovie.findMany({ where: { userId } });
    expect(favorites.map((f) => f.movieId)).toEqual([result.movie.id]);
    expect(await db.factDelivery.count({ where: { userId } })).toBe(1);
  });

  it("is a no-op for the same movie (200)", async () => {
    const userId = await createUser("u1");
    const first = await setFavoriteMovie(userId, dune);

    const again = await setFavoriteMovie(userId, { title: "DUNE!", releaseYear: 2021 });

    expect(again).toEqual({ created: false, movie: first.movie });
    expect(await db.userFavoriteMovie.count()).toBe(1);
  });

  it("can change a dated favorite to a no-year one", async () => {
    const userId = await createUser("u1");
    await setFavoriteMovie(userId, dune);

    const result = await setFavoriteMovie(userId, { title: "Dune", releaseYear: null });

    expect(result.movie.releaseYear).toBeNull();
    expect(await db.userFavoriteMovie.count()).toBe(1);
  });

  it("never touches another user's favorite", async () => {
    const alice = await createUser("alice");
    const bob = await createUser("bob");
    const alicesFavorite = await setFavoriteMovie(alice, dune);

    await setFavoriteMovie(bob, { title: "Alien", releaseYear: 1979 });

    expect(await getFavoriteMovie(alice)).toEqual(alicesFavorite.movie);
  });

  it("concurrent edits by one user leave exactly one favorite, without errors", async () => {
    const userId = await createUser("u1");
    const movies = [
      dune,
      { title: "Alien", releaseYear: 1979 },
      { title: "Heat", releaseYear: 1995 },
    ];

    const results = await Promise.allSettled(movies.map((m) => setFavoriteMovie(userId, m)));

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await db.userFavoriteMovie.count({ where: { userId } })).toBe(1);
  });

  it("an edit waits for an in-flight edit and then wins (per-user row lock, deterministic)", async () => {
    const userId = await createUser("u1");

    const [result] = await raceAgainstUncommitted(
      async (tx) => {
        // Simulates another edit in progress: it holds the user's row lock and
        // has set Dune, but hasn't committed yet.
        await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`;
        const movie = await tx.movie.create({
          data: { title: "Dune", normalizedTitle: "dune", releaseYear: 2021 },
        });
        await tx.userFavoriteMovie.create({ data: { userId, movieId: movie.id } });
      },
      () => [setFavoriteMovie(userId, { title: "Alien", releaseYear: 1979 })],
      1,
    );

    expect(result?.status === "fulfilled" && result.value).toMatchObject({
      created: false,
      movie: { title: "Alien" },
    });
    expect((await getFavoriteMovie(userId))?.title).toBe("Alien");
  });
});
