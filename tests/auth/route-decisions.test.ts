import { describe, expect, it } from "vitest";

import { decideRoute } from "@/lib/shared/routes";

const signedOut = { signedIn: false };
const signedIn = { signedIn: true };

describe("decideRoute (SPEC §5 routing rules)", () => {
  it("/ shows the landing page when signed out", () => {
    expect(decideRoute("/", signedOut)).toEqual({ type: "render" });
  });

  it("/ always sends a signed-in user to /dashboard", () => {
    expect(decideRoute("/", signedIn)).toEqual({ type: "redirect", to: "/dashboard" });
  });

  it.each(["/dashboard", "/onboarding"] as const)("%s requires a session", (page) => {
    expect(decideRoute(page, signedOut)).toEqual({ type: "redirect", to: "/" });
  });

  it.each(["/dashboard", "/onboarding"] as const)(
    "%s renders for any signed-in user, with or without a favorite",
    (page) => {
      expect(decideRoute(page, signedIn)).toEqual({ type: "render" });
    },
  );
});
