import type { FactGenerator, FactRequest, FactResult } from "@/lib/server/facts/fact-generator";

export const FAKE_MODEL = "fake-model";

export function found(fact: string): FactResult {
  return { found: true, fact, model: FAKE_MODEL };
}

export function notFound(): FactResult {
  return { found: false, fact: null, model: FAKE_MODEL };
}

/**
 * Test double for FactGenerator (no test ever calls OpenAI).
 * - By default, every call returns a distinct found fact.
 * - `respondWith(...)` scripts responses in order; an Error makes that call reject.
 * - `delayMs` makes calls slow, so concurrent requests overlap; the delay
 *   honors the AbortSignal like a real network call would.
 * - `calls` records every request's title and year.
 */
export class FakeFactGenerator implements FactGenerator {
  readonly calls: { title: string; releaseYear: number }[] = [];
  private readonly scripted: (FactResult | Error)[] = [];
  private readonly delayMs: number;

  constructor(options: { delayMs?: number } = {}) {
    this.delayMs = options.delayMs ?? 0;
  }

  respondWith(...responses: (FactResult | Error)[]): this {
    this.scripted.push(...responses);
    return this;
  }

  async generate({ title, releaseYear, signal }: FactRequest): Promise<FactResult> {
    this.calls.push({ title, releaseYear });
    await waitUnlessAborted(this.delayMs, signal);

    const response = this.scripted.shift() ?? found(`Fact #${this.calls.length} about ${title}.`);
    if (response instanceof Error) throw response;
    return response;
  }
}

function waitUnlessAborted(ms: number, signal: AbortSignal): Promise<void> {
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
