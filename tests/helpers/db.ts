import { db } from "@/lib/server/db";

/**
 * Empties every table between tests. The table list is written out (not built
 * dynamically) so the SQL stays a static, parameter-free tagged template.
 * CASCADE also clears rows in tables that reference these ones.
 */
export async function resetDatabase(): Promise<void> {
  await db.$executeRaw`TRUNCATE TABLE "user", "Movie", "UserFavoriteMovie", "MovieFact" CASCADE`;
}

export { db };

/** Inserts a minimal user row and returns its id. */
export async function createUser(id: string): Promise<string> {
  await db.user.create({ data: { id, name: id, email: `${id}@example.com` } });
  return id;
}
