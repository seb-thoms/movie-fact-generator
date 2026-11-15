import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { config, proxy } from "@/proxy";

function requestTo(path: string, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

// The proxy is an optimistic shortcut only (SPEC §5): it checks that a session
// cookie exists, never that it's valid. requireUser() is the real check.
describe("proxy", () => {
  it.each(["/onboarding", "/dashboard"])(
    "redirects %s to / when there is no session cookie",
    (path) => {
      const response = proxy(requestTo(path));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("http://localhost:3000/");
    },
  );

  it("lets a request with a session cookie through", () => {
    const response = proxy(requestTo("/dashboard", "better-auth.session_token=abc.def"));

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("recognizes the production (__Secure-) cookie name", () => {
    const response = proxy(requestTo("/dashboard", "__Secure-better-auth.session_token=abc.def"));

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("only runs on the two signed-in pages", () => {
    expect(config.matcher).toEqual(["/onboarding", "/dashboard"]);
  });
});
