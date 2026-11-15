import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient, type Prisma } from "@/generated/prisma/client";
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

/**
 * Makes a race deterministic. Opens a transaction, runs `setup` inside it
 * (its writes stay uncommitted and hold row locks), starts the `contenders`,
 * waits until `expectedBlocked` of their queries are stuck waiting on those
 * locks (pg_stat_activity), then commits. Every contender is guaranteed to
 * collide with `setup`'s rows instead of only sometimes, depending on timing.
 */
export async function raceAgainstUncommitted<T>(
  setup: (tx: Prisma.TransactionClient) => Promise<unknown>,
  contenders: () => Promise<T>[],
  expectedBlocked: number,
): Promise<PromiseSettledResult<T>[]> {
  let started: Promise<PromiseSettledResult<T>[]> = Promise.resolve([]);
  await db.$transaction(
    async (tx) => {
      await setup(tx);
      started = Promise.allSettled(contenders());
      await waitForBlockedQueries(expectedBlocked);
    },
    { timeout: 10_000 },
  );
  return started;
}

async function waitForBlockedQueries(expected: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [row] = await db.$queryRaw<{ blocked: number }[]>`
      SELECT count(*)::int AS blocked FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    if ((row?.blocked ?? 0) >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${expected} blocked queries`);
}

export { db };
