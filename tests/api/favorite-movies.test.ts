import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/me/favorite-movies/route";
import { AppError } from "@/lib/server/errors";
import { createProductionFactGenerator } from "@/lib/server/openai/client";
import { requireUser } from "@/lib/server/session";

import { createUser, db, resetDatabase } from "../helpers/db";

vi.mock("@/lib/server/session", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/server/openai/client", () => ({ createProductionFactGenerator: vi.fn() }));
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
  vi.mocked(createProductionFactGenerator).mockClear();
});
afterAll(() => db.$disconnect());

function post(body: string) {
  return POST(
    new Request("http://localhost:3000/api/me/favorite-movies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
  );
}

const duneBody = JSON.stringify({ title: "Dune", releaseYear: 2021 });

describe("POST /api/me/favorite-movies", () => {
  it("returns 401 without a session", async () => {
    mockedRequireUser.mockRejectedValue(new AppError("UNAUTHENTICATED", 401, "Please sign in."));

    expect((await post(duneBody)).status).toBe(401);
  });

  it("returns 201 with the movie when the favorite is created", async () => {
    const response = await post(duneBody);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      movie: { id: expect.any(String), title: "Dune", releaseYear: 2021, status: "PENDING" },
    });
  });

  it("returns 200 with the same movie on an idempotent retry", async () => {
    const first = await (await post(duneBody)).json();

    const retry = await post(duneBody);

    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(first);
  });

  it("returns 409 FAVORITE_EXISTS for a different movie", async () => {
    await post(duneBody);

    const response = await post(JSON.stringify({ title: "Alien", releaseYear: 1979 }));

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("FAVORITE_EXISTS");
  });

  it("returns 422 VALIDATION_ERROR with field details for an invalid body", async () => {
    const response = await post(JSON.stringify({ title: "", releaseYear: 1700 }));

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(body.error.details.fieldErrors).sort()).toEqual(["releaseYear", "title"]);
  });

  it("returns 422 for a body that isn't JSON", async () => {
    const response = await post("{not json");

    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("never creates a FactGenerator: onboarding makes no OpenAI call (SPEC §9, §14.7)", async () => {
    await post(duneBody);

    expect(createProductionFactGenerator).not.toHaveBeenCalled();
  });
});
