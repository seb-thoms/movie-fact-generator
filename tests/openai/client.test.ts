import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createOpenAIClient,
  createProductionFactGenerator,
  DEFAULT_OPENAI_MODEL,
} from "@/lib/server/openai/client";

// Replace only the SDK's client class; error classes etc. stay real.
const sdk = vi.hoisted(() => ({
  constructorOptions: [] as unknown[],
  responsesCreate: vi.fn(),
  moderationsCreate: vi.fn(),
}));
vi.mock("openai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openai")>();
  class FakeOpenAI {
    responses = { create: sdk.responsesCreate };
    moderations = { create: sdk.moderationsCreate };
    constructor(options: unknown) {
      sdk.constructorOptions.push(options);
    }
  }
  return { ...actual, default: FakeOpenAI };
});

beforeEach(() => {
  sdk.constructorOptions.length = 0;
  sdk.responsesCreate.mockReset();
  sdk.moderationsCreate.mockReset();
});

describe("createOpenAIClient (SDK adapter)", () => {
  it("turns off the SDK's own retries, so our single retry is the only one", () => {
    createOpenAIClient("sk-test");

    expect(sdk.constructorOptions).toEqual([{ apiKey: "sk-test", maxRetries: 0 }]);
  });

  it("forwards requests and the abort signal to the SDK", async () => {
    sdk.responsesCreate.mockResolvedValue({ status: "completed", output_text: "{}", model: "m" });
    sdk.moderationsCreate.mockResolvedValue({ results: [{ flagged: false }] });
    const client = createOpenAIClient("sk-test");
    const signal = new AbortController().signal;

    await client.createResponse({ model: "m", input: "x" }, { signal });
    await client.moderate({ model: "omni-moderation-latest", input: "x" }, { signal });

    expect(sdk.responsesCreate).toHaveBeenCalledWith({ model: "m", input: "x" }, { signal });
    expect(sdk.moderationsCreate).toHaveBeenCalledWith(
      { model: "omni-moderation-latest", input: "x" },
      { signal },
    );
  });
});

describe("createProductionFactGenerator", () => {
  it("defaults to gpt-6-luna when OPENAI_MODEL is unset", async () => {
    expect(DEFAULT_OPENAI_MODEL).toBe("gpt-6-luna");
    sdk.responsesCreate.mockResolvedValue({
      status: "completed",
      output_text: JSON.stringify({ found: false, fact: null }),
      model: "gpt-6-luna",
    });

    await createProductionFactGenerator().generate({
      title: "Dune",
      releaseYear: 2021,
      signal: new AbortController().signal,
    });

    expect(sdk.responsesCreate.mock.calls[0]?.[0]).toMatchObject({ model: "gpt-6-luna" });
  });
});
