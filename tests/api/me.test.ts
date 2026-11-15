import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/me/route";
import { AppError } from "@/lib/server/errors";
import { requireUser } from "@/lib/server/session";

import { createUser, db, resetDatabase } from "../helpers/db";
import { createMovieWithStatus, favorite } from "../helpers/facts";

vi.mock("@/lib/server/session", () => ({ requireUser: vi.fn() }));
const mockedRequireUser = vi.mocked(requireUser);

let userId: string;
const sessionUser = () => ({
  id: userId,
  name: "Ada Lovelace",
  email: "ada@example.com",
  image: "https://lh3.googleusercontent.com/a/photo",
});

beforeEach(async () => {
  await resetDatabase();
  userId = await createUser("u1");
  mockedRequireUser.mockReset();
  mockedRequireUser.mockResolvedValue(sessionUser());
});
afterAll(() => db.$disconnect());

describe("GET /api/me (SPEC §6)", () => {
  it("returns 401 without a session", async () => {
    mockedRequireUser.mockRejectedValue(new AppError("UNAUTHENTICATED", 401, "Please sign in."));

    expect((await GET()).status).toBe(401);
  });

  it("returns the user and their favorite movie", async () => {
    const movie = await createMovieWithStatus("Dune", 2021, "VERIFIED");
    await favorite(userId, movie.id);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user: sessionUser(),
      favoriteMovies: [{ id: movie.id, title: "Dune", releaseYear: 2021, status: "VERIFIED" }],
    });
  });

  it("returns a favorite without a year as releaseYear null", async () => {
    const movie = await createMovieWithStatus("Dune", null, "PENDING");
    await favorite(userId, movie.id);

    const body = await (await GET()).json();

    expect(body.favoriteMovies).toEqual([
      { id: movie.id, title: "Dune", releaseYear: null, status: "PENDING" },
    ]);
  });

  it("returns an empty list when no favorite is set", async () => {
    const body = await (await GET()).json();

    expect(body.favoriteMovies).toEqual([]);
  });

  it("never returns another user's favorite", async () => {
    const otherUser = await createUser("u2");
    const movie = await createMovieWithStatus("Alien", 1979, "VERIFIED");
    await favorite(otherUser, movie.id);

    const body = await (await GET()).json();

    expect(body.favoriteMovies).toEqual([]);
  });
});
