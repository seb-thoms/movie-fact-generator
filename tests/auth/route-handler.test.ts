import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/auth/[...all]/route";

describe("/api/auth route", () => {
  it("mounts Better Auth (its health endpoint answers)", async () => {
    const response = await GET(new Request("http://localhost:3000/api/auth/ok"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
