import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { auth } from "@/lib/server/auth";

import { db, resetDatabase } from "../helpers/db";

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

// These tests go through Better Auth's own database adapter (an internal API),
// to prove the auth tables we split across commits match what Better Auth
// actually reads and writes. Step 2 adds tests through the public API.
async function adapter() {
  return (await auth.$context).internalAdapter;
}

async function createGoogleUser() {
  const internal = await adapter();
  return internal.createOAuthUser(
    { name: "Ada Lovelace", email: "ada@example.com", emailVerified: true, image: null },
    { providerId: "google", accountId: "google-sub-123", accessToken: "fake-access-token" },
  );
}

describe("Better Auth against our schema", () => {
  it("creates a Google OAuth user with a linked account", async () => {
    const { user, account } = await createGoogleUser();

    const storedUser = await db.user.findUnique({ where: { id: user.id } });
    const storedAccount = await db.account.findUnique({ where: { id: account.id } });
    expect(storedUser?.email).toBe("ada@example.com");
    expect(storedAccount).toMatchObject({
      userId: user.id,
      providerId: "google",
      accountId: "google-sub-123",
    });
  });

  it("creates a session and finds it again by its token", async () => {
    const internal = await adapter();
    const { user } = await createGoogleUser();

    const session = await internal.createSession(user.id);
    const found = await internal.findSession(session.token);

    expect(found?.user.id).toBe(user.id);
    expect(found?.session.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("finds no session once the user is deleted (sessions are revocable)", async () => {
    const internal = await adapter();
    const { user } = await createGoogleUser();
    const session = await internal.createSession(user.id);

    await db.user.delete({ where: { id: user.id } });

    expect(await internal.findSession(session.token)).toBeNull();
  });
});
