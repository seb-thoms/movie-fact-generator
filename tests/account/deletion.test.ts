import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteAccount } from "@/lib/server/account/deletion";

import { createUser, db, resetDatabase } from "../helpers/db";
import { createFactAgo, createMovieWithStatus, deliverAgo, favorite } from "../helpers/facts";

beforeEach(resetDatabase);
afterEach(() => vi.restoreAllMocks());
afterAll(() => db.$disconnect());

const ACCESS_TOKEN = "google-access-token-SECRET";

/** A user with every kind of personal data, plus a shared movie and fact. */
async function userWithEverything(name: string) {
  const userId = await createUser(name);
  await db.session.create({
    data: {
      id: `${name}-session`,
      userId,
      token: `${name}-token`,
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  await db.account.create({
    data: {
      id: `${name}-account`,
      userId,
      providerId: "google",
      accountId: `${name}-sub`,
      accessToken: ACCESS_TOKEN,
    },
  });
  return userId;
}

describe("deleteAccount (SPEC §12)", () => {
  it("removes all personal data while shared movies and facts survive", async () => {
    const userId = await userWithEverything("ada");
    const otherUser = await userWithEverything("bob");
    const movie = await createMovieWithStatus("Dune", 2021, "VERIFIED");
    await favorite(userId, movie.id);
    await favorite(otherUser, movie.id);
    const factId = await createFactAgo(movie.id, "A shared fact.");
    await deliverAgo(userId, movie.id, factId, 10);
    await deliverAgo(otherUser, movie.id, factId, 10);
    await db.factGenerationLease.create({
      data: { userId, movieId: movie.id, holderId: "h", lockedUntil: new Date() },
    });

    await deleteAccount(userId, { revokeGoogleToken: async () => {} });

    expect(await db.user.count({ where: { id: userId } })).toBe(0);
    expect(await db.session.count({ where: { userId } })).toBe(0);
    expect(await db.account.count({ where: { userId } })).toBe(0);
    expect(await db.userFavoriteMovie.count({ where: { userId } })).toBe(0);
    expect(await db.factDelivery.count({ where: { userId } })).toBe(0);
    expect(await db.factGenerationLease.count({ where: { userId } })).toBe(0);
    // Shared, non-personal data stays:
    expect(await db.movie.count({ where: { id: movie.id } })).toBe(1);
    expect(await db.movieFact.count({ where: { id: factId } })).toBe(1);
    // Another user is untouched:
    expect(await db.session.count({ where: { userId: otherUser } })).toBe(1);
    expect(await db.factDelivery.count({ where: { userId: otherUser } })).toBe(1);
  });

  it("revokes the Google access token before deleting (the token lives on the account row)", async () => {
    const userId = await userWithEverything("ada");
    const calls: { token: string; userStillExists: boolean }[] = [];

    await deleteAccount(userId, {
      revokeGoogleToken: async (token) => {
        calls.push({
          token,
          userStillExists: (await db.user.count({ where: { id: userId } })) === 1,
        });
      },
    });

    expect(calls).toEqual([{ token: ACCESS_TOKEN, userStillExists: true }]);
  });

  it("skips revocation when there is no Google token", async () => {
    const userId = await createUser("ada");
    const revoke = vi.fn();

    await deleteAccount(userId, { revokeGoogleToken: revoke });

    expect(revoke).not.toHaveBeenCalled();
    expect(await db.user.count({ where: { id: userId } })).toBe(0);
  });

  it("still deletes the account when revocation fails, and never logs the token", async () => {
    const userId = await userWithEverything("ada");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await deleteAccount(userId, {
      revokeGoogleToken: async (token) => {
        throw new Error(`Google said no to ${token}`);
      },
    });

    expect(await db.user.count({ where: { id: userId } })).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ event: "google_revoke_failed" }));
    expect(JSON.stringify(warn.mock.calls)).not.toContain(ACCESS_TOKEN);
  });

  it("gives the revoker a deadline signal so a hanging Google call can't stall deletion", async () => {
    const userId = await userWithEverything("ada");
    let received: AbortSignal | undefined;

    await deleteAccount(userId, {
      revokeGoogleToken: async (_token, signal) => {
        received = signal;
      },
    });

    expect(received).toBeInstanceOf(AbortSignal);
  });
});
