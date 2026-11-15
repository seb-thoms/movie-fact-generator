import "server-only";

import { redirect } from "next/navigation";

import { decideRoute } from "@/lib/shared/routes";

import { getOptionalUser, type SessionUser } from "./session";

/**
 * Page-level guards: the authoritative version of the SPEC §5 redirects. Each
 * page calls one of these first. The session is checked against the database
 * (via requireUser), unlike the proxy's cookie-presence shortcut.
 */

/** For `/`: returns normally to render the landing page, otherwise redirects. */
export async function guardLandingPage(): Promise<void> {
  const user = await getOptionalUser();
  const decision = decideRoute("/", { signedIn: user !== null });
  if (decision.type === "redirect") redirect(decision.to);
}

/** For signed-in pages: returns the user, or redirects to `/`. */
export async function guardAppPage(page: "/onboarding" | "/dashboard"): Promise<SessionUser> {
  const user = await getOptionalUser();
  const decision = decideRoute(page, { signedIn: user !== null });
  if (decision.type === "redirect") redirect(decision.to);
  // decideRoute already redirected signed-out visitors; this narrows the type.
  if (!user) redirect("/");
  return user;
}
