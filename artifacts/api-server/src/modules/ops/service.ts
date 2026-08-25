import type { OpsSnapshot } from "@workspace/api-zod";
import {
  selectVerificationQueue,
  selectPaymentOutcomes,
  selectNotificationStats,
  readPoolStats,
} from "./queries";

// Seven days: long enough that a slow Tuesday does not swing the approval rate, short enough
// that a problem that started on Monday is still visible in it.
const PAYMENT_WINDOW_DAYS = 7;

export async function getOpsSnapshot(): Promise<OpsSnapshot> {
  const [verificationQueue, payments, notifications] = await Promise.all([
    selectVerificationQueue(),
    selectPaymentOutcomes(PAYMENT_WINDOW_DAYS),
    selectNotificationStats(),
  ]);

  const resolved = payments.approved + payments.rejected;

  return {
    verificationQueue,
    payments7d: {
      ...payments,
      // Null rather than 0 or 100 when nothing was resolved: there is no honest ratio over an
      // empty denominator, and a fabricated one would read as "everything is being rejected".
      // Expirations are excluded from the denominator — nobody decided them.
      approvalRatePct: resolved === 0 ? null : Math.round((payments.approved / resolved) * 1000) / 10,
    },
    notifications,
    database: readPoolStats(),
  };
}
