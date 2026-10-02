import { NextResponse } from "next/server";
import { ZodError } from "zod";
import crypto from "node:crypto";

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
  constructor(message = "Conflict: record already exists", code = "CONFLICT", data?: unknown) {
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
  const requestId = crypto.randomUUID();
  return NextResponse.json(
    {
      error: message,
      code,
      request_id: requestId,
      ...(extra || {}),
    },
    { status }
  );
}

export function withHandler<C = void>(
  handler: (req: Request, context: C) => Promise<NextResponse | Response>
) {
  return async (req: Request, context?: unknown): Promise<NextResponse | Response> => {
    const requestId = crypto.randomUUID();
    try {
      return await handler(req, context as C);
    } catch (err: unknown) {
      if (err instanceof HttpError) {
        return NextResponse.json(
          {
            error: err.message,
            code: err.code,
            request_id: requestId,
            ...(err.data ? { details: err.data } : {}),
          },
          { status: err.status }
        );
      }

      if (err instanceof ZodError) {
        const issues = err.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        }));
        return NextResponse.json(
          {
            error: "Validation failed: please check your input",
            code: "VALIDATION_ERROR",
            request_id: requestId,
            issues,
          },
          { status: 400 }
        );
      }

      const e = err as { code?: string; message?: string };
      // Postgres unique constraint violation
      if (e?.code === "23505") {
        console.warn(`[Unique Constraint Conflict] [RequestID: ${requestId}]`, e.message);
        return NextResponse.json(
          {
            error: "Conflict: a record with these unique details already exists",
            code: "CONFLICT",
            request_id: requestId,
          },
          { status: 409 }
        );
      }

      // Never leak stack traces, database details, or internal server paths
      console.error(`[Internal Server Error] [RequestID: ${requestId}]`, err);
      return NextResponse.json(
        {
          error: "An unexpected internal server error occurred",
          code: "INTERNAL_ERROR",
          request_id: requestId,
        },
        { status: 500 }
      );
    }
  };
}
