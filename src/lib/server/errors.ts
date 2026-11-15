import "server-only";

import type { ApiErrorBody, ErrorCode, ValidationDetails } from "@/lib/shared/api";

/**
 * The one error type services throw (CLAUDE.md). `userMessage` must be safe to
 * show to end users; anything internal stays in logs.
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    readonly userMessage: string,
    readonly details?: ValidationDetails,
  ) {
    super(userMessage);
    this.name = "AppError";
  }
}

/**
 * Converts any thrown value into a SPEC §6 JSON error response. Route handlers
 * call this in their catch block. Unknown errors become a generic 500: their
 * details are logged server-side and never sent to the client.
 */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    const body: ApiErrorBody = {
      error: { code: error.code, message: error.userMessage, details: error.details },
    };
    return Response.json(body, { status: error.status });
  }

  console.error({
    event: "unhandled_error",
    errorClass: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : undefined,
  });
  const body: ApiErrorBody = {
    error: { code: "INTERNAL", message: "Something went wrong. Please try again." },
  };
  return Response.json(body, { status: 500 });
}
