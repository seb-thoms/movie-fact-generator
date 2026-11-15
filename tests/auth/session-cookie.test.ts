import { betterAuth, type BetterAuthOptions } from "better-auth";
import { describe, expect, it } from "vitest";

import { auth, authOptions } from "@/lib/server/auth";

// Reads the attributes Better Auth will actually set on the session cookie,
// straight from the configured instance (SPEC §5: HttpOnly, SameSite=Lax,
// Secure in production).
describe("session cookie attributes", () => {
  it("is HttpOnly and SameSite=Lax", async () => {
    const { attributes } = (await auth.$context).authCookies.sessionToken;

    expect(attributes.httpOnly).toBe(true);
    expect(attributes.sameSite?.toString().toLowerCase()).toBe("lax");
  });

  it("is Secure when the app is served over https (production)", async () => {
    const productionAuth = betterAuth({ ...authOptions, baseURL: "https://movie-memory.example" });

    const { attributes } = (await productionAuth.$context).authCookies.sessionToken;

    expect(attributes.secure).toBe(true);
  });

  it("doesn't cache sessions in a cookie, so revoking a session takes effect on the next request", async () => {
    // Widen to the general options type: our literal config has no `session` key.
    const options: BetterAuthOptions = (await auth.$context).options;

    expect(options.session?.cookieCache?.enabled ?? false).toBe(false);
  });
});
