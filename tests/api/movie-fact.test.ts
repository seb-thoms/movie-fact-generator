import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/movies/[movieId]/fact/route";
import { AppError } from "@/lib/server/errors";
import { createProductionFactGenerator } from "@/lib/server/openai/client";
import { requireUser } from "@/lib/server/session";

import { FakeFactGenerator, found } from "../fakes/fake-fact-generator";
import { createUser, db, resetDatabase } from "../helpers/db";
import { createFactAgo, createMovieWithStatus, deliverAgo, favorite } from "../helpers/facts";

vi.mock("@/lib/server/session", () => ({ requireUser: vi.fn() }));
// No test calls OpenAI: the route's production generator is swapped for the fake.
vi.mock("@/lib/server/openai/client", () => ({ createProductionFactGenerator: vi.fn() }));
const mockedRequireUser = vi.mocked(requireUser);
const mockedGeneratorFactory = vi.mocked(createProductionFactGenerator);

let userId: string;
let movieId: string;
let generator: FakeFactGenerator;

beforeEach(async () => {
  await resetDatabase();
  userId = await createUser("u1");
  movieId = (await createMovieWithStatus("Dune", 2021, "VERIFIED")).id;
  await favorite(userId, movieId);
  mockedRequireUser.mockReset();
  mockedRequireUser.mockResolvedValue({
    id: userId,
    name: "u1",
    email: "u1@example.com",
    image: null,
  });
  generator = new FakeFactGenerator();
  mockedGeneratorFactory.mockReset();
  mockedGeneratorFactory.mockReturnValue(generator);
});
afterAll(() => db.$disconnect());

function getFact(id: string) {
  return GET(new Request(`http://localhost:3000/api/movies/${id}/fact`), {
    params: Promise.resolve({ movieId: id }),
  });
}

describe("GET /api/movies/:movieId/fact", () => {
  it("returns 401 without a session", async () => {
    mockedRequireUser.mockRejectedValue(new AppError("UNAUTHENTICATED", 401, "Please sign in."));

    expect((await getFact(movieId)).status).toBe(401);
  });

  it("returns 404 NOT_FOUND for a movie that isn't the user's favorite", async () => {
    const other = await createMovieWithStatus("Alien", 1979, "VERIFIED");

    const response = await getFact(other.id);

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
  });

  it("returns a generated fact with stale: false and an ISO createdAt", async () => {
    generator.respondWith(found("Dune was filmed in Jordan."));

    const response = await getFact(movieId);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      fact: {
        id: expect.any(String),
        content: "Dune was filmed in Jordan.",
        createdAt: expect.any(String),
      },
      source: "generated",
      stale: false,
    });
    expect(new Date(body.fact.createdAt).toISOString()).toBe(body.fact.createdAt);
  });

  it("marks a fallback as stale: true", async () => {
    await deliverAgo(userId, movieId, await createFactAgo(movieId, "An older fact."), 3600);
    generator.respondWith(new Error("OpenAI is down"));

    const body = await (await getFact(movieId)).json();

    expect(body).toMatchObject({
      source: "fallback",
      stale: true,
      fact: { content: "An older fact." },
    });
  });

  it("returns 503 FACT_UNAVAILABLE with a retry-friendly message when nothing is available", async () => {
    generator.respondWith(new Error("OpenAI is down"));

    const response = await getFact(movieId);

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("FACT_UNAVAILABLE");
    expect(body.error.message).toMatch(/try again/i);
    expect(JSON.stringify(body)).not.toContain("OpenAI is down");
  });

  it("returns 422 MOVIE_NOT_RECOGNIZED for a NOT_RECOGNIZED movie", async () => {
    await db.movie.update({ where: { id: movieId }, data: { status: "NOT_RECOGNIZED" } });

    const response = await getFact(movieId);

    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("MOVIE_NOT_RECOGNIZED");
  });
});
