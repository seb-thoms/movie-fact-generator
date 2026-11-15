import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic redirect only (SPEC §5): if there's no session cookie at all,
 * skip rendering and send the visitor to `/`. This checks that the cookie
 * EXISTS, not that it's valid. It is never the security boundary; every page
 * and route handler still verifies the session in the database
 * (requireUser / guardAppPage). See CVE-2025-29927.
 */
export function proxy(request: NextRequest): NextResponse {
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/onboarding", "/dashboard"] };
