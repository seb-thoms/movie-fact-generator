import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { MovieStatus } from "@/generated/prisma/client";
import { getFactForUser } from "@/lib/server/facts/fact-service";

import { FakeFactGenerator, found } from "../fakes/fake-fact-generator";
import { createUser, db, resetDatabase } from "../helpers/db";
import { createFactAgo, createMovieWithStatus, deliverAgo, favorite } from "../helpers/facts";

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

function pool(generator: FakeFactGenerator, poolSize = 10) {
  return { generator, strategy: "pool" as const, poolSize };
}

async function setup(status: MovieStatus = "VERIFIED") {
  const userId = await createUser("u1");
  const movie = await createMovieWithStatus("Dune", 2021, status);
  await favorite(userId, movie.id);
  return { userId, movieId: movie.id };
}

describe("pool strategy (SPEC §7.2 step 6, §14.6)", () => {
  it("serves the oldest fact this user hasn't seen, without calling the generator", async () => {
    const { userId, movieId } = await setup();
    const older = await createFactAgo(movieId, "Older fact.", 300);
    await createFactAgo(movieId, "Newer fact.", 100);
    const generator = new FakeFactGenerator();

    const result = await getFactForUser(userId, movieId, pool(generator));

    expect(result).toMatchObject({ source: "pool", fact: { id: older } });
    expect(generator.calls).toHaveLength(0);
    expect(await db.factDelivery.count({ where: { userId, movieFactId: older } })).toBe(1);
  });

  it("moves on to the next unseen fact once the window passes", async () => {
    const { userId, movieId } = await setup();
    const older = await createFactAgo(movieId, "Older fact.", 300);
    const newer = await createFactAgo(movieId, "Newer fact.", 100);
    await deliverAgo(userId, movieId, older, 61);

    const result = await getFactForUser(userId, movieId, pool(new FakeFactGenerator()));

    expect(result).toMatchObject({ source: "pool", fact: { id: newer } });
  });

  it("doesn't count other users' deliveries as seen by this user", async () => {
    const { userId, movieId } = await setup();
    const otherUser = await createUser("u2");
    const fact = await createFactAgo(movieId, "Seen by someone else.", 300);
    await deliverAgo(otherUser, movieId, fact, 10);

    const result = await getFactForUser(userId, movieId, pool(new FakeFactGenerator()));

    expect(result).toMatchObject({ source: "pool", fact: { id: fact } });
  });

  it("generates when the user has seen every fact and the pool is below FACT_POOL_SIZE", async () => {
    const { userId, movieId } = await setup();
    await deliverAgo(userId, movieId, await createFactAgo(movieId, "Seen.", 300), 120);
    const generator = new FakeFactGenerator().respondWith(found("A fresh pool fact."));

    const result = await getFactForUser(userId, movieId, pool(generator, 3));

    expect(result).toMatchObject({ source: "generated", fact: { content: "A fresh pool fact." } });
    expect(await db.movieFact.count({ where: { movieId } })).toBe(2);
  });

  it("respects the FACT_POOL_SIZE cap: at the cap, serves the fact seen longest ago instead", async () => {
    const { userId, movieId } = await setup();
    const a = await createFactAgo(movieId, "Fact A.", 1000);
    const b = await createFactAgo(movieId, "Fact B.", 900);
    await deliverAgo(userId, movieId, a, 300);
    await deliverAgo(userId, movieId, b, 120);
    const generator = new FakeFactGenerator();

    const result = await getFactForUser(userId, movieId, pool(generator, 2));

    expect(result).toMatchObject({ source: "pool", fact: { id: a } });
    expect(generator.calls).toHaveLength(0);
    expect(await db.movieFact.count({ where: { movieId } })).toBe(2);
  });

  it("judges 'seen longest ago' by the user's most recent viewing of each fact", async () => {
    const { userId, movieId } = await setup();
    const a = await createFactAgo(movieId, "Fact A.", 1000);
    const b = await createFactAgo(movieId, "Fact B.", 900);
    await deliverAgo(userId, movieId, a, 500);
    await deliverAgo(userId, movieId, b, 200);
    await deliverAgo(userId, movieId, a, 90); // A seen again more recently than B

    const result = await getFactForUser(userId, movieId, pool(new FakeFactGenerator(), 2));

    expect(result).toMatchObject({ source: "pool", fact: { id: b } });
  });

  it("always generates for a PENDING movie (only VERIFIED movies use the pool)", async () => {
    const { userId, movieId } = await setup("PENDING");
    await createFactAgo(movieId, "Unconfirmed fact.", 300);
    const generator = new FakeFactGenerator();

    const result = await getFactForUser(userId, movieId, pool(generator));

    expect(result.source).toBe("generated");
    expect(generator.calls).toHaveLength(1);
  });

  it("still serves the 60-second cache first", async () => {
    const { userId, movieId } = await setup();
    const fact = await createFactAgo(movieId, "Just shown.", 300);
    await createFactAgo(movieId, "Unseen.", 200);
    await deliverAgo(userId, movieId, fact, 30);

    const result = await getFactForUser(userId, movieId, pool(new FakeFactGenerator()));

    expect(result).toMatchObject({ source: "cache", fact: { id: fact } });
  });

  it("falls back when pool generation fails", async () => {
    const { userId, movieId } = await setup();
    const seen = await createFactAgo(movieId, "Seen.", 300);
    await deliverAgo(userId, movieId, seen, 120);
    const generator = new FakeFactGenerator().respondWith(new Error("OpenAI is down"));

    const result = await getFactForUser(userId, movieId, pool(generator, 3));

    expect(result).toMatchObject({ source: "fallback", fact: { id: seen } });
  });
});
