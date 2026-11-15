import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { MovieStatus } from "@/generated/prisma/client";
import { AppError } from "@/lib/server/errors";
import type { FactGenerator } from "@/lib/server/facts/fact-generator";
import { getFactForUser, type FactServiceOptions } from "@/lib/server/facts/fact-service";

import { FakeFactGenerator, found, notFound } from "../fakes/fake-fact-generator";
import { createUser, db, raceAgainstUncommitted, resetDatabase } from "../helpers/db";
import { createFactAgo, createMovieWithStatus, deliverAgo, favorite } from "../helpers/facts";

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

function options(generator: FactGenerator, overrides: Partial<FactServiceOptions> = {}) {
  return { generator, strategy: "generate" as const, poolSize: 10, ...overrides };
}

/** A user whose favorite is Dune (2021) with the given status. */
async function userWithFavorite(status: MovieStatus = "VERIFIED", name = "u1") {
  const userId = await createUser(name);
  const movie = await createMovieWithStatus("Dune", 2021, status);
  await favorite(userId, movie.id);
  return { userId, movieId: movie.id };
}

async function expectAppError(promise: Promise<unknown>, code: string, status: number) {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await expect(promise).rejects.toMatchObject({ code, status });
}

const deliveries = () => db.factDelivery.count();
const leases = () => db.factGenerationLease.count();

describe("authorization (SPEC §7.2 step 1, §14.2)", () => {
  it("returns 404 for a movie that isn't the user's favorite, without generating", async () => {
    const userId = await createUser("u1");
    const movie = await createMovieWithStatus("Dune", 2021, "VERIFIED");
    const generator = new FakeFactGenerator();

    await expectAppError(getFactForUser(userId, movie.id, options(generator)), "NOT_FOUND", 404);
    expect(generator.calls).toHaveLength(0);
  });

  it("user B can't get user A's fact: A's favorite is a 404 for B", async () => {
    const alice = await userWithFavorite("VERIFIED", "alice");
    const bob = await createUser("bob");
    const factId = await createFactAgo(alice.movieId, "Alice's fact.");
    await deliverAgo(alice.userId, alice.movieId, factId, 5);

    await expectAppError(
      getFactForUser(bob, alice.movieId, options(new FakeFactGenerator())),
      "NOT_FOUND",
      404,
    );
  });

  it("returns 404 for a malformed movie id", async () => {
    const { userId } = await userWithFavorite();

    await expectAppError(
      getFactForUser(userId, "x".repeat(101), options(new FakeFactGenerator())),
      "NOT_FOUND",
      404,
    );
  });

  it("returns 422 MOVIE_NOT_RECOGNIZED for a NOT_RECOGNIZED movie, with no generator call", async () => {
    const { userId, movieId } = await userWithFavorite("NOT_RECOGNIZED");
    const generator = new FakeFactGenerator();

    await expectAppError(
      getFactForUser(userId, movieId, options(generator)),
      "MOVIE_NOT_RECOGNIZED",
      422,
    );
    expect(generator.calls).toHaveLength(0);
  });
});

describe("cache window (SPEC §7.2 step 2, §14.1)", () => {
  it("serves the user's 59-second-old delivery from cache, without calling the generator", async () => {
    const { userId, movieId } = await userWithFavorite();
    const factId = await createFactAgo(movieId, "Cached fact.");
    await deliverAgo(userId, movieId, factId, 59);
    const generator = new FakeFactGenerator();

    const result = await getFactForUser(userId, movieId, options(generator));

    expect(result).toMatchObject({
      source: "cache",
      fact: { id: factId, content: "Cached fact." },
    });
    expect(generator.calls).toHaveLength(0);
  });

  it("generates a new fact when the latest delivery is 61 seconds old (exactly one call)", async () => {
    const { userId, movieId } = await userWithFavorite();
    await deliverAgo(userId, movieId, await createFactAgo(movieId, "Old fact."), 61);
    const generator = new FakeFactGenerator().respondWith(found("Brand new fact."));

    const result = await getFactForUser(userId, movieId, options(generator));

    expect(result).toMatchObject({ source: "generated", fact: { content: "Brand new fact." } });
    expect(generator.calls).toEqual([{ title: "Dune", releaseYear: 2021 }]);
  });

  it("serves the just-generated fact from cache on the next request", async () => {
    const { userId, movieId } = await userWithFavorite();
    const generator = new FakeFactGenerator();
    const first = await getFactForUser(userId, movieId, options(generator));

    const second = await getFactForUser(userId, movieId, options(generator));

    expect(second).toEqual({ source: "cache", fact: first.fact });
    expect(generator.calls).toHaveLength(1);
  });
});

