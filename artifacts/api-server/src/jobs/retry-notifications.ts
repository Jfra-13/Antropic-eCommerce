// Scheduled job: deliver the notifications that have not gone out yet (auditoría §8.3).
//
// Run it from cron, a platform scheduler, or by hand:
//   pnpm --filter @workspace/api-server run build
//   node ./dist/jobs/retry-notifications.mjs [tamaño-de-lote]
//
// Every five minutes is a sensible cadence: it is shorter than the first backoff step, so a
// message that failed once goes out on the next run.
//
// A separate process rather than a timer inside the API, for the same reason as expire-orders:
// with more than one API instance behind a load balancer, a setInterval in each of them would
// have every instance working the same queue. Here it is safe either way — rows are claimed
// with FOR UPDATE SKIP LOCKED — but "safe when it races" is not a reason to make it race.
//
// Safe to run repeatedly and safe to interrupt: a claim is a lease, so a run that dies halfway
// releases its rows after a few minutes instead of stranding them.

import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { reportError } from "../lib/observability";
import { deliverDueNotifications } from "../modules/notifications/outbox";

async function main(): Promise<void> {
  const arg = process.argv[2];
  const batch = arg === undefined ? undefined : Number(arg);
  if (batch !== undefined && (!Number.isInteger(batch) || batch <= 0)) {
    throw new Error(`Invalid batch size '${arg}': expected a positive integer`);
  }

  const report = await deliverDueNotifications(batch);
  logger.info(
    { claimed: report.claimed, sent: report.sent, failed: report.failed },
    "retry-notifications finished",
  );
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    reportError(err, { job: "retry-notifications" });
    await pool.end();
    process.exit(1);
  });
