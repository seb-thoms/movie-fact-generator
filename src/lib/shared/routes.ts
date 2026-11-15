// The SPEC §5 routing rules as one pure function, so every rule is unit-tested
// and pages just follow the decision.

export type AppPage = "/" | "/onboarding" | "/dashboard";
export type RouteState = { signedIn: boolean; hasFavorite: boolean };
export type RouteDecision = { type: "render" } | { type: "redirect"; to: AppPage };

const render: RouteDecision = { type: "render" };
const redirectTo = (to: AppPage): RouteDecision => ({ type: "redirect", to });

export function decideRoute(page: AppPage, { signedIn, hasFavorite }: RouteState): RouteDecision {
  if (page === "/") {
    if (!signedIn) return render; // landing page
    return redirectTo(hasFavorite ? "/dashboard" : "/onboarding");
  }

  // /onboarding and /dashboard both require a session.
  if (!signedIn) return redirectTo("/");

  if (page === "/onboarding") return hasFavorite ? redirectTo("/dashboard") : render;
  return hasFavorite ? render : redirectTo("/onboarding");
}
