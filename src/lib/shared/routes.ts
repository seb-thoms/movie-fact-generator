// The SPEC §5 routing rules as one pure function, so every rule is unit-tested
// and pages just follow the decision.

export type AppPage = "/" | "/onboarding" | "/dashboard";
export type RouteState = { signedIn: boolean; hasFavorite: boolean };
export type RouteDecision = { type: "render" } | { type: "redirect"; to: AppPage };

export function decideRoute(page: AppPage, { signedIn, hasFavorite }: RouteState): RouteDecision {
  if (page === "/") {
    if (!signedIn) return { type: "render" }; // landing page
    // After sign-in (Better Auth returns to "/"): first-time users go to
    // onboarding, returning users to the dashboard (the take-home brief).
    return { type: "redirect", to: hasFavorite ? "/dashboard" : "/onboarding" };
  }
  // /dashboard (which also handles "no favorite" itself) and the movie page
  // (/onboarding, also used for editing) just require a session.
  return signedIn ? { type: "render" } : { type: "redirect", to: "/" };
}
