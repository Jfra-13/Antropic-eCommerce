import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";
import type { Request, Response } from "express";

// Rate limiting, in three tiers. All of them key on the client IP, which is only correct if
// `trust proxy` matches the real deployment — see TRUST_PROXY in lib/env.ts.
//
// The limits are deliberately generous. The goal is to blunt scraping, credential stuffing
// and runaway clients, NOT to police normal use: a limiter that fires on a busy but honest
// shopper is a bug, and a backoffice that stops working mid-shift is worse than no limiter.
// The in-memory store is per-process, which is fine for a single API instance; running more
// than one requires a shared store (Redis) or each instance enforces its own share.

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

// 429s answer in the same {code, message} shape as every other error the API returns, so
// clients need no special case for them.
function tooMany(message: string) {
  return (_req: Request, res: Response): void => {
    res.status(429).json({ code: "RATE_LIMITED", message });
  };
}

const shared = {
  standardHeaders: true as const, // RateLimit-* headers so clients can back off politely
  legacyHeaders: false as const,
};

// Uptime monitors poll health every few seconds and must never be throttled. Both spellings
// are listed because req.path is relative to where the middleware is mounted: "/api/healthz"
// at app level (how it is mounted today), "/healthz" if it is ever moved inside the router.
// Matching only one silently stops exempting the route the day someone remounts it.
const HEALTH_PATHS = new Set(["/api/healthz", "/healthz"]);

// Catch-all ceiling. High enough that browsing the catalogue and polling the verification
// queue never reach it; low enough that a scraper does.
export const globalLimiter: RateLimitRequestHandler = rateLimit({
  ...shared,
  windowMs: FIVE_MINUTES_MS,
  limit: 600,
  skip: (req) => HEALTH_PATHS.has(req.path),
  handler: tooMany("Too many requests. Please wait a moment and try again."),
});

// Customer-facing writes: creating orders, quoting checkout, opening returns. Tighter,
// because each one costs a database transaction and there is no legitimate reason to do
// dozens per minute. Admin mutations are NOT covered here — the backoffice does bulk work
// and is already gated on a verified role.
export const writeLimiter: RateLimitRequestHandler = rateLimit({
  ...shared,
  windowMs: FIVE_MINUTES_MS,
  limit: 30,
  handler: tooMany("Too many requests. Please wait a moment and try again."),
});

// Signed upload URLs. Each call hits Supabase Storage, so this is the endpoint an abuser
// would pick to burn someone else's quota. Tightest of the three.
export const uploadUrlLimiter: RateLimitRequestHandler = rateLimit({
  ...shared,
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 15,
  handler: tooMany("Too many upload requests. Please wait a few minutes and try again."),
});
