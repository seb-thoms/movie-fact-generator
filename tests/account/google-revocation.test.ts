import { afterEach, describe, expect, it, vi } from "vitest";

import { revokeGoogleToken } from "@/lib/server/account/google-revocation";

afterEach(() => vi.unstubAllGlobals());

describe("revokeGoogleToken (Google OAuth revoke endpoint; no real network)", () => {
  it("POSTs the token form-encoded to https://oauth2.googleapis.com/revoke", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;

    await revokeGoogleToken("abc/123+=", signal);

    expect(fetchMock).toHaveBeenCalledWith("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "token=abc%2F123%2B%3D",
      signal,
    });
  });

  it("throws on a non-200 response, without the token in the message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 400 })));

    const attempt = revokeGoogleToken("SECRET-TOKEN", new AbortController().signal);

    await expect(attempt).rejects.toThrow(/400/);
    await expect(attempt).rejects.not.toThrow(/SECRET-TOKEN/);
  });
});
