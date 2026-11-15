import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/server/errors";
import { requireUser } from "@/lib/server/session";

import { signedInHeaders } from "../helpers/auth";
import { createUser, db, resetDatabase } from "../helpers/db";

// requireUser reads the incoming request's headers via next/headers, which only
// works inside a Next.js request. Tests supply the headers directly. Everything
// else (Better Auth, cookie signing, the session lookup) is real.
const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));

beforeEach(async () => {
  await resetDatabase();
  request.headers = new Headers();
});
afterAll(() => db.$disconnect());

async function expectUnauthenticated() {
  const attempt = requireUser();
  await expect(attempt).rejects.toBeInstanceOf(AppError);
  await expect(attempt).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
}

describe("requireUser (SPEC §5 data access layer)", () => {
  it("returns the session's user for a valid session cookie", async () => {
    const userId = await createUser("u1");
    request.headers = await signedInHeaders(userId);

    await expect(requireUser()).resolves.toEqual({
      id: userId,
      name: "u1",
      email: "u1@example.com",
      image: null,
    });
  });

  it("rejects a request with no session cookie", async () => {
    await expectUnauthenticated();
  });

  it("rejects a forged session cookie", async () => {
    request.headers = new Headers({ cookie: "better-auth.session_token=forged.signature" });

    await expectUnauthenticated();
  });

  it("rejects an expired session", async () => {
    const userId = await createUser("u1");
    request.headers = await signedInHeaders(userId);
    await db.$executeRaw`
      UPDATE "session" SET "expiresAt" = now() - interval '1 second' WHERE "userId" = ${userId}`;

    await expectUnauthenticated();
  });

  it("rejects a revoked session (sessions live in the database)", async () => {
    const userId = await createUser("u1");
    request.headers = await signedInHeaders(userId);
    await db.session.deleteMany({ where: { userId } });

    await expectUnauthenticated();
  });

  it("rejects a session whose user was deleted", async () => {
    const userId = await createUser("u1");
    request.headers = await signedInHeaders(userId);
    await db.user.delete({ where: { id: userId } });

    await expectUnauthenticated();
  });
});
