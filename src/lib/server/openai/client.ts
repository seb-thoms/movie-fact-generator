import "server-only";

import OpenAI from "openai";

import { env } from "../env";
import type { FactGenerator } from "../facts/fact-generator";
import { createOpenAIFactGenerator, type FactModelClient } from "./openai-fact-generator";

/**
 * Cheapest current (non-deprecated) model, per OpenAI's pricing and
 * deprecation pages as of Nov 2026. Override with OPENAI_MODEL.
 */
export const DEFAULT_OPENAI_MODEL = "gpt-6-luna";

/** Adapts the official SDK to the two calls our generator makes. */
export function createOpenAIClient(apiKey: string): FactModelClient {
  // maxRetries: 0 because our generator does its own single retry (SPEC §8);
  // SDK retries on top would multiply attempts and blow the deadline.
  const openai = new OpenAI({ apiKey, maxRetries: 0 });
  return {
    createResponse: (params, options) => openai.responses.create(params, options),
    moderate: (params, options) => openai.moderations.create(params, options),
  };
}

/** The FactGenerator the app uses in production. */
export function createProductionFactGenerator(): FactGenerator {
  return createOpenAIFactGenerator({
    client: createOpenAIClient(env.OPENAI_API_KEY),
    model: env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
  });
}
