import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  findFreshDelivery,
  findLatestFactForVerifiedMovie,
  findLatestUserFact,
} from "@/lib/server/facts/fact-queries";

import { createUser, db, resetDatabase } from "../helpers/db";
import { createFactAgo, createMovieWithStatus, deliverAgo } from "../helpers/facts";

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

describe("findFreshDelivery: the 60-second cache window (DB clock)", () => {
  it("returns a delivery from 59 seconds ago", async () => {
    const userId = await createUser("u1");
    const movie = await createMovieWithStatus("Dune", 2021, "VERIFIED");
    const factId = await createFactAgo(movie.id, "A Dune fact.");
    await deliverAgo(userId, movie.id, factId, 59);

    expect(await findFreshDelivery(userId, movie.id)).toMatchObject({
      id: factId,
      content: "A Dune fact.",
    });
  });

  it("ignores a delivery from 61 seconds ago", async () => {
    const userId = await createUser("u1");
    const movie = await createMovieWithStatus("Dune", 2021, "VERIFIED");
    await deliverAgo(userId, movie.id, await createFactAgo(movie.id, "Old."), 61);

    expect(await findFreshDelivery(userId, movie.id)).toBeNull();
  });

  it("returns the most recent of several fresh deliveries", async () => {
    const userId = await createUser("u1");
    const movie = await createMovieWithStatus("Dune", 2021, "VERIFIED");
    await deliverAgo(userId, movie.id, await createFactAgo(movie.id, "Older."), 30);
    await deliverAgo(userId, movie.id, await createFactAgo(movie.id, "Newer."), 5);

    expect((await findFreshDelivery(userId, movie.id))?.content).toBe("Newer.");
  });

  it("only counts this user's deliveries", async () => {
    const userId = await createUser("u1");
    const otherUser = await createUser("u2");
    const movie = await createMovieWithStatus("Dune", 2021, "VERIFIED");
    await deliverAgo(otherUser, movie.id, await createFactAgo(movie.id, "Theirs."), 1);

    expect(await findFreshDelivery(userId, movie.id)).toBeNull();
  });
});

describe("fallback lookups (SPEC §7.4)", () => {
  it("findLatestUserFact returns the user's most recent delivery at any age", async () => {
    const userId = await createUser("u1");
    const movie = await createMovieWithStatus("Dune", 2021, "VERIFIED");
    await deliverAgo(userId, movie.id, await createFactAgo(movie.id, "Ancient."), 86_400 * 30);
    await deliverAgo(userId, movie.id, await createFactAgo(movie.id, "Last week."), 86_400 * 7);

    expect((await findLatestUserFact(userId, movie.id))?.content).toBe("Last week.");
  });

  it("findLatestUserFact ignores other users' deliveries", async () => {
    const userId = await createUser("u1");
    const otherUser = await createUser("u2");
    const movie = await createMovieWithStatus("Dune", 2021, "VERIFIED");
    await deliverAgo(otherUser, movie.id, await createFactAgo(movie.id, "Theirs."), 10);

    expect(await findLatestUserFact(userId, movie.id)).toBeNull();
  });

  it("findLatestFactForVerifiedMovie returns the newest fact from any user", async () => {
    const movie = await createMovieWithStatus("Dune", 2021, "VERIFIED");
    await createFactAgo(movie.id, "Older.", 100);
    await createFactAgo(movie.id, "Newest.", 10);

    expect((await findLatestFactForVerifiedMovie(movie.id))?.content).toBe("Newest.");
  });

  it.each(["PENDING", "NOT_RECOGNIZED"] as const)(
    "findLatestFactForVerifiedMovie returns nothing for a %s movie",
    async (status) => {
      const movie = await createMovieWithStatus("Dune", 2021, status);
      await createFactAgo(movie.id, "Shouldn't be shared.");

      expect(await findLatestFactForVerifiedMovie(movie.id)).toBeNull();
    },
  );
});
