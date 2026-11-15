import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PUT } from "@/app/api/me/favorite-movie/route";
import { AppError } from "@/lib/server/errors";
import { requireUser } from "@/lib/server/session";

import { createUser, db, resetDatabase } from "../helpers/db";

vi.mock("@/lib/server/session", () => ({ requireUser: vi.fn() }));
const mockedRequireUser = vi.mocked(requireUser);

let userId: string;

beforeEach(async () => {
  await resetDatabase();
  userId = await createUser("u1");
  mockedRequireUser.mockReset();
  mockedRequireUser.mockResolvedValue({
    id: userId,
    name: "u1",
    email: "u1@example.com",
    image: null,
  });
});
afterAll(() => db.$disconnect());

function put(body: string) {
  return PUT(
    new Request("http://localhost:3000/api/me/favorite-movie", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body,
    }),
  );
}

describe("PUT /api/me/favorite-movie", () => {
  it("returns 401 without a session", async () => {
    mockedRequireUser.mockRejectedValue(new AppError("UNAUTHENTICATED", 401, "Please sign in."));

    expect((await put(JSON.stringify({ title: "Dune" }))).status).toBe(401);
  });

  it("returns 201 when setting the first favorite (year optional)", async () => {
    const response = await put(JSON.stringify({ title: "Dune" }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      movie: { id: expect.any(String), title: "Dune", releaseYear: null, status: "PENDING" },
    });
  });

  it("returns 200 when replacing the favorite", async () => {
    await put(JSON.stringify({ title: "Dune", releaseYear: 2021 }));

    const response = await put(JSON.stringify({ title: "Alien", releaseYear: 1979 }));

    expect(response.status).toBe(200);
    expect((await response.json()).movie.title).toBe("Alien");
  });

  it("returns 422 with field details for an invalid body or malformed JSON", async () => {
    const invalid = await put(JSON.stringify({ title: "", releaseYear: 1700 }));
    const malformed = await put("{nope");

    expect(invalid.status).toBe(422);
    expect(Object.keys((await invalid.json()).error.details.fieldErrors).sort()).toEqual([
      "releaseYear",
      "title",
    ]);
    expect(malformed.status).toBe(422);
  });
});
