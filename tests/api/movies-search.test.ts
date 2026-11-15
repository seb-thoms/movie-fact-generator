import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/movies/search/route";
import { AppError } from "@/lib/server/errors";
import { requireUser } from "@/lib/server/session";

import { db, resetDatabase } from "../helpers/db";

// CLAUDE.md: mock the session lookup at the requireUser() boundary.
vi.mock("@/lib/server/session", () => ({ requireUser: vi.fn() }));
const mockedRequireUser = vi.mocked(requireUser);

const signedInUser = { id: "u1", name: "Ada", email: "ada@example.com", image: null };

beforeEach(async () => {
  await resetDatabase();
  mockedRequireUser.mockReset();
  mockedRequireUser.mockResolvedValue(signedInUser);
});
afterAll(() => db.$disconnect());

function search(query: string) {
  return GET(new Request(`http://localhost:3000/api/movies/search${query}`));
}

describe("GET /api/movies/search", () => {
  it("returns 401 without a session", async () => {
    mockedRequireUser.mockRejectedValue(new AppError("UNAUTHENTICATED", 401, "Please sign in."));

    const response = await search("?q=dune");

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it("checks the session before validating input (401 wins over 422)", async () => {
    mockedRequireUser.mockRejectedValue(new AppError("UNAUTHENTICATED", 401, "Please sign in."));

    expect((await search("?q=a")).status).toBe(401);
  });

  it.each([
    ["a missing q", ""],
    ["a too-short q", "?q=a"],
    ["a q with no letters", "?q=%25_"],
  ])("returns 422 VALIDATION_ERROR for %s", async (_label, query) => {
    const response = await search(query);

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.fieldErrors.q).toBeDefined();
  });

  it("returns matching verified movies", async () => {
    const dune = await db.movie.create({
      data: { title: "Dune", normalizedTitle: "dune", releaseYear: 2021, status: "VERIFIED" },
    });

    const response = await search("?q=du");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      movies: [{ id: dune.id, title: "Dune", releaseYear: 2021 }],
    });
  });
});
