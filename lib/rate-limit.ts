import { NextRequest, NextResponse } from "next/server";

// ── In-memory rate limiter ──────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetAt: number; // timestamp ms
}

// Map key = `${ip}:${bucket}`, value = entry
const store = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 min

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}

function getClientIP(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Check rate limit for a request.
 *
 * @param req       - NextRequest
 * @param limit     - max number of requests allowed in the window
 * @param windowMs  - time window in milliseconds
 * @param bucket    - optional bucket name (defaults to "default")
 * @returns NextResponse with 429 if exceeded, or null if allowed
 */
export function rateLimit(
  req: NextRequest,
  limit: number,
  windowMs: number,
  bucket = "default",
): NextResponse | null {
  cleanup();

  const ip = getClientIP(req);
  const key = `${ip}:${bucket}`;
  const now = Date.now();

  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    // First request or window expired — start fresh
    store.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  entry.count += 1;

  if (entry.count > limit) {
    const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSec),
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(entry.resetAt / 1000)),
        },
      },
    );
  }

  return null;
}

// ── Presets ──────────────────────────────────────────────────────────────

const ONE_MINUTE = 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

/** 30 requests per minute — for read-only public endpoints */
export function rateLimitPublic(req: NextRequest): NextResponse | null {
  return rateLimit(req, 30, ONE_MINUTE, "public");
}

/** 30 requests per hour — for lead/simulation submission endpoints */
export function rateLimitSubmission(req: NextRequest): NextResponse | null {
  return rateLimit(req, 30, ONE_HOUR, "submission");
}
