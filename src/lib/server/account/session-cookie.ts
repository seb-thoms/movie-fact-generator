import "server-only";

import { auth } from "../auth";

/**
 * A Set-Cookie value that expires the Better Auth session cookie. After account
 * deletion the session row is already gone (so the cookie is useless), but
 * clearing it lets the browser forget it immediately. The name comes from
 * Better Auth's own config, so the production "__Secure-" prefix is handled.
 */
export async function expiredSessionCookie(): Promise<string> {
  const { name, attributes } = (await auth.$context).authCookies.sessionToken;
  const parts = [`${name}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax"];
  if (attributes.secure) parts.push("Secure");
  return parts.join("; ");
}
