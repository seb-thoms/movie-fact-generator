import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";

import { authOptions } from "@/lib/server/auth";

/**
 * A test-only Better Auth instance: the production options plus the testUtils
 * plugin, which can mint real, signed session cookies. Better Auth's docs say
 * to keep testUtils out of the production config, hence a separate instance.
 * It shares the secret and database, so the production `auth` accepts its
 * cookies exactly like a real login's.
 */
const testAuth = betterAuth({ ...authOptions, plugins: [testUtils()] });

/** Request headers carrying a valid session cookie for `userId`. */
export async function signedInHeaders(userId: string): Promise<Headers> {
  const ctx = await testAuth.$context;
  return ctx.test.getAuthHeaders({ userId });
}
