import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";

// Aggregate queries behind /admin/ops. Kept apart from modules/reports (sales analytics) on
// purpose: these answer "is the operation healthy right now", are read only when somebody is
// looking at operations, and are allowed to be heavier than anything on the panel's landing
// page — which every employee loads on every visit.

export type VerificationQueueStats = { pending: number; oldestWaitingHours: number | null };

// How many constancias are waiting for a human, and how long the oldest has been waiting.
//
// Measured from payment_proofs.created_at rather than from the order's payment_events history,
// because the proof is the thing a person has to look at, and proofs uploaded before the
// payment-events table existed still have a creation date. Both filters are needed: a proof
// row is `pendiente` until someone reviews it, and the order must still be waiting too.
export async function selectVerificationQueue(): Promise<VerificationQueueStats> {
  const result = await db.execute(sql`
    SELECT count(*)::int AS pending,
           extract(epoch FROM (now() - min(p.created_at))) / 3600 AS oldest_hours
    FROM payment_proofs p
    JOIN orders o ON o.id = p.order_id
    WHERE p.status = 'pendiente' AND o.payment_status = 'en_verificacion'
  `);
  const row = result.rows[0] as { pending: number; oldest_hours: string | null } | undefined;
  return {
    pending: row?.pending ?? 0,
    // Null, never 0, when the queue is empty: "nothing is waiting" and "the oldest thing has
    // been waiting no time at all" are different facts and the panel renders them differently.
    oldestWaitingHours: row?.oldest_hours == null ? null : Math.round(Number(row.oldest_hours) * 10) / 10,
  };
}

export type PaymentOutcomeStats = {
  approved: number;
  rejected: number;
  expired: number;
};

// Payment outcomes over a window, straight from the append-only history. This is the number
// that would expose a verification queue nobody is working: approvals stop, rejections stop,
// and expirations climb.
export async function selectPaymentOutcomes(days: number): Promise<PaymentOutcomeStats> {
  const result = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE to_status = 'pagado')::int    AS approved,
      count(*) FILTER (WHERE to_status = 'rechazado')::int AS rejected,
      count(*) FILTER (WHERE to_status = 'expirado')::int  AS expired
    FROM payment_events
    WHERE created_at >= now() - make_interval(days => ${days})
  `);
  const row = result.rows[0] as PaymentOutcomeStats | undefined;
  return { approved: row?.approved ?? 0, rejected: row?.rejected ?? 0, expired: row?.expired ?? 0 };
}

export type NotificationStats = {
  pending: number;
  failed: number;
  oldestPendingMinutes: number | null;
};

// The outbox at a glance. `oldestPendingMinutes` is the one that matters: a handful of pending
// rows is normal (they are seconds old), while a pending row from two hours ago means delivery
// has stopped and nobody has noticed.
export async function selectNotificationStats(): Promise<NotificationStats> {
  const result = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE status = 'pendiente')::int AS pending,
      count(*) FILTER (WHERE status = 'fallido')::int   AS failed,
      extract(epoch FROM (now() - min(created_at) FILTER (WHERE status = 'pendiente'))) / 60
        AS oldest_pending_minutes
    FROM notification_deliveries
  `);
  const row = result.rows[0] as
    | { pending: number; failed: number; oldest_pending_minutes: string | null }
    | undefined;
  return {
    pending: row?.pending ?? 0,
    failed: row?.failed ?? 0,
    oldestPendingMinutes:
      row?.oldest_pending_minutes == null
        ? null
        : Math.round(Number(row.oldest_pending_minutes) * 10) / 10,
  };
}

export type PoolStats = { poolTotal: number; poolIdle: number; poolWaiting: number };

// Connection pool of THIS process. Not a database query — it is read off the pool object, so
// it describes the instance that answered the request and nothing else. `poolWaiting` above
// zero for any length of time is the early sign of pool exhaustion (auditoría §5).
export function readPoolStats(): PoolStats {
  return { poolTotal: pool.totalCount, poolIdle: pool.idleCount, poolWaiting: pool.waitingCount };
}
