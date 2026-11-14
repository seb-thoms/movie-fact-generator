import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";

import { db, resetDatabase } from "../helpers/db";

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

describe("user table", () => {
  it("rejects a second user with the same email", async () => {
    await db.user.create({ data: { id: "u1", name: "Ada", email: "ada@example.com" } });

    const duplicate = db.user.create({
      data: { id: "u2", name: "Ada 2", email: "ada@example.com" },
    });

    await expect(duplicate).rejects.toMatchObject({ code: "P2002" });
    await expect(duplicate).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it("stores createdAt as timestamptz with a database default", async () => {
    const [column] = await db.$queryRaw<{ data_type: string; column_default: string | null }[]>`
      SELECT data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'user' AND column_name = 'createdAt'`;

    expect(column?.data_type).toBe("timestamp with time zone");
    expect(column?.column_default).toBe("CURRENT_TIMESTAMP");
  });
});
