import { HttpError } from "./http";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory rate limiting cache
// Note: In serverless environments, each instance keeps its own memory.
// For production multi-region deployments, use Redis / Supabase KV.
const rateLimitStore = new Map<string, RateLimitEntry>();

export function checkRateLimit(
  identifier: string,
  limit = 60,
  windowMs = 60000
): void {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  if (!entry || entry.resetAt <= now) {
    rateLimitStore.set(identifier, {
      count: 1,
      resetAt: now + windowMs,
    });
    return;
  }

  if (entry.count >= limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    throw new HttpError(
      429,
      `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
      "RATE_LIMIT_EXCEEDED",
      { retryAfter }
    );
  }

  entry.count += 1;
}
