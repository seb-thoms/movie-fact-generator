import { describe, expect, it } from "vitest";

import { parseEnv } from "@/lib/server/env";

const validEnv = {
  DATABASE_URL: "postgresql://localhost:5432/movie_memory",
  BETTER_AUTH_SECRET: "a".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  OPENAI_API_KEY: "sk-test",
};

describe("parseEnv", () => {
  it("accepts a complete environment and applies defaults", () => {
    const env = parseEnv(validEnv);

    expect(env.FACT_STRATEGY).toBe("generate");
    expect(env.FACT_POOL_SIZE).toBe(10);
    expect(env.OPENAI_MODEL).toBeUndefined();
  });

  it("coerces FACT_POOL_SIZE from a string", () => {
    expect(parseEnv({ ...validEnv, FACT_POOL_SIZE: "25" }).FACT_POOL_SIZE).toBe(25);
  });

  it("fails fast, naming the missing variable", () => {
    const { OPENAI_API_KEY: _omitted, ...withoutKey } = validEnv;

    expect(() => parseEnv(withoutKey)).toThrow(/OPENAI_API_KEY/);
  });

  it("rejects a short auth secret and an unknown strategy", () => {
    expect(() => parseEnv({ ...validEnv, BETTER_AUTH_SECRET: "short" })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
    expect(() => parseEnv({ ...validEnv, FACT_STRATEGY: "random" })).toThrow(/FACT_STRATEGY/);
  });

  it("never includes secret values in the error message", () => {
    const secret = "super-secret-but-too-short";

    let message = "";
    try {
      parseEnv({ ...validEnv, BETTER_AUTH_SECRET: secret });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("BETTER_AUTH_SECRET");
    expect(message).not.toContain(secret);
  });
});
