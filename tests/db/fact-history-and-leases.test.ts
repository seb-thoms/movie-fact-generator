import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { capturedInsertColumns, createMovie, createUser, db, resetDatabase } from "../helpers/db";

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

async function createFact(movieId: string) {
  return db.movieFact.create({ data: { movieId, content: "A fact.", model: "test" } });
}

describe("FactDelivery", () => {
  it("records a delivery whose movieId matches its fact", async () => {
    const userId = await createUser("u1");
    const dune = await createMovie("dune", 2021);
    const fact = await createFact(dune.id);

    const delivery = await db.factDelivery.create({
      data: { userId, movieId: dune.id, movieFactId: fact.id },
    });

    expect(delivery.deliveredAt).toBeInstanceOf(Date);
  });

  it("rejects a delivery whose movieId doesn't match its fact (composite foreign key)", async () => {
    const userId = await createUser("u1");
    const dune = await createMovie("dune", 2021);
    const alien = await createMovie("alien", 1979);
    const duneFact = await createFact(dune.id);

    // Claims Dune's fact belongs to Alien: the database must refuse.
    const mismatched = db.factDelivery.create({
      data: { userId, movieId: alien.id, movieFactId: duneFact.id },
    });

    await expect(mismatched).rejects.toMatchObject({ code: "P2003" });
  });

  it("lets the database set deliveredAt (the cache window relies on the DB clock)", async () => {
    const userId = await createUser("u1");
    const dune = await createMovie("dune", 2021);
    const fact = await createFact(dune.id);

    const columns = await capturedInsertColumns("FactDelivery", (client) =>
      client.factDelivery.create({ data: { userId, movieId: dune.id, movieFactId: fact.id } }),
    );

    expect(columns).toBeDefined();
    expect(columns).not.toContain('"deliveredAt"');
  });

  it("prevents deleting a fact that has been delivered", async () => {
    const userId = await createUser("u1");
    const dune = await createMovie("dune", 2021);
    const fact = await createFact(dune.id);
    await db.factDelivery.create({ data: { userId, movieId: dune.id, movieFactId: fact.id } });

    await expect(db.movieFact.delete({ where: { id: fact.id } })).rejects.toMatchObject({
      code: expect.stringMatching(/^P20(03|14)$/),
    });
  });
});

describe("FactGenerationLease", () => {
  it("allows only one lease row per (user, movie)", async () => {
    const userId = await createUser("u1");
    const dune = await createMovie("dune", 2021);
    const lease = { userId, movieId: dune.id, lockedUntil: new Date() };
    await db.factGenerationLease.create({ data: { ...lease, holderId: "request-a" } });

    const second = db.factGenerationLease.create({ data: { ...lease, holderId: "request-b" } });

    await expect(second).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("deleting a user", () => {
  it("removes their deliveries and leases but keeps shared movies and facts", async () => {
    const userId = await createUser("u1");
    const dune = await createMovie("dune", 2021);
    const fact = await createFact(dune.id);
    await db.factDelivery.create({ data: { userId, movieId: dune.id, movieFactId: fact.id } });
    await db.factGenerationLease.create({
      data: { userId, movieId: dune.id, holderId: "request-a", lockedUntil: new Date() },
    });

    await db.user.delete({ where: { id: userId } });

    expect(await db.factDelivery.count()).toBe(0);
    expect(await db.factGenerationLease.count()).toBe(0);
    expect(await db.movie.count()).toBe(1);
    expect(await db.movieFact.count()).toBe(1);
  });
});
