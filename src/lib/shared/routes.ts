// The SPEC §5 routing rules as one pure function, so every rule is unit-tested
// and pages just follow the decision.

export type AppPage = "/" | "/onboarding" | "/dashboard";
export type RouteState = { signedIn: boolean };
export type RouteDecision = { type: "render" } | { type: "redirect"; to: AppPage };

export function decideRoute(page: AppPage, { signedIn }: RouteState): RouteDecision {
  if (page === "/") {
    // Landing page for visitors; signed-in users always go to the dashboard,
    // which handles "no favorite yet" itself (SPEC §11).
    return signedIn ? { type: "redirect", to: "/dashboard" } : { type: "render" };
  }
  // /dashboard and the movie page (/onboarding) just require a session.
  return signedIn ? { type: "render" } : { type: "redirect", to: "/" };
}
