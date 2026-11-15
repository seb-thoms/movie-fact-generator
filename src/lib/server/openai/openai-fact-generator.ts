import "server-only";

import { APIConnectionError, APIError, APIUserAbortError } from "openai";
import type { ModerationCreateParams } from "openai/resources/moderations";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";

import type { FactGenerator, FactRequest, FactResult } from "../facts/fact-generator";
import { FACT_JSON_SCHEMA, parseFactOutput } from "./parse-output";
import { buildFactPrompt } from "./prompt";

export const MAX_OUTPUT_TOKENS = 150;
export const MODERATION_MODEL = "omni-moderation-latest";
const MAX_ATTEMPTS = 2; // one call + at most one retry (SPEC §8)

/** Moderation flagged the generated fact. Counts as a generation failure. */
export class FlaggedFactError extends Error {
  constructor() {
    super("Generated fact was flagged by moderation");
    this.name = "FlaggedFactError";
  }
}

/**
 * The two OpenAI calls we make, as a narrow interface. Production adapts the
 * real SDK (client.ts); tests pass a stub, so no test touches the network.
 */
export interface FactModelClient {
  createResponse(
    params: ResponseCreateParamsNonStreaming,
    options: { signal: AbortSignal },
  ): Promise<{ status?: string; output_text: string; model: string }>;
  moderate(
    params: ModerationCreateParams,
    options: { signal: AbortSignal },
  ): Promise<{ results: { flagged: boolean }[] }>;
}

type Options = { client: FactModelClient; model: string; retryDelayMs?: number };

/**
 * FactGenerator backed by OpenAI (SPEC §8). One AbortSignal (the caller's
 * deadline) covers the call, the retry, and moderation. Any failure rejects.
 */
export function createOpenAIFactGenerator({
  client,
  model,
  retryDelayMs = 500,
}: Options): FactGenerator {
  return {
    async generate({ title, releaseYear, signal }: FactRequest): Promise<FactResult> {
      const startedAt = Date.now();
      let attempts = 0;
      try {
        signal.throwIfAborted();
        const { instructions, input } = buildFactPrompt(title, releaseYear);
        const params: ResponseCreateParamsNonStreaming = {
          model,
          instructions,
          input,
          max_output_tokens: MAX_OUTPUT_TOKENS,
          // No hidden reasoning tokens, so the small output cap goes to the answer.
          reasoning: { effort: "none" },
          text: {
            format: {
              type: "json_schema",
              name: "movie_fact",
              schema: FACT_JSON_SCHEMA,
              strict: true,
            },
          },
          // Don't keep the response stored on OpenAI's side.
          store: false,
          // Least privilege: no `tools`. The model can only return text.
        };

        let response: Awaited<ReturnType<FactModelClient["createResponse"]>> | undefined;
        while (!response) {
          attempts++;
          try {
            response = await client.createResponse(params, { signal });
          } catch (error) {
            if (attempts >= MAX_ATTEMPTS || signal.aborted || !isRetryable(error)) throw error;
            await wait(retryDelayMs, signal);
          }
        }

        const parsed = parseFactOutput({
          status: response.status ?? "unknown",
          outputText: response.output_text,
        });
        if (!parsed.found) {
          logOutcome({ outcome: "not_found", model, attempts, startedAt });
          return { found: false, fact: null, model: response.model };
        }

        const moderation = await client.moderate(
          { model: MODERATION_MODEL, input: parsed.fact },
          { signal },
        );
        if (moderation.results.length === 0 || moderation.results.some((r) => r.flagged)) {
          throw new FlaggedFactError();
        }

        logOutcome({ outcome: "found", model, attempts, startedAt });
        return { found: true, fact: parsed.fact, model: response.model };
      } catch (error) {
        console.warn({
          event: "fact_generation",
          outcome: "failed",
          model,
          attempts,
          durationMs: Date.now() - startedAt,
          errorClass: error instanceof Error ? error.constructor.name : typeof error,
          status: error instanceof APIError ? error.status : undefined,
        });
        throw error;
      }
    },
  };
}

/** SPEC §8: retry only connection errors, 429, and 5xx. Never a user abort. */
function isRetryable(error: unknown): boolean {
  if (error instanceof APIUserAbortError) return false;
  if (error instanceof APIConnectionError) return true;
  if (error instanceof APIError && typeof error.status === "number") {
    return error.status === 429 || error.status >= 500;
  }
  return false;
}

function logOutcome(details: {
  outcome: "found" | "not_found";
  model: string;
  attempts: number;
  startedAt: number;
}) {
  // Never the prompt, the title, or the fact: SPEC §13 forbids logging bodies.
  console.info({
    event: "fact_generation",
    outcome: details.outcome,
    model: details.model,
    attempts: details.attempts,
    durationMs: Date.now() - details.startedAt,
  });
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal.reason);
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
