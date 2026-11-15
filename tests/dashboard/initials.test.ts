import { describe, expect, it } from "vitest";

import { initialsFor } from "@/lib/shared/initials";

describe("initialsFor (initials avatar when there's no photo, SPEC §11)", () => {
  it.each([
    ["Ada Lovelace", "AL"],
    ["ada", "A"],
    ["  grace   brewster   hopper ", "GH"],
    ["千尋", "千"],
    ["élodie durand", "ÉD"],
    ["", "?"],
    ["   ", "?"],
  ])("%j → %j", (name, expected) => {
    expect(initialsFor(name)).toBe(expected);
  });
});
