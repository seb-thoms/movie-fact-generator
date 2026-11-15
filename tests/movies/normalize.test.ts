import { describe, expect, it } from "vitest";

import { normalizeTitle, toDisplayTitle } from "@/lib/shared/movies";

describe("normalizeTitle (SPEC §4.1)", () => {
  it.each([
    ["Dune: Part Two", "dune part two"],
    ["Amélie", "amelie"],
    ["  The   Matrix  ", "the matrix"],
    ["WALL·E", "wall e"],
    ["Spider-Man: Into the Spider-Verse", "spider man into the spider verse"],
    ["Ocean's Eleven", "ocean s eleven"],
    ["Se7en", "se7en"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeTitle(input)).toBe(expected);
  });

  it("decomposes compatibility characters (NFKD): ligatures and Roman numerals", () => {
    expect(normalizeTitle("ﬁnding Ⅻ")).toBe("finding xii");
  });

  it("keeps the letters of non-Latin titles", () => {
    expect(normalizeTitle("千と千尋の神隠し")).toBe("千と千尋の神隠し");
    expect(normalizeTitle("Левиафан")).toBe("левиафан");
  });

  it("strips characters that are neither letters nor numbers, including SQL wildcards", () => {
    expect(normalizeTitle("%_!?")).toBe("");
  });

  it("is idempotent: normalizing twice changes nothing", () => {
    for (const title of ["Amélie", "기생충", "Dune: Part Two", "ﬁnding Ⅻ"]) {
      expect(normalizeTitle(normalizeTitle(title))).toBe(normalizeTitle(title));
    }
  });
});

describe("toDisplayTitle", () => {
  it("trims and collapses whitespace but keeps case, accents, and punctuation", () => {
    expect(toDisplayTitle("  Amélie:   The\tFabulous  ")).toBe("Amélie: The Fabulous");
  });
});
