import "server-only";

import { redirect } from "next/navigation";

import { decideRoute, type RouteState } from "@/lib/shared/routes";

import { hasFavoriteMovie } from "./movies/onboarding-state";
import { getOptionalUser, type SessionUser } from "./session";

/**
 * Page-level guards: the authoritative version of the SPEC §5 redirects. Each
 * page calls one of these first. The session is checked against the database
 * (via requireUser), unlike the proxy's cookie-presence shortcut.
 */
async function loadRouteState(): Promise<{ user: SessionUser | null; state: RouteState }> {
  const user = await getOptionalUser();
  const hasFavorite = user ? await hasFavoriteMovie(user.id) : false;
  return { user, state: { signedIn: user !== null, hasFavorite } };
}

/** For `/`: returns normally to render the landing page, otherwise redirects. */
export async function guardLandingPage(): Promise<void> {
  const { state } = await loadRouteState();
  const decision = decideRoute("/", state);
  if (decision.type === "redirect") redirect(decision.to);
}

/** For signed-in pages: returns the user, or redirects per SPEC §5. */
export async function guardAppPage(page: "/onboarding" | "/dashboard"): Promise<SessionUser> {
  const { user, state } = await loadRouteState();
  const decision = decideRoute(page, state);
  if (decision.type === "redirect") redirect(decision.to);
  // decideRoute already redirected signed-out visitors; this narrows the type.
  if (!user) redirect("/");
  return user;
}
