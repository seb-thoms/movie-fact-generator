import "server-only";

import { z } from "zod";

import { AppError } from "./errors";

/**
 * Validates external input with a Zod schema. On failure, throws the SPEC §6
 * 422 VALIDATION_ERROR with field-level messages for the form.
 */
export function parseOrThrow<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
): z.infer<Schema> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const fieldErrors: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(z.flattenError(result.error).fieldErrors)) {
    if (Array.isArray(messages)) fieldErrors[field] = messages;
  }
  throw new AppError("VALIDATION_ERROR", 422, "Please check your input.", { fieldErrors });
}
