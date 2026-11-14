import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { db } from "@/lib/server/db";

/**
 * Empties every table between tests. The table list is written out (not built
 * dynamically) so the SQL stays a static, parameter-free tagged template.
 * CASCADE also clears rows in tables that reference these ones.
 */
export async function resetDatabase(): Promise<void> {
  await db.$executeRaw`
    TRUNCATE TABLE "user", "session", "account", "verification",
      "Movie", "UserFavoriteMovie", "MovieFact", "FactDelivery", "FactGenerationLease" CASCADE`;
}

/** Inserts a minimal user row and returns its id. */
export async function createUser(id: string): Promise<string> {
  await db.user.create({ data: { id, name: id, email: `${id}@example.com` } });
  return id;
}

/** Inserts a movie (display title = normalized title) and returns it. */
export function createMovie(normalizedTitle: string, releaseYear: number) {
  return db.movie.create({ data: { title: normalizedTitle, normalizedTitle, releaseYear } });
}

/**
 * Runs `work` with a query-logging Prisma client and returns the column list of
 * the first INSERT into `table`. Used to prove which columns Prisma sends, e.g.
 * that timestamps are left to the database clock.
 */
export async function capturedInsertColumns(
  table: string,
  work: (client: PrismaClient) => Promise<unknown>,
): Promise<string | undefined> {
  const logged = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    log: [{ emit: "event", level: "query" }],
  });
  const queries: string[] = [];
  logged.$on("query", (event) => queries.push(event.query));

  try {
    await work(logged);
  } finally {
    await logged.$disconnect();
  }

  const insert = queries.find((query) => query.startsWith(`INSERT INTO "public"."${table}"`));
  // Only the column list matters: RETURNING legitimately reads every column back.
  return insert?.split(" VALUES ")[0];
}

export { db };
