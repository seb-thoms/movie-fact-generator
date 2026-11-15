import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { guardAppPage, guardLandingPage } from "@/lib/server/page-guards";

import { signedInHeaders } from "../helpers/auth";
import { createMovie, createUser, db, resetDatabase } from "../helpers/db";

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));

// Next's redirect() throws to stop rendering. The mock does the same, so a
// test can assert where the page would have redirected.
class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect to ${to}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));

beforeEach(async () => {
  await resetDatabase();
  request.headers = new Headers();
});
afterAll(() => db.$disconnect());

async function signIn(userId: string) {
  request.headers = await signedInHeaders(userId);
}

async function giveFavorite(userId: string) {
  const dune = await createMovie("dune", 2021);
  await db.userFavoriteMovie.create({ data: { userId, movieId: dune.id } });
}

describe("guardLandingPage (/)", () => {
  it("lets a signed-out visitor see the landing page", async () => {
    await expect(guardLandingPage()).resolves.toBeUndefined();
  });

  it("redirects a signed-in user without a favorite to /dashboard", async () => {
    await signIn(await createUser("u1"));

    await expect(guardLandingPage()).rejects.toMatchObject({ to: "/dashboard" });
  });

  it("redirects a signed-in user with a favorite to /dashboard", async () => {
    const userId = await createUser("u1");
    await giveFavorite(userId);
    await signIn(userId);

    await expect(guardLandingPage()).rejects.toMatchObject({ to: "/dashboard" });
  });
});

describe("guardAppPage", () => {
  it.each(["/dashboard", "/onboarding"] as const)(
    "redirects a signed-out visitor from %s to /",
    async (page) => {
      await expect(guardAppPage(page)).rejects.toMatchObject({ to: "/" });
    },
  );

  it("redirects a forged cookie to / (the database check, not just cookie presence)", async () => {
    request.headers = new Headers({ cookie: "better-auth.session_token=forged.signature" });

    await expect(guardAppPage("/dashboard")).rejects.toMatchObject({ to: "/" });
  });

  it.each(["/dashboard", "/onboarding"] as const)(
    "returns the user on %s without a favorite",
    async (page) => {
      const userId = await createUser("u1");
      await signIn(userId);

      await expect(guardAppPage(page)).resolves.toMatchObject({ id: userId });
    },
  );

  it.each(["/dashboard", "/onboarding"] as const)(
    "returns the user on %s with a favorite (the movie page is also for editing)",
    async (page) => {
      const userId = await createUser("u1");
      await giveFavorite(userId);
      await signIn(userId);

      await expect(guardAppPage(page)).resolves.toMatchObject({ id: userId });
    },
  );
});
