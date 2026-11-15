import { describe, expect, it } from "vitest";

import { toFactView } from "@/components/fact-view";

const factBody = (stale: boolean) => ({
  fact: { id: "f1", content: "Dune was filmed in Jordan.", createdAt: "2026-11-15T00:00:00.000Z" },
  source: stale ? "fallback" : "generated",
  stale,
});
const errorBody = (code: string) => ({ error: { code, message: "…" } });

describe("toFactView: API response → fact panel state (SPEC §11)", () => {
  it("shows a fresh fact", () => {
    expect(toFactView(200, factBody(false))).toEqual({
      kind: "fact",
      content: "Dune was filmed in Jordan.",
      stale: false,
    });
  });

  it("shows a stale fallback fact, flagged so the panel can say it's an earlier one", () => {
    expect(toFactView(200, factBody(true))).toMatchObject({ kind: "fact", stale: true });
  });

  it("treats a malformed success body as unavailable", () => {
    expect(toFactView(200, { nope: true })).toEqual({ kind: "unavailable" });
  });

  it("shows not-recognized for 422 MOVIE_NOT_RECOGNIZED", () => {
    expect(toFactView(422, errorBody("MOVIE_NOT_RECOGNIZED"))).toEqual({ kind: "notRecognized" });
  });

  it.each([
    ["503 FACT_UNAVAILABLE", 503, errorBody("FACT_UNAVAILABLE")],
    ["500 INTERNAL", 500, errorBody("INTERNAL")],
    ["an unexpected 422", 422, errorBody("VALIDATION_ERROR")],
    ["a non-JSON error", 502, null],
  ])("shows unavailable (with retry) for %s", (_label, status, body) => {
    expect(toFactView(status, body)).toEqual({ kind: "unavailable" });
  });

  it("signals signed-out on 401", () => {
    expect(toFactView(401, errorBody("UNAUTHENTICATED"))).toEqual({ kind: "signedOut" });
  });

  it("signals a changed favorite on 404 (e.g. edited in another tab)", () => {
    expect(toFactView(404, errorBody("NOT_FOUND"))).toEqual({ kind: "favoriteChanged" });
  });
});
