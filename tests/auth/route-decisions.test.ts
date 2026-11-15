import { describe, expect, it } from "vitest";

import { decideRoute } from "@/lib/shared/routes";

const signedOut = { signedIn: false, hasFavorite: false };
const noFavorite = { signedIn: true, hasFavorite: false };
const hasFavorite = { signedIn: true, hasFavorite: true };

describe("decideRoute (SPEC §5 routing rules)", () => {
  describe("/", () => {
    it("shows the landing page when signed out", () => {
      expect(decideRoute("/", signedOut)).toEqual({ type: "render" });
    });

    it("sends a signed-in user without a favorite to /onboarding", () => {
      expect(decideRoute("/", noFavorite)).toEqual({ type: "redirect", to: "/onboarding" });
    });

    it("sends a signed-in user with a favorite to /dashboard", () => {
      expect(decideRoute("/", hasFavorite)).toEqual({ type: "redirect", to: "/dashboard" });
    });
  });

  describe("/onboarding", () => {
    it("requires a session", () => {
      expect(decideRoute("/onboarding", signedOut)).toEqual({ type: "redirect", to: "/" });
    });

    it("renders for a signed-in user without a favorite", () => {
      expect(decideRoute("/onboarding", noFavorite)).toEqual({ type: "render" });
    });

    it("redirects to /dashboard once a favorite exists", () => {
      expect(decideRoute("/onboarding", hasFavorite)).toEqual({
        type: "redirect",
        to: "/dashboard",
      });
    });
  });

  describe("/dashboard", () => {
    it("requires a session", () => {
      expect(decideRoute("/dashboard", signedOut)).toEqual({ type: "redirect", to: "/" });
    });

    it("redirects to /onboarding when there is no favorite", () => {
      expect(decideRoute("/dashboard", noFavorite)).toEqual({
        type: "redirect",
        to: "/onboarding",
      });
    });

    it("renders for a signed-in user with a favorite", () => {
      expect(decideRoute("/dashboard", hasFavorite)).toEqual({ type: "render" });
    });
  });
});
