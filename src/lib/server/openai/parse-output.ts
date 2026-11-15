import "server-only";

import { z } from "zod";

export const MAX_FACT_LENGTH = 500;

/**
 * JSON schema sent to OpenAI with strict Structured Outputs. Strict mode
 * requires every property to be listed in `required` and
 * `additionalProperties: false`; "nullable" is expressed as a type union.
 */
export const FACT_JSON_SCHEMA = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    fact: { type: ["string", "null"] },
  },
  required: ["found", "fact"],
  additionalProperties: false,
} as const;

// We validate again ourselves: never trust model output just because a schema
// was requested.
const outputSchema = z.strictObject({ found: z.boolean(), fact: z.string().nullable() });

/** The model's answer was unusable. Counts as a generation failure. */
export class InvalidModelOutputError extends Error {
  constructor(reason: string) {
    // Only a short reason: the raw model output is never put in errors or logs.
    super(`Invalid model output: ${reason}`);
    this.name = "InvalidModelOutputError";
  }
}

export type ParsedFact = { found: true; fact: string } | { found: false; fact: null };

export function parseFactOutput(raw: { status: string; outputText: string }): ParsedFact {
  // "incomplete" usually means the output-token cap cut the JSON off.
  if (raw.status !== "completed") throw new InvalidModelOutputError(`status ${raw.status}`);

  let json: unknown;
  try {
    json = JSON.parse(raw.outputText);
  } catch {
    throw new InvalidModelOutputError("not JSON");
  }

  const result = outputSchema.safeParse(json);
  if (!result.success) throw new InvalidModelOutputError("wrong shape");

  if (!result.data.found) return { found: false, fact: null };

  const fact = result.data.fact?.trim() ?? "";
  if (fact === "") throw new InvalidModelOutputError("empty fact");
  if (fact.length > MAX_FACT_LENGTH) throw new InvalidModelOutputError("fact too long");
  return { found: true, fact };
}
