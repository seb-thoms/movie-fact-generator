import { describe, expect, it } from "vitest";

import { decideRoute } from "@/lib/shared/routes";

const signedOut = { signedIn: false, hasFavorite: false };
const firstTime = { signedIn: true, hasFavorite: false };
const returning = { signedIn: true, hasFavorite: true };
const signedInStates = [firstTime, returning];

describe("decideRoute (SPEC §5 routing rules)", () => {
  it("/ shows the landing page when signed out", () => {
    expect(decideRoute("/", signedOut)).toEqual({ type: "render" });
  });

  it("/ sends a first-time user (no favorite yet) to onboarding", () => {
    expect(decideRoute("/", firstTime)).toEqual({ type: "redirect", to: "/onboarding" });
  });

  it("/ sends a returning user (has a favorite) to the dashboard", () => {
    expect(decideRoute("/", returning)).toEqual({ type: "redirect", to: "/dashboard" });
  });

  it.each(["/dashboard", "/onboarding"] as const)("%s requires a session", (page) => {
    expect(decideRoute(page, signedOut)).toEqual({ type: "redirect", to: "/" });
  });

  it.each(["/dashboard", "/onboarding"] as const)(
    "%s renders for any signed-in user, with or without a favorite",
    (page) => {
      for (const state of signedInStates) {
        expect(decideRoute(page, state)).toEqual({ type: "render" });
      }
    },
  );
});
