import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";

import { createUser, db, resetDatabase } from "../helpers/db";

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

function createMovie(normalizedTitle: string, releaseYear: number) {
  return db.movie.create({ data: { title: normalizedTitle, normalizedTitle, releaseYear } });
}

describe("Movie", () => {
  it("allows only one row per (normalizedTitle, releaseYear)", async () => {
    await createMovie("dune", 2021);

    await expect(createMovie("dune", 2021)).rejects.toMatchObject({ code: "P2002" });
  });

  it("allows the same title in a different year (remakes)", async () => {
    await createMovie("dune", 1984);

    await expect(createMovie("dune", 2021)).resolves.toMatchObject({ releaseYear: 2021 });
  });

  it("starts as PENDING with no status timestamp", async () => {
    const movie = await createMovie("dune", 2021);

    expect(movie.status).toBe("PENDING");
    expect(movie.statusUpdatedAt).toBeNull();
  });

  it("lets the database set createdAt (Prisma sends no app-server timestamp)", async () => {
    // A separate client with query logging, so we can see the exact INSERT.
    const logged = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
      log: [{ emit: "event", level: "query" }],
    });
    const queries: string[] = [];
    logged.$on("query", (event) => queries.push(event.query));

    try {
      await logged.movie.create({
        data: { title: "Dune", normalizedTitle: "dune", releaseYear: 2021 },
      });
    } finally {
      await logged.$disconnect();
    }

    const insert = queries.find((query) => query.startsWith('INSERT INTO "public"."Movie"'));
    // Only the column list matters: RETURNING legitimately reads createdAt back.
    const insertedColumns = insert?.split(" VALUES ")[0];
    expect(insertedColumns).toBeDefined();
    expect(insertedColumns).not.toContain('"createdAt"');
  });
});

describe("UserFavoriteMovie", () => {
  it("allows only one favorite per user (temporary constraint)", async () => {
    const userId = await createUser("u1");
    const dune = await createMovie("dune", 2021);
    const alien = await createMovie("alien", 1979);
    await db.userFavoriteMovie.create({ data: { userId, movieId: dune.id } });

    const second = db.userFavoriteMovie.create({ data: { userId, movieId: alien.id } });

    await expect(second).rejects.toMatchObject({ code: "P2002" });
  });

  it("is removed when its user is deleted, while the shared movie survives", async () => {
    const userId = await createUser("u1");
    const dune = await createMovie("dune", 2021);
    await db.userFavoriteMovie.create({ data: { userId, movieId: dune.id } });

    await db.user.delete({ where: { id: userId } });

    expect(await db.userFavoriteMovie.count()).toBe(0);
    expect(await db.movie.count()).toBe(1);
  });
});

describe("MovieFact", () => {
  it("prevents deleting a movie that still has facts", async () => {
    const dune = await createMovie("dune", 2021);
    await db.movieFact.create({ data: { movieId: dune.id, content: "A fact.", model: "test" } });

    await expect(db.movie.delete({ where: { id: dune.id } })).rejects.toMatchObject({
      code: expect.stringMatching(/^P20(03|14)$/),
    });
  });
});
