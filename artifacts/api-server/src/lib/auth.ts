import type { RequestHandler } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db, profiles, type Profile } from "@workspace/db";

// Supabase issues JWTs to the frontend (Google OAuth / Magic Link). The API verifies
// the signature server-side against Supabase's JWKS. createRemoteJWKSet caches the key
// set after the first fetch, so there is NO network call per request.
//
// NOTE: this requires the Supabase project to use ASYMMETRIC JWT signing keys (the
// JWKS endpoint only serves keys in that mode). Enable it in the dashboard:
// Authentication -> JWT Keys -> migrate to asymmetric. Legacy HS256 shared-secret
// projects will fail verification here.
const SUPABASE_URL = process.env["SUPABASE_URL"];
if (!SUPABASE_URL) {
  throw new Error(
    "SUPABASE_URL must be set for JWT verification (e.g. https://<ref>.supabase.co).",
  );
}

const JWKS = createRemoteJWKSet(
  new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
);
const ISSUER = `${SUPABASE_URL}/auth/v1`;

export type Role = Profile["role"];
export type AuthUser = { id: string; email: string; role: Role };

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
  } catch {
    res.status(401).json({ code: "UNAUTHENTICATED", message: "Invalid or expired token" });
    return;
  }

  const profile = await getOrCreateProfile(sub, email);
  if (profile.blocked) {
    res.status(403).json({ code: "BLOCKED", message: "Account is blocked" });
    return;
  }

  req.user = { id: profile.id, email: profile.email, role: profile.role };
  next();
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
