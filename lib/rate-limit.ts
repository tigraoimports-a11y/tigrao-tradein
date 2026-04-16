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

/**
 * 30 requests per hour — for lead/simulation/form submission endpoints.
 *
 * Opcionalmente aceita um bucket para separar contadores por endpoint.
 * Se não passar bucket, cai no "submission" (retrocompat com chamadas antigas).
 *
 * Exemplos:
 *   rateLimitSubmission(req)              → bucket "submission" (leads etc)
 *   rateLimitSubmission(req, "mp-form")   → bucket "submission:mp-form"
 *   rateLimitSubmission(req, "link-fill") → bucket "submission:link-fill"
 */
export function rateLimitSubmission(
  req: NextRequest,
  bucket?: string,
): NextResponse | null {
  const bucketName = bucket ? `submission:${bucket}` : "submission";
  return rateLimit(req, 30, ONE_HOUR, bucketName);
}

// ── Honeypot ─────────────────────────────────────────────────────────────

/**
 * Nome do campo honeypot que fica oculto nos formulários públicos.
 *
 * Bots que fazem scraping de formulários preenchem todos os inputs que
 * encontram. Humanos nunca veem esse campo (está escondido via CSS/aria).
 * Se vier preenchido, é bot.
 *
 * Retorna 200 OK (fingindo sucesso) em vez de 400/403 pra não dar feedback
 * pro bot — ele pensa que funcionou e não retenta/refina ataque.
 */
export const HONEYPOT_FIELD = "website";

export function checkHoneypot(
  body: Record<string, unknown> | null | undefined,
): NextResponse | null {
  if (!body) return null;
  const val = body[HONEYPOT_FIELD];
  if (typeof val === "string" && val.trim() !== "") {
    console.warn("[honeypot] bot detected, dropping submission");
    // 200 fake-success pra bot não descobrir que foi pego
    return NextResponse.json({ ok: true }, { status: 200 });
  }
  return null;
}
