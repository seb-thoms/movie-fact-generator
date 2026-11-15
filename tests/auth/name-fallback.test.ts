import { describe, expect, it } from "vitest";

import { authOptions } from "@/lib/server/auth";
import { displayNameFromProfile } from "@/lib/server/display-name";

describe("displayNameFromProfile (SPEC §3.2 name fallback)", () => {
  it("keeps the Google name, trimmed", () => {
    expect(displayNameFromProfile("  Ada Lovelace ", "ada@example.com")).toBe("Ada Lovelace");
  });

  it.each([
    ["an empty name", ""],
    ["a whitespace-only name", "   "],
    ["a missing name", undefined],
  ])("falls back to the email prefix for %s", (_label, name) => {
    expect(displayNameFromProfile(name, "ada.lovelace+movies@example.com")).toBe(
      "ada.lovelace+movies",
    );
  });
});

describe("Google provider profile mapping", () => {
  const baseProfile = {
    aud: "client-id",
    azp: "client-id",
    email: "grace@example.com",
    email_verified: true,
    exp: 0,
    family_name: "",
    given_name: "",
    iat: 0,
    iss: "https://accounts.google.com",
    picture: "https://example.com/p.png",
    sub: "google-sub-1",
  };

  it("uses the email prefix when Google sends no name", async () => {
    const mapped = await authOptions.socialProviders.google.mapProfileToUser({
      ...baseProfile,
      name: "",
    });

    expect(mapped.name).toBe("grace");
  });

  it("keeps a real Google name", async () => {
    const mapped = await authOptions.socialProviders.google.mapProfileToUser({
      ...baseProfile,
      name: "Grace Hopper",
    });

    expect(mapped.name).toBe("Grace Hopper");
  });

  it("requests online access only, so Google issues no refresh token (SPEC §12)", () => {
    expect(authOptions.socialProviders.google.accessType).toBe("online");
  });
});
