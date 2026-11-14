import { afterAll, describe, expect, it } from "vitest";

import { db } from "../helpers/db";

afterAll(() => db.$disconnect());

// Every DB test truncates tables. This guard proves they run against the
// dedicated test database (vitest.config.mts builds DATABASE_URL only from
// TEST_DATABASE_URL), so a test run can never wipe the dev database.
describe("test database guard", () => {
  it("connects to the database named in the test DATABASE_URL", async () => {
    const [row] = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    const configuredName = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);

    expect(row?.name).toBe(configuredName);
  });

  it("is a test database, not the dev database", async () => {
    const [row] = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;

    expect(row?.name).toMatch(/_test$/);
  });
});
