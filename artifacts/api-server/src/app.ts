import express, {
  type Express,
  type Request,
  type RequestHandler,
  type Response,
  type NextFunction,
} from "express";
import cors, { type CorsOptions } from "cors";
import { randomUUID } from "node:crypto";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { reportError } from "./lib/observability";
import { env } from "./lib/env";
import {
  globalLimiter,
  writeLimiter,
  complaintLimiter,
  quoteLimiter,
  consentLimiter,
  uploadUrlLimiter,
} from "./lib/rate-limit";

const app: Express = express();

// Rate limiting keys on the client IP, and behind a reverse proxy (Cloudflare Tunnel, a load
// balancer) req.ip is the proxy unless Express is told how many hops to trust. Too low and
// every visitor shares one bucket; too high and X-Forwarded-For can be forged for a fresh
// bucket per request. Neither default is safe to guess, so it is configuration.
app.set("trust proxy", env.TRUST_PROXY);

// Security headers. Defaults are kept except for one that must be overridden:
// crossOriginResourcePolicy defaults to "same-origin", which blocks the storefront and the
// backoffice from reading responses because they run on a different origin than the API.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

// Request correlation (auditoría §5). Every request gets an id that appears in three places:
// the log lines for that request, the X-Request-Id response header, and the body of a 500.
// Without it, "the site broke around lunchtime" is the only evidence a customer can give and
// the only way to find the failure is guessing at timestamps.
//
// The id is always generated here and an inbound X-Request-Id is deliberately NOT trusted:
// nothing in front of this API is currently set up to mint one, and accepting a client-supplied
// value would let anyone forge or collide log identifiers. If a CDN or gateway is ever put in
// front and its own id is worth keeping, read it HERE and only from a trusted proxy.
app.use(
  pinoHttp({
    logger,
    genReqId(_req, res) {
      const id = randomUUID();
      res.setHeader("X-Request-Id", id);
      return id;
    },
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// CORS allowlist. `cors()` with no options reflects any origin, which lets any website call
// this API from a visitor's browser. Auth is a bearer token in a header (never a cookie), so
// credentials stay off: there is no ambient authority for another origin to ride on.
const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // No Origin header: curl, server-to-server, health checks. Not a browser cross-origin
    // request, so there is nothing for CORS to protect. Auth still applies.
    if (!origin) {
      callback(null, true);
      return;
    }
    const allowed =
      env.CORS_ORIGINS === "localhost"
        ? /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
        : env.CORS_ORIGINS.includes(origin.replace(/\/$/, ""));

    if (allowed) {
      callback(null, true);
      return;
    }
    logger.warn({ origin }, "blocked cross-origin request");
    // Reject by omitting the CORS headers rather than erroring: the browser blocks the read,
    // and the request still gets a normal response instead of an opaque 500.
    callback(null, false);
  },
  credentials: false,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
  // Without this the browser hides X-Request-Id from the frontend, so the id would exist on
  // the wire and be unreadable by the only code that could show it to the person reporting
  // the problem. Safe to expose: it is a random opaque id, not a session identifier.
  exposedHeaders: ["X-Request-Id"],
  maxAge: 86_400, // cache preflights for a day
};
app.use(cors(corsOptions));

// Ceiling for everything. Mounted after CORS so preflights do not consume a client's budget.
app.use(globalLimiter);

// 2mb ceiling: the CSV inventory import (admin-gated) is the largest payload; the default
// 100kb is too small for a real product upload. Everything else is tiny.
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Tighter limits on the endpoints worth abusing. Registered most-specific first, since the
// signed-URL route also sits under /api/orders. Admin routes are excluded on purpose: the
// backoffice does legitimate bulk work and is already gated on a verified role.
app.use("/api/orders/:id/payment-proof/upload-url", uploadUrlLimiter);
// Reads are covered by the global ceiling; only mutations get a tight budget.
function limitMutations(limiter: RequestHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET") {
      next();
      return;
    }
    limiter(req, res, next);
  };
}

// /complaints and /consents are public and unauthenticated by legal necessity, which also makes
// them the easiest endpoints here to flood. Note each group gets its OWN limiter instance:
// sharing one would put unrelated flows in the same bucket, so filing a complaint would spend
// the allowance a shopper needs to check out.
for (const path of ["/api/orders", "/api/returns", "/api/stock-alerts"]) {
  app.use(path, limitMutations(writeLimiter));
}
app.use("/api/complaints", limitMutations(complaintLimiter));
app.use("/api/checkout", limitMutations(quoteLimiter));
app.use("/api/consents", limitMutations(consentLimiter));

app.use("/api", router);

// Unknown route → structured 404 in the same {code,message} shape the routes use.
app.use((_req: Request, res: Response) => {
  res.status(404).json({ code: "NOT_FOUND", message: "Route not found" });
});

// Central error handler. Express 5 auto-forwards rejected async route handlers here,
// so every thrown/rejected error lands in one place. Log the detail server-side and
// return an opaque 500 — never leak stack traces or internals to the client.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const requestId = typeof req.id === "string" ? req.id : undefined;
  req.log.error({ err }, "unhandled request error");
  // Same error, reported through the one seam a tracking provider would plug into later.
  reportError(err, { requestId, method: req.method, path: req.path });
  if (res.headersSent) return;
  // The response stays opaque — no stack traces, no internals — but it carries the request id
  // so the customer can quote it and support can find this exact failure in the logs.
  res.status(500).json({ code: "INTERNAL", message: "Internal server error", requestId });
});

export default app;
