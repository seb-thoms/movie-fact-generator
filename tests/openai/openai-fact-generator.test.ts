import { APIConnectionError, APIError, APIUserAbortError } from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createOpenAIFactGenerator,
  FlaggedFactError,
  MAX_OUTPUT_TOKENS,
  MODERATION_MODEL,
  type FactModelClient,
} from "@/lib/server/openai/openai-fact-generator";
import { FACT_JSON_SCHEMA, InvalidModelOutputError } from "@/lib/server/openai/parse-output";
import { buildFactPrompt } from "@/lib/server/openai/prompt";

type ModelResponse = { status: string; output_text: string; model: string };

/** Stands in for the OpenAI SDK: scripted responses, recorded calls, no network. */
class StubModelClient implements FactModelClient {
  readonly responseCalls: { params: unknown; signal: AbortSignal }[] = [];
  readonly moderationCalls: { params: unknown; signal: AbortSignal }[] = [];
  private readonly responses: (ModelResponse | Error)[] = [];
  private flagged = false;

  willRespond(...responses: (ModelResponse | Error)[]): this {
    this.responses.push(...responses);
    return this;
  }

  willFlag(): this {
    this.flagged = true;
    return this;
  }

  async createResponse(params: unknown, { signal }: { signal: AbortSignal }) {
    this.responseCalls.push({ params, signal });
    const next = this.responses.shift();
    if (!next) throw new Error("StubModelClient: no scripted response left");
    if (next instanceof Error) throw next;
    return next;
  }

  async moderate(params: unknown, { signal }: { signal: AbortSignal }) {
    this.moderationCalls.push({ params, signal });
    return { results: [{ flagged: this.flagged }] };
  }
}

const MODEL = "gpt-6-luna";
const foundResponse = (fact = "Dune was filmed in Jordan.") => ({
  status: "completed",
  output_text: JSON.stringify({ found: true, fact }),
  model: "gpt-6-luna-2026-10-01",
});
const notFoundResponse = () => ({
  status: "completed",
  output_text: JSON.stringify({ found: false, fact: null }),
  model: "gpt-6-luna-2026-10-01",
});
const apiError = (status: number) => new APIError(status, undefined, `HTTP ${status}`, undefined);

function setup(client: StubModelClient) {
  return createOpenAIFactGenerator({ client, model: MODEL, retryDelayMs: 0 });
}

function dune(signal: AbortSignal = new AbortController().signal) {
  return { title: "Dune", releaseYear: 2021, signal };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OpenAI FactGenerator: the request", () => {
  it("sends the prompt with strict structured output, a small output cap, no reasoning, no tools", async () => {
    const client = new StubModelClient().willRespond(foundResponse());
    const signal = new AbortController().signal;

    await setup(client).generate(dune(signal));

    const { instructions, input } = buildFactPrompt("Dune", 2021);
    expect(client.responseCalls).toHaveLength(1);
    expect(client.responseCalls[0]?.params).toEqual({
      model: MODEL,
      instructions,
      input,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      reasoning: { effort: "none" },
      text: {
        format: { type: "json_schema", name: "movie_fact", schema: FACT_JSON_SCHEMA, strict: true },
      },
      store: false,
    });
    expect(client.responseCalls[0]?.signal).toBe(signal);
  });

  it("caps output at about 150 tokens (SPEC §8)", () => {
    expect(MAX_OUTPUT_TOKENS).toBe(150);
  });
});

