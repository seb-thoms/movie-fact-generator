import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE } from "@/app/api/me/route";
import { revokeGoogleToken } from "@/lib/server/account/google-revocation";
import { AppError } from "@/lib/server/errors";
import { requireUser } from "@/lib/server/session";

import { createUser, db, resetDatabase } from "../helpers/db";

vi.mock("@/lib/server/session", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/server/account/google-revocation", () => ({ revokeGoogleToken: vi.fn() }));
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
  vi.mocked(revokeGoogleToken).mockReset();
});
afterAll(() => db.$disconnect());

function del(body: string | undefined) {
  return DELETE(
    new Request("http://localhost:3000/api/me", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body,
    }),
  );
}

describe("DELETE /api/me (SPEC §12)", () => {
  it("returns 401 without a session", async () => {
    mockedRequireUser.mockRejectedValue(new AppError("UNAUTHENTICATED", 401, "Please sign in."));

    expect((await del('{"confirm":"delete"}')).status).toBe(401);
  });

  it("deletes the account, returns 204, and expires the session cookie", async () => {
    const response = await del('{"confirm":"delete"}');

    expect(response.status).toBe(204);
    expect(await db.user.count({ where: { id: userId } })).toBe(0);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("better-auth.session_token=;");
    expect(setCookie).toMatch(/Max-Age=0/i);
  });

  it.each([
    ["no body", undefined],
    ["malformed JSON", "{nope"],
    ["the wrong word", '{"confirm":"Delete"}'],
    ["extra keys", '{"confirm":"delete","really":true}'],
    ["an empty object", "{}"],
  ])("returns 400 BAD_CONFIRMATION for %s, deleting nothing", async (_label, body) => {
    const response = await del(body);

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("BAD_CONFIRMATION");
    expect(await db.user.count({ where: { id: userId } })).toBe(1);
  });
});