describe("generating (SPEC §7.2 step 7)", () => {
  it("stores the fact and a delivery in one go, and marks a PENDING movie VERIFIED", async () => {
    const { userId, movieId } = await userWithFavorite("PENDING");

    const result = await getFactForUser(userId, movieId, options(new FakeFactGenerator()));

    expect(result.source).toBe("generated");
    const stored = await db.movieFact.findUniqueOrThrow({ where: { id: result.fact.id } });
    expect(stored).toMatchObject({ movieId, model: "fake-model", content: result.fact.content });
    expect(await db.factDelivery.count({ where: { userId, movieFactId: result.fact.id } })).toBe(1);
    const movie = await db.movie.findUniqueOrThrow({ where: { id: movieId } });
    expect(movie.status).toBe("VERIFIED");
    expect(movie.statusUpdatedAt).not.toBeNull();
  });

  it("marks a PENDING movie NOT_RECOGNIZED and returns 422 when the model doesn't know it", async () => {
    const { userId, movieId } = await userWithFavorite("PENDING");
    const generator = new FakeFactGenerator().respondWith(notFound());

    await expectAppError(
      getFactForUser(userId, movieId, options(generator)),
      "MOVIE_NOT_RECOGNIZED",
      422,
    );
    expect((await db.movie.findUniqueOrThrow({ where: { id: movieId } })).status).toBe(
      "NOT_RECOGNIZED",
    );
  });

  it("treats found: false for a VERIFIED movie as a failure (fallback), leaving it VERIFIED", async () => {
    const { userId, movieId } = await userWithFavorite("VERIFIED");
    await deliverAgo(userId, movieId, await createFactAgo(movieId, "Earlier fact."), 3600);
    const generator = new FakeFactGenerator().respondWith(notFound());

    const result = await getFactForUser(userId, movieId, options(generator));

    expect(result).toMatchObject({ source: "fallback", fact: { content: "Earlier fact." } });
    expect((await db.movie.findUniqueOrThrow({ where: { id: movieId } })).status).toBe("VERIFIED");
  });

  it("found: false losing to a concurrent VERIFIED falls back instead of 422 (deterministic)", async () => {
    const { userId, movieId } = await userWithFavorite("PENDING");
    const generator = new FakeFactGenerator().respondWith(notFound());

    const [result] = await raceAgainstUncommitted(
      async (tx) => {
        // Another user's request just verified the movie and stored a fact, not yet committed.
        await tx.$executeRaw`UPDATE "Movie" SET status = 'VERIFIED', "statusUpdatedAt" = now() WHERE id = ${movieId}`;
        await tx.movieFact.create({
          data: { movieId, content: "Their fact.", model: "fake-model" },
        });
      },
      () => [getFactForUser(userId, movieId, options(generator))],
      1,
    );

    expect(result?.status === "fulfilled" && result.value).toMatchObject({
      source: "fallback",
      fact: { content: "Their fact." },
    });
    expect((await db.movie.findUniqueOrThrow({ where: { id: movieId } })).status).toBe("VERIFIED");
  });
});

describe("failure handling and fallback order (SPEC §7.4, §14.4)", () => {
  it("serves the user's last fact (stale fallback) when the generator throws", async () => {
    const { userId, movieId } = await userWithFavorite();
    await deliverAgo(userId, movieId, await createFactAgo(movieId, "Two days old."), 172_800);
    const before = await deliveries();

    const result = await getFactForUser(
      userId,
      movieId,
      options(new FakeFactGenerator().respondWith(new Error("OpenAI is down"))),
    );

    expect(result).toMatchObject({ source: "fallback", fact: { content: "Two days old." } });
    expect(await deliveries()).toBe(before); // serving a fallback records nothing
  });

  it("falls back when the generator misses the deadline", async () => {
    const { userId, movieId } = await userWithFavorite();
    await deliverAgo(userId, movieId, await createFactAgo(movieId, "Earlier fact."), 600);
    const slow = new FakeFactGenerator({ delayMs: 10_000 });

    const result = await getFactForUser(userId, movieId, options(slow, { deadlineMs: 50 }));

    expect(result).toMatchObject({ source: "fallback", fact: { content: "Earlier fact." } });
  });

  it("with no fact of their own, serves another user's fact for a VERIFIED movie", async () => {
    const { userId, movieId } = await userWithFavorite("VERIFIED");
    await createFactAgo(movieId, "Someone else's fact.", 3600);

    const result = await getFactForUser(
      userId,
      movieId,
      options(new FakeFactGenerator().respondWith(new Error("down"))),
    );

    expect(result).toMatchObject({ source: "fallback", fact: { content: "Someone else's fact." } });
  });

  it("returns 503 FACT_UNAVAILABLE when generation fails and no fact exists", async () => {
    const { userId, movieId } = await userWithFavorite("PENDING");

    await expectAppError(
      getFactForUser(
        userId,
        movieId,
        options(new FakeFactGenerator().respondWith(new Error("down"))),
      ),
      "FACT_UNAVAILABLE",
      503,
    );
  });
});

