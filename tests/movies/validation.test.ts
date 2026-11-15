import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/server/errors";
import { parseOrThrow } from "@/lib/server/validation";
import {
  deleteConfirmationSchema,
  favoriteMovieInputSchema,
  searchQuerySchema,
} from "@/lib/shared/schemas";

const currentYear = new Date().getUTCFullYear();
const valid = { title: "Dune", releaseYear: 2021 };

function accepts(input: unknown) {
  return favoriteMovieInputSchema.safeParse(input).success;
}

describe("favorite movie input: title (SPEC §4.2)", () => {
  it("trims the title", () => {
    expect(favoriteMovieInputSchema.parse({ ...valid, title: "  Dune  " }).title).toBe("Dune");
  });

  it("accepts 1 to 100 characters", () => {
    expect(accepts({ ...valid, title: "A" })).toBe(true);
    expect(accepts({ ...valid, title: "a".repeat(100) })).toBe(true);
  });

  it("rejects an empty, whitespace-only, or too-long title", () => {
    expect(accepts({ ...valid, title: "" })).toBe(false);
    expect(accepts({ ...valid, title: "   " })).toBe(false);
    expect(accepts({ ...valid, title: "a".repeat(101) })).toBe(false);
  });

  it.each([
    ["a newline", "Dune\nPart Two"],
    ["a tab", "Dune\tPart Two"],
    ["a NUL byte", "Dune\u0000"],
  ])("rejects control characters: %s", (_label, title) => {
    expect(accepts({ ...valid, title })).toBe(false);
  });

  it.each([
    ["a right-to-left override", "Dune‮owt trap"],
    ["a zero-width space", "Du​ne"],
  ])("rejects invisible format characters: %s", (_label, title) => {
    expect(accepts({ ...valid, title })).toBe(false);
  });

  it("rejects a title with no letters or numbers (empty after normalization)", () => {
    expect(accepts({ ...valid, title: "!!!" })).toBe(false);
  });

  it("requires a string title", () => {
    expect(accepts({ releaseYear: 2021 })).toBe(false);
    expect(accepts({ ...valid, title: 42 })).toBe(false);
  });
});

describe("favorite movie input: releaseYear (SPEC §4.2)", () => {
  it("accepts 1888 through the current year + 2", () => {
    expect(accepts({ ...valid, releaseYear: 1888 })).toBe(true);
    expect(accepts({ ...valid, releaseYear: currentYear + 2 })).toBe(true);
  });

  it("rejects years outside the range", () => {
    expect(accepts({ ...valid, releaseYear: 1887 })).toBe(false);
    expect(accepts({ ...valid, releaseYear: currentYear + 3 })).toBe(false);
  });

  it("requires an integer number", () => {
    expect(accepts({ ...valid, releaseYear: 2021.5 })).toBe(false);
    expect(accepts({ ...valid, releaseYear: "2021" })).toBe(false);
    expect(accepts({ title: "Dune" })).toBe(false);
  });
});

describe("search query q (SPEC §4.2)", () => {
  function acceptsQuery(q: unknown) {
    return searchQuerySchema.safeParse({ q }).success;
  }

  it("accepts a query with at least 2 characters after normalization", () => {
    expect(acceptsQuery("du")).toBe(true);
    expect(acceptsQuery("Dune: Part")).toBe(true);
  });

  it("rejects fewer than 2 characters after normalization", () => {
    expect(acceptsQuery("d")).toBe(false);
    expect(acceptsQuery("a!")).toBe(false);
    expect(acceptsQuery("%_")).toBe(false);
  });

  it("rejects an empty, missing, or over-100-character raw query", () => {
    expect(acceptsQuery("")).toBe(false);
    expect(acceptsQuery(undefined)).toBe(false);
    expect(acceptsQuery("a".repeat(101))).toBe(false);
  });
});

describe("delete confirmation (SPEC §4.2)", () => {
  function acceptsBody(body: unknown) {
    return deleteConfirmationSchema.safeParse(body).success;
  }

  it('accepts exactly { "confirm": "delete" }', () => {
    expect(acceptsBody({ confirm: "delete" })).toBe(true);
  });

  it("rejects anything else", () => {
    expect(acceptsBody({ confirm: "Delete" })).toBe(false);
    expect(acceptsBody({ confirm: "delete", extra: true })).toBe(false);
    expect(acceptsBody({})).toBe(false);
    expect(acceptsBody(null)).toBe(false);
  });
});

describe("parseOrThrow", () => {
  it("returns the parsed value when valid", () => {
    expect(parseOrThrow(favoriteMovieInputSchema, { title: " Dune ", releaseYear: 2021 })).toEqual({
      title: "Dune",
      releaseYear: 2021,
    });
  });

  it("throws 422 VALIDATION_ERROR with field-level details", () => {
    let thrown: unknown;
    try {
      parseOrThrow(favoriteMovieInputSchema, { title: "", releaseYear: 1700 });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AppError);
    expect(thrown).toMatchObject({ code: "VALIDATION_ERROR", status: 422 });
    const { fieldErrors } = (thrown as AppError).details ?? { fieldErrors: {} };
    expect(Object.keys(fieldErrors).sort()).toEqual(["releaseYear", "title"]);
  });
});
