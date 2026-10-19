import type { RequestHandler } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db, profiles, type Profile } from "@workspace/db";
import { env } from "./env";

// Supabase issues JWTs to the frontend (Google OAuth / Magic Link). The API verifies
// the signature server-side against Supabase's JWKS. createRemoteJWKSet caches the key
// set after the first fetch, so there is NO network call per request.
//
// NOTE: this requires the Supabase project to use ASYMMETRIC JWT signing keys (the
// JWKS endpoint only serves keys in that mode). Enable it in the dashboard:
// Authentication -> JWT Keys -> migrate to asymmetric. Legacy HS256 shared-secret
// projects will fail verification here.
const JWKS = createRemoteJWKSet(
  new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
);
const ISSUER = `${env.SUPABASE_URL}/auth/v1`;

export type Role = Profile["role"];
export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  fullName: string | null;
  phone: string | null;
  shippingAddress: string | null;
  // The address THIS session's JWT proves the caller controls, or null when the sign-in method
  // proves nothing. Deliberately separate from `email` (the profile copy, written once and never
  // synced): the profile address can differ from the one the token vouches for. Not part of any
  // response — it gates the one thing that hands data over by email alone: claiming guest orders.
  provenEmail: string | null;
};

// Sign-in methods that only succeed for whoever controls the mailbox: a magic link / OTP is
// delivered to it, and the OAuth provider (Google) vouches for an address it has verified.
// A password proves nothing about the address — with email confirmation switched off in the
// Supabase dashboard, anyone can register any address — so it is deliberately absent, and an
// anonymous session never qualifies.
const EMAIL_PROVING_METHODS = new Set(["otp", "magiclink", "oauth"]);

// Supabase writes `amr` either as RFC 8176 strings or as {method, timestamp} entries (custom
// access-token hooks may emit either). Anything else, or no claim at all, is "not proven":
// failing closed only costs a guest order that stays reachable through its emailed link.
export function sessionProvesEmail(payload: Record<string, unknown>): boolean {
  if (payload["is_anonymous"] === true) return false;
  const amr = payload["amr"];
  if (!Array.isArray(amr)) return false;
  return amr.some((entry: unknown) => {
    const method =
      typeof entry === "string"
        ? entry
        : typeof entry === "object" && entry !== null
          ? (entry as { method?: unknown }).method
          : undefined;
    return typeof method === "string" && EMAIL_PROVING_METHODS.has(method);
  });
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// Get the caller's profile, creating a default `customer` row on first sight. The
// profile mirrors Supabase auth.users but lives in `public` (no cross-schema FK), so
// it is bootstrapped lazily here rather than by a DB trigger.
async function getOrCreateProfile(id: string, email: string): Promise<Profile> {
  const existing = await db.select().from(profiles).where(eq(profiles.id, id)).limit(1);
  if (existing[0]) return existing[0];

  const inserted = await db
    .insert(profiles)
    .values({ id, email })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];

  // Lost an insert race with a concurrent request — read the row the winner wrote.
  const again = await db.select().from(profiles).where(eq(profiles.id, id)).limit(1);
  if (!again[0]) throw new Error(`Profile ${id} vanished after conflict`);
  return again[0];
}

function bearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith("Bearer ")) return undefined;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : undefined;
}

// Verifies the bearer JWT, bootstraps/loads the profile, and attaches req.user.
export const requireAuth: RequestHandler = async (req, res, next) => {
  const token = bearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ code: "UNAUTHENTICATED", message: "Missing bearer token" });
    return;
  }

  let sub: string;
  let email: string;
  let provenEmail: string | null;
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: ISSUER,
      audience: "authenticated",
    });
    if (!payload.sub) {
      res.status(401).json({ code: "UNAUTHENTICATED", message: "Token has no subject" });
      return;
    }
    sub = payload.sub;
    email = typeof payload["email"] === "string" ? payload["email"] : "";
    provenEmail = sessionProvesEmail(payload) && email.trim() ? email.trim() : null;
  } catch {
    res.status(401).json({ code: "UNAUTHENTICATED", message: "Invalid or expired token" });
    return;
  }

  const profile = await getOrCreateProfile(sub, email);
  if (profile.blocked) {
    res.status(403).json({ code: "BLOCKED", message: "Account is blocked" });
    return;
  }

  req.user = {
    id: profile.id,
    email: profile.email,
    role: profile.role,
    fullName: profile.fullName,
    phone: profile.phone,
    shippingAddress: profile.shippingAddress,
    provenEmail,
  };
  next();
};

// Like requireAuth but lets anonymous callers through with req.user unset. A present-but-invalid
// token is still a 401 — silently downgrading a bad token to "guest" would mask client bugs.
export const optionalAuth: RequestHandler = (req, res, next) => {
  if (!bearerToken(req.headers.authorization)) {
    next();
    return;
  }
  void requireAuth(req, res, next);
};

// Gate a route to specific roles. Must run after requireAuth.
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ code: "UNAUTHENTICATED", message: "Authentication required" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ code: "FORBIDDEN", message: "Insufficient role" });
      return;
    }
    next();
  };
}