describe("OpenAI FactGenerator: results and moderation", () => {
  it("moderates a found fact and returns it with the model that produced it", async () => {
    const client = new StubModelClient().willRespond(foundResponse("Dune was filmed in Jordan."));

    const result = await setup(client).generate(dune());

    expect(result).toEqual({
      found: true,
      fact: "Dune was filmed in Jordan.",
      model: "gpt-6-luna-2026-10-01",
    });
    expect(client.moderationCalls).toHaveLength(1);
    expect(client.moderationCalls[0]?.params).toEqual({
      model: MODERATION_MODEL,
      input: "Dune was filmed in Jordan.",
    });
  });

  it("rejects a fact that moderation flags (counts as a generation failure)", async () => {
    const client = new StubModelClient().willRespond(foundResponse()).willFlag();

    await expect(setup(client).generate(dune())).rejects.toBeInstanceOf(FlaggedFactError);
  });

  it("returns not-found without calling moderation", async () => {
    const client = new StubModelClient().willRespond(notFoundResponse());

    const result = await setup(client).generate(dune());

    expect(result).toEqual({ found: false, fact: null, model: "gpt-6-luna-2026-10-01" });
    expect(client.moderationCalls).toHaveLength(0);
  });

  it("rejects invalid model output without retrying", async () => {
    const client = new StubModelClient().willRespond({
      status: "incomplete",
      output_text: '{"found": tr',
      model: MODEL,
    });

    await expect(setup(client).generate(dune())).rejects.toBeInstanceOf(InvalidModelOutputError);
    expect(client.responseCalls).toHaveLength(1);
  });
});

describe("OpenAI FactGenerator: retry (SPEC §8: at most 1, only connection errors, 429, 5xx)", () => {
  it.each([
    ["a connection error", () => new APIConnectionError({ message: "socket hang up" })],
    ["429 rate limit", () => apiError(429)],
    ["500 server error", () => apiError(500)],
    ["503 unavailable", () => apiError(503)],
  ])("retries once after %s, then succeeds", async (_label, makeError) => {
    const client = new StubModelClient().willRespond(makeError(), foundResponse());

    const result = await setup(client).generate(dune());

    expect(result.found).toBe(true);
    expect(client.responseCalls).toHaveLength(2);
  });

  it.each([
    ["400 bad request", 400],
    ["401 unauthorized", 401],
  ])("does not retry %s", async (_label, status) => {
    const client = new StubModelClient().willRespond(apiError(status), foundResponse());

    await expect(setup(client).generate(dune())).rejects.toBeInstanceOf(APIError);
    expect(client.responseCalls).toHaveLength(1);
  });

  it("retries at most once", async () => {
    const client = new StubModelClient().willRespond(apiError(503), apiError(503), foundResponse());

    await expect(setup(client).generate(dune())).rejects.toMatchObject({ status: 503 });
    expect(client.responseCalls).toHaveLength(2);
  });
});

describe("OpenAI FactGenerator: deadline (one AbortSignal for everything)", () => {
  it("does not call OpenAI when the signal has already aborted", async () => {
    const client = new StubModelClient().willRespond(foundResponse());

    await expect(setup(client).generate(dune(AbortSignal.abort()))).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(client.responseCalls).toHaveLength(0);
  });

  it("does not retry once the deadline has passed", async () => {
    const controller = new AbortController();
    const client = new StubModelClient();
    client.createResponse = async (params, { signal }) => {
      client.responseCalls.push({ params, signal });
      controller.abort();
      throw new APIUserAbortError();
    };

    await expect(setup(client).generate(dune(controller.signal))).rejects.toBeDefined();
    expect(client.responseCalls).toHaveLength(1);
  });

  it("passes the same signal to moderation", async () => {
    const client = new StubModelClient().willRespond(foundResponse());
    const signal = new AbortController().signal;

    await setup(client).generate(dune(signal));

    expect(client.moderationCalls[0]?.signal).toBe(signal);
  });
});

describe("OpenAI FactGenerator: logging (SPEC §13)", () => {
  it("logs the outcome, model, and duration, but never the prompt or the fact", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const client = new StubModelClient().willRespond(foundResponse("SECRET-FACT-TEXT"));

    await setup(client).generate(dune());

    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "fact_generation",
        outcome: "found",
        model: MODEL,
        attempts: 1,
        durationMs: expect.any(Number),
      }),
    );
    const logged = JSON.stringify(info.mock.calls);
    expect(logged).not.toContain("SECRET-FACT-TEXT");
    expect(logged).not.toContain("movie_data");
  });

  it("logs failures with the error class", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = new StubModelClient().willRespond(apiError(400));

    await expect(setup(client).generate(dune())).rejects.toBeDefined();

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "fact_generation",
        outcome: "failed",
        errorClass: "APIError",
        status: 400,
      }),
    );
  });
});
