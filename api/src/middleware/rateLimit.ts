import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { config } from "../config.js";

// ─── In-memory rate limiter (for dev / single-instance) ──────────────────────
// In production with multiple instances, swap the store for a Redis-backed one
// via @fastify/rate-limit's redis option.

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

function getKey(req: FastifyRequest, prefix: string): string {
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown";
  return `${prefix}:${ip}`;
}

function checkLimit(
  key: string,
  max: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1, resetAt: now + windowMs };
  }

  entry.count++;
  const remaining = Math.max(0, max - entry.count);
  return {
    allowed: entry.count <= max,
    remaining,
    resetAt: entry.resetAt,
  };
}

// Periodically clean up expired entries to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 60_000);

// ─── Fastify hook factories ───────────────────────────────────────────────────

export interface RateLimitOptions {
  max: number;
  windowMs: number;
  prefix?: string;
  message?: string;
}

/**
 * Returns a Fastify preHandler hook that enforces rate limiting.
 */
export function createRateLimitHook(options: RateLimitOptions) {
  const {
    max,
    windowMs,
    prefix = "rl",
    message = "Too many requests. Please try again later.",
  } = options;

  return async function rateLimitHook(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const key = getKey(req, prefix);
    const { allowed, remaining, resetAt } = checkLimit(key, max, windowMs);

    reply.header("X-RateLimit-Limit", max);
    reply.header("X-RateLimit-Remaining", remaining);
    reply.header("X-RateLimit-Reset", Math.ceil(resetAt / 1000));

    if (!allowed) {
      const retryAfterSecs = Math.ceil((resetAt - Date.now()) / 1000);
      reply.header("Retry-After", retryAfterSecs);
      await reply.status(429).send({
        statusCode: 429,
        error: "Too Many Requests",
        message,
      });
    }
  };
}

// ─── Pre-configured limiters ─────────────────────────────────────────────────

/** General API rate limiter (100 req / 60 s). */
export const generalRateLimit = createRateLimitHook({
  max: config.rateLimit.max,
  windowMs: config.rateLimit.windowMs,
  prefix: "general",
});

/** Strict auth endpoint limiter (10 req / 5 min). */
export const authRateLimit = createRateLimitHook({
  max: config.rateLimit.authMax,
  windowMs: config.rateLimit.authWindowMs,
  prefix: "auth",
  message:
    "Too many authentication attempts. Please wait before trying again.",
});

/** Password-reset limiter (5 req / 15 min per IP). */
export const passwordResetRateLimit = createRateLimitHook({
  max: 5,
  windowMs: 15 * 60 * 1000,
  prefix: "pwd-reset",
  message:
    "Too many password reset requests. Please wait before trying again.",
});
