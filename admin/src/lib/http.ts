import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  status: number;
  code: string;
  data?: unknown;

  constructor(status: number, message: string, code: string, data?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
    this.name = "HttpError";
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "Authentication required", code = "UNAUTHORIZED") {
    super(401, message, code);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = "Forbidden", code = "FORBIDDEN") {
    super(403, message, code);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Not found", code = "NOT_FOUND") {
    super(404, message, code);
  }
}

export class ConflictError extends HttpError {
  constructor(message = "Conflict", code = "CONFLICT", data?: unknown) {
    super(409, message, code, data);
  }
}

export class BadRequestError extends HttpError {
  constructor(message = "Bad request", code = "BAD_REQUEST", data?: unknown) {
    super(400, message, code, data);
  }
}

export function json(data: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(data, { status, headers });
}

export function error(
  message: string,
  code: string,
  status = 400,
  extra?: Record<string, unknown>
) {
  return NextResponse.json(
    {
      error: message,
      code,
      ...(extra || {}),
    },
    { status }
  );
}

export function withHandler<C = void>(
  handler: (req: Request, context: C) => Promise<NextResponse | Response>
) {
  return async (req: Request, context?: unknown): Promise<NextResponse | Response> => {
    try {
      return await handler(req, context as C);
    } catch (err: unknown) {
      if (err instanceof HttpError) {
        return error(
          err.message,
          err.code,
          err.status,
          err.data ? (err.data as Record<string, unknown>) : undefined
        );
      }

      if (err instanceof ZodError) {
        return error("Validation failed", "VALIDATION_ERROR", 400, {
          issues: err.issues,
        });
      }

      const e = err as { code?: string; message?: string };
      // Postgres unique constraint violation
      if (e?.code === "23505") {
        return error(e.message || "Conflict: record already exists", "CONFLICT", 409);
      }

      console.error("[API Error]", err);
      return error(
        e?.message || "Internal server error",
        "INTERNAL_ERROR",
        500
      );
    }
  };
}
