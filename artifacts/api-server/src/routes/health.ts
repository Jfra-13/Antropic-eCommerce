import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import { HealthCheckResponse, ReadinessCheckResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// How long the database gets to answer `select 1` before readiness calls it unavailable. A
// database that takes longer than this to return a constant is not going to serve a checkout,
// so reporting "ready" would be a lie; and an unbounded probe is worse than a wrong answer,
// because the monitor times out with no information at all.
const DB_PROBE_TIMEOUT_MS = 2000;

// Liveness. Answers "is this process alive" and nothing else.
//
// It must stay dependency-free. A load balancer restarts instances that fail liveness, so
// wiring the database in here means a database blip takes down every healthy API instance at
// once — the classic way a small outage becomes a total one. Readiness is where dependencies
// belong: it removes an instance from rotation without killing it.
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Readiness. Answers "can this instance serve requests right now".
//
// This is the endpoint external monitoring should watch: before it existed, /healthz returned
// a cheerful 200 with Postgres unreachable, so an uptime monitor would have reported the store
// as perfectly fine while every request 500'd.
router.get("/readyz", async (_req, res) => {
  const started = Date.now();
  let dbOk = false;
  let dbError: unknown;

  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error(`database probe timed out after ${DB_PROBE_TIMEOUT_MS}ms`)), DB_PROBE_TIMEOUT_MS),
      ),
    ]);
    dbOk = true;
  } catch (err) {
    dbError = err;
  }

  const latencyMs = Date.now() - started;

  if (!dbOk) {
    // Logged with the pool counters because "the database is unreachable" and "this instance
    // has run out of connections" look identical from outside and are fixed differently.
    logger.error(
      {
        err: dbError,
        latencyMs,
        poolTotal: pool.totalCount,
        poolIdle: pool.idleCount,
        poolWaiting: pool.waitingCount,
      },
      "readiness probe failed",
    );
  }

  const data = ReadinessCheckResponse.parse({
    status: dbOk ? "ok" : "degraded",
    checks: { database: { status: dbOk ? "ok" : "error", latencyMs } },
  });

  // 503, not 200-with-a-status-field: a monitor that has to parse the body to notice an outage
  // will be configured to check the status code and miss it.
  res.status(dbOk ? 200 : 503).json(data);
});

export default router;
