import { describe, expect, it } from "vitest";

import { FakeFactGenerator, found, notFound } from "../fakes/fake-fact-generator";

const dune = { title: "Dune", releaseYear: 2021 };

function request(signal: AbortSignal = new AbortController().signal) {
  return { ...dune, signal };
}

describe("FakeFactGenerator", () => {
  it("by default returns a found, distinct fact on every call", async () => {
    const generator = new FakeFactGenerator();

    const first = await generator.generate(request());
    const second = await generator.generate(request());

    expect(first).toMatchObject({ found: true, model: "fake-model" });
    expect(second.found && first.found && second.fact !== first.fact).toBe(true);
  });

  it("returns scripted responses in order, then falls back to the default", async () => {
    const generator = new FakeFactGenerator().respondWith(found("Scripted fact."), notFound());

    expect(await generator.generate(request())).toEqual(found("Scripted fact."));
    expect(await generator.generate(request())).toEqual(notFound());
    expect((await generator.generate(request())).found).toBe(true);
  });

  it("rejects when a scripted response is an Error (simulates an API failure)", async () => {
    const generator = new FakeFactGenerator().respondWith(new Error("OpenAI is down"));

    await expect(generator.generate(request())).rejects.toThrow("OpenAI is down");
  });

  it("records the title and year of every call", async () => {
    const generator = new FakeFactGenerator();

    await generator.generate(request());
    await generator.generate({ title: "Alien", releaseYear: 1979, signal: request().signal });

    expect(generator.calls).toEqual([dune, { title: "Alien", releaseYear: 1979 }]);
  });

  it("can be slow, to make concurrent requests overlap", async () => {
    const generator = new FakeFactGenerator({ delayMs: 50 });
    const started = Date.now();

    await generator.generate(request());

    expect(Date.now() - started).toBeGreaterThanOrEqual(45);
  });

  it("rejects with an AbortError as soon as the signal aborts (simulates the deadline)", async () => {
    const generator = new FakeFactGenerator({ delayMs: 10_000 });
    const controller = new AbortController();
    const started = Date.now();

    const pending = generator.generate(request(controller.signal));
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const generator = new FakeFactGenerator();

    await expect(generator.generate(request(AbortSignal.abort()))).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(generator.calls).toHaveLength(1);
  });
});
