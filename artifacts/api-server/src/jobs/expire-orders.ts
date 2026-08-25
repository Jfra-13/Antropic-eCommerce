// Scheduled job: close orders that were never paid (auditoría §3.3, §6.1).
//
// Run it from cron, a platform scheduler, or by hand:
//   pnpm --filter @workspace/api-server run build
//   node ./dist/jobs/expire-orders.mjs [horas]
//
// It is a separate process rather than a timer inside the API on purpose: the API runs in more
// than one instance behind a load balancer, and a setInterval in each of them would have every
// instance racing to expire the same orders. A process someone schedules runs once.
//
// Safe to run repeatedly and safe to interrupt: each order is expired in its own transaction
// through the same settlement path as any other payment status change, so a run that dies
// halfway leaves the orders it already closed closed, and the rest untouched.

import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { expireAbandonedOrders, DEFAULT_EXPIRY_HOURS } from "../modules/payments/service";

async function main(): Promise<void> {
  const arg = process.argv[2];
  const hours = arg === undefined ? DEFAULT_EXPIRY_HOURS : Number(arg);
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error(`Invalid expiry window '${arg}': expected a positive number of hours`);
  }

  const report = await expireAbandonedOrders(hours);
  logger.info(
    { expired: report.expired, skipped: report.skipped, olderThanHours: hours },
    "expire-orders finished",
  );
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    logger.error({ err }, "expire-orders failed");
    await pool.end();
    process.exit(1);
  });
