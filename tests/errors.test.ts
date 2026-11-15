import { afterEach, describe, expect, it, vi } from "vitest";

import { AppError, toErrorResponse } from "@/lib/server/errors";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("toErrorResponse", () => {
  it("maps an AppError to its status and the SPEC §6 error shape", async () => {
    const response = toErrorResponse(new AppError("UNAUTHENTICATED", 401, "Please sign in."));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "UNAUTHENTICATED", message: "Please sign in." },
    });
  });

  it("includes field-level details for validation errors", async () => {
    const details = { fieldErrors: { title: ["Title is required."] } };
    const error = new AppError("VALIDATION_ERROR", 422, "Check the form.", details);

    const body = await toErrorResponse(error).json();

    expect(body).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Check the form.", details },
    });
  });

  it("turns an unknown error into a generic 500 without leaking its message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = toErrorResponse(new Error("connection string postgres://secret@db"));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("INTERNAL");
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("logs unknown errors server-side with an event name and error class", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    toErrorResponse(new TypeError("boom"));

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ event: "unhandled_error", errorClass: "TypeError" }),
    );
  });

  it("does not log expected AppErrors as unhandled", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    toErrorResponse(new AppError("UNAUTHENTICATED", 401, "Please sign in."));

    expect(log).not.toHaveBeenCalled();
  });
});