describe("lease (SPEC §7.2 steps 3-5 and 8)", () => {
  it("releases the lease after success and after failure", async () => {
    const { userId, movieId } = await userWithFavorite();
    await getFactForUser(userId, movieId, options(new FakeFactGenerator()));
    expect(await leases()).toBe(0);

    await db.factDelivery.deleteMany();
    await getFactForUser(
      userId,
      movieId,
      options(new FakeFactGenerator().respondWith(new Error("down"))),
    );
    expect(await leases()).toBe(0);
  });

  it("a request that loses the lease doesn't generate: it falls back after polling", async () => {
    const { userId, movieId } = await userWithFavorite();
    await deliverAgo(userId, movieId, await createFactAgo(movieId, "Earlier fact."), 600);
    await db.$executeRaw`
      INSERT INTO "FactGenerationLease" ("userId", "movieId", "holderId", "lockedUntil")
      VALUES (${userId}, ${movieId}, 'another-request', now() + interval '20 seconds')`;
    const generator = new FakeFactGenerator();

    const result = await getFactForUser(userId, movieId, options(generator, { pollMaxMs: 100 }));

    expect(result).toMatchObject({ source: "fallback", fact: { content: "Earlier fact." } });
    expect(generator.calls).toHaveLength(0);
  });

  it("a request that loses the lease with nothing to fall back on gets 503", async () => {
    const { userId, movieId } = await userWithFavorite();
    await db.$executeRaw`
      INSERT INTO "FactGenerationLease" ("userId", "movieId", "holderId", "lockedUntil")
      VALUES (${userId}, ${movieId}, 'another-request', now() + interval '20 seconds')`;

    await expectAppError(
      getFactForUser(userId, movieId, options(new FakeFactGenerator(), { pollMaxMs: 100 })),
      "FACT_UNAVAILABLE",
      503,
    );
  });

  it("after winning the lease, re-checks the cache and serves a delivery that appeared meanwhile (deterministic)", async () => {
    const { userId, movieId } = await userWithFavorite();
    const generator = new FakeFactGenerator();

    const [result] = await raceAgainstUncommitted(
      async (tx) => {
        // Another request is finishing: its (expired) lease row and its fresh delivery
        // aren't committed yet. Our lease INSERT blocks on that row, then takes it over.
        await tx.$executeRaw`
          INSERT INTO "FactGenerationLease" ("userId", "movieId", "holderId", "lockedUntil")
          VALUES (${userId}, ${movieId}, 'finishing-request', now() - interval '1 second')`;
        const fact = await tx.movieFact.create({
          data: { movieId, content: "Just generated elsewhere.", model: "fake-model" },
        });
        await tx.factDelivery.create({ data: { userId, movieId, movieFactId: fact.id } });
      },
      () => [getFactForUser(userId, movieId, options(generator))],
      1,
    );

    expect(result?.status === "fulfilled" && result.value).toMatchObject({
      source: "cache",
      fact: { content: "Just generated elsewhere." },
    });
    expect(generator.calls).toHaveLength(0);
  });
});

describe("concurrency (SPEC §14.3)", () => {
  it("5 parallel requests after the window expires make exactly 1 generator call and get the same fact", async () => {
    const { userId, movieId } = await userWithFavorite();
    await deliverAgo(userId, movieId, await createFactAgo(movieId, "Expired fact."), 61);
    const generator = new FakeFactGenerator({ delayMs: 300 });

    const results = await Promise.all(
      Array.from({ length: 5 }, () => getFactForUser(userId, movieId, options(generator))),
    );

    expect(generator.calls).toHaveLength(1);
    expect(results.filter((r) => r.source === "generated")).toHaveLength(1);
    expect(results.filter((r) => r.source === "cache")).toHaveLength(4);
    expect(new Set(results.map((r) => r.fact.id)).size).toBe(1);
  });

  it("when generation outlasts the polling, the others get a valid fallback, never a second call", async () => {
    const { userId, movieId } = await userWithFavorite();
    await deliverAgo(userId, movieId, await createFactAgo(movieId, "Expired fact."), 61);
    const generator = new FakeFactGenerator({ delayMs: 800 });

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        getFactForUser(userId, movieId, options(generator, { pollMaxMs: 150 })),
      ),
    );

    expect(generator.calls).toHaveLength(1);
    expect(results.filter((r) => r.source === "generated")).toHaveLength(1);
    const others = results.filter((r) => r.source !== "generated");
    expect(others.every((r) => r.source === "fallback" && r.fact.content === "Expired fact.")).toBe(
      true,
    );
  });
});

describe("user deleted mid-generation (SPEC §7.5)", () => {
  it("catches the foreign-key error, saves nothing, and returns 401", async () => {
    const { userId, movieId } = await userWithFavorite();
    const deletingGenerator: FactGenerator = {
      async generate() {
        await db.user.delete({ where: { id: userId } }); // account deleted meanwhile
        return found("Orphan fact.");
      },
    };

    await expectAppError(
      getFactForUser(userId, movieId, options(deletingGenerator)),
      "UNAUTHENTICATED",
      401,
    );
    expect(await db.movieFact.count({ where: { content: "Orphan fact." } })).toBe(0);
  });
});
