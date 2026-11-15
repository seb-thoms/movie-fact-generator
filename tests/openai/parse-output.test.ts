import { describe, expect, it } from "vitest";

import {
  FACT_JSON_SCHEMA,
  InvalidModelOutputError,
  MAX_FACT_LENGTH,
  parseFactOutput,
} from "@/lib/server/openai/parse-output";

function completed(json: unknown) {
  return { status: "completed", outputText: JSON.stringify(json) };
}

describe("parseFactOutput (SPEC §8 structured output + validation)", () => {
  it("returns a found fact, trimmed", () => {
    expect(parseFactOutput(completed({ found: true, fact: "  A fact.  " }))).toEqual({
      found: true,
      fact: "A fact.",
    });
  });

  it("returns not-found with a null fact, ignoring any text the model added", () => {
    expect(parseFactOutput(completed({ found: false, fact: "I think…" }))).toEqual({
      found: false,
      fact: null,
    });
  });

  it.each([
    ["an empty fact", ""],
    ["a whitespace-only fact", "   "],
    ["a null fact", null],
  ])("rejects found: true with %s", (_label, fact) => {
    expect(() => parseFactOutput(completed({ found: true, fact }))).toThrow(
      InvalidModelOutputError,
    );
  });

  it(`accepts up to ${MAX_FACT_LENGTH} characters and rejects longer facts`, () => {
    expect(parseFactOutput(completed({ found: true, fact: "a".repeat(500) })).found).toBe(true);
    expect(() => parseFactOutput(completed({ found: true, fact: "a".repeat(501) }))).toThrow(
      InvalidModelOutputError,
    );
  });

  it.each([
    ["malformed JSON", { status: "completed", outputText: "{found: true" }],
    ["a wrong type", completed({ found: "yes", fact: "A fact." })],
    ["a missing field", completed({ found: true })],
    ["an extra field", completed({ found: true, fact: "A fact.", note: "hi" })],
    ["an incomplete (truncated) response", { status: "incomplete", outputText: '{"found": tr' }],
  ])("rejects %s", (_label, raw) => {
    expect(() => parseFactOutput(raw)).toThrow(InvalidModelOutputError);
  });

  it("never puts the model's raw output in the error message (it isn't logged)", () => {
    const secretLooking = "SENSITIVE-MODEL-TEXT";
    let thrown: unknown;
    try {
      parseFactOutput({ status: "completed", outputText: `{oops ${secretLooking}` });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidModelOutputError);
    expect(String(thrown)).not.toContain(secretLooking);
  });
});

describe("FACT_JSON_SCHEMA (sent to OpenAI in strict mode)", () => {
  it("requires exactly found (boolean) and fact (string or null)", () => {
    expect(FACT_JSON_SCHEMA).toEqual({
      type: "object",
      properties: {
        found: { type: "boolean" },
        fact: { type: ["string", "null"] },
      },
      required: ["found", "fact"],
      additionalProperties: false,
    });
  });
});
