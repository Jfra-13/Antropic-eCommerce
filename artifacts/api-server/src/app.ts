import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors, { type CorsOptions } from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { env } from "./lib/env";
import { globalLimiter, writeLimiter, uploadUrlLimiter } from "./lib/rate-limit";

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

app.use(
  pinoHttp({
    logger,
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
for (const path of ["/api/orders", "/api/checkout", "/api/returns", "/api/stock-alerts"]) {
  // Reads are covered by the global ceiling; only mutations get the tight budget.
  app.use(path, (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET") {
      next();
      return;
    }
    writeLimiter(req, res, next);
  });
}

app.use("/api", router);

// Unknown route → structured 404 in the same {code,message} shape the routes use.
app.use((_req: Request, res: Response) => {
  res.status(404).json({ code: "NOT_FOUND", message: "Route not found" });
});

// Central error handler. Express 5 auto-forwards rejected async route handlers here,
// so every thrown/rejected error lands in one place. Log the detail server-side and
// return an opaque 500 — never leak stack traces or internals to the client.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  req.log.error({ err }, "unhandled request error");
  if (res.headersSent) return;
  res.status(500).json({ code: "INTERNAL", message: "Internal server error" });
});

export default app;
