import {
  db,
  profiles,
  products,
  productVariants,
  stockAlerts,
  notificationDeliveries,
  type NotificationDelivery,
  type InsertNotificationDelivery,
} from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";

export async function getProfileEmail(userId: string): Promise<string | undefined> {
  const rows = await db
    .select({ email: profiles.email })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return rows[0]?.email;
}

export type PendingStockAlert = { email: string; productName: string; variantLabel: string };

// Pending "avísame" subscribers for a restocked variant, with product/variant labels for the email.
export async function pendingStockAlerts(variantId: string): Promise<PendingStockAlert[]> {
  const rows = await db
    .select({
      email: stockAlerts.email,
      productName: products.name,
      size: productVariants.size,
      color: productVariants.color,
    })
    .from(stockAlerts)
    .innerJoin(productVariants, eq(stockAlerts.variantId, productVariants.id))
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(and(eq(stockAlerts.variantId, variantId), eq(stockAlerts.status, "pending")));

  return rows.map((r) => ({
    email: r.email,
    productName: r.productName,
    variantLabel: `${r.size} · ${r.color}`,
  }));
}

// Flip a variant's pending alerts to notified so restocks don't re-spam on every stock edit.
export async function markStockAlertsNotified(variantId: string): Promise<void> {
  await db
    .update(stockAlerts)
    .set({ status: "notified", notifiedAt: new Date() })
    .where(and(eq(stockAlerts.variantId, variantId), eq(stockAlerts.status, "pending")));
}

// --- Outbox (auditoría §8.3) --------------------------------------------------

export type DeliveryOutcome =
  | { status: "enviado" }
  | { status: "pendiente"; error: string; nextAttemptAt: Date }
  | { status: "fallido"; error: string };

export async function insertDelivery(row: InsertNotificationDelivery): Promise<NotificationDelivery> {
  const [created] = await db.insert(notificationDeliveries).values(row).returning();
  return created!;
}

// Claim due rows for delivery.
//
// `FOR UPDATE SKIP LOCKED` is what makes it safe to run the retry job more than once at a time
// — a second worker skips the rows the first is holding instead of blocking behind them or,
// worse, sending the same email twice. The same UPDATE pushes `next_attempt_at` forward, so
// the claim doubles as a lease: a worker that dies mid-delivery releases its rows when the
// lease expires instead of wedging them in the queue forever.
export async function claimDueDeliveries(
  limit: number,
  leaseMinutes: number,
): Promise<NotificationDelivery[]> {
  const result = await db.execute(sql`
    UPDATE notification_deliveries AS d
    SET attempts = d.attempts + 1,
        next_attempt_at = now() + make_interval(mins => ${leaseMinutes}),
        updated_at = now()
    WHERE d.id IN (
      SELECT id FROM notification_deliveries
      WHERE status = 'pendiente'
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      ORDER BY next_attempt_at NULLS FIRST
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING d.*
  `);
  return result.rows as unknown as NotificationDelivery[];
}

// Record what happened to one attempt. Terminal outcomes clear next_attempt_at so the row
// leaves the partial index the job reads.
export async function recordDeliveryOutcome(id: string, outcome: DeliveryOutcome): Promise<void> {
  const patch =
    outcome.status === "enviado"
      ? { status: "enviado" as const, sentAt: new Date(), nextAttemptAt: null, lastError: null }
      : outcome.status === "fallido"
        ? { status: "fallido" as const, nextAttemptAt: null, lastError: outcome.error }
        : { status: "pendiente" as const, nextAttemptAt: outcome.nextAttemptAt, lastError: outcome.error };

  await db.update(notificationDeliveries).set(patch).where(eq(notificationDeliveries.id, id));
}

export async function listDeliveries(filter: {
  status?: "pendiente" | "enviado" | "fallido";
  relatedType?: string;
  relatedId?: string;
  limit: number;
}): Promise<NotificationDelivery[]> {
  const conditions = [
    filter.status ? eq(notificationDeliveries.status, filter.status) : undefined,
    filter.relatedType ? eq(notificationDeliveries.relatedType, filter.relatedType) : undefined,
    filter.relatedId ? eq(notificationDeliveries.relatedId, filter.relatedId) : undefined,
  ].filter((c) => c !== undefined);

  return db
    .select()
    .from(notificationDeliveries)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(notificationDeliveries.createdAt))
    .limit(filter.limit);
}

export async function getDelivery(id: string): Promise<NotificationDelivery | undefined> {
  const rows = await db
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.id, id))
    .limit(1);
  return rows[0];
}

// Put a failed row back in the queue with a clean attempt budget. This is the reason `fallido`
// is not a dead end: the usual cause of a batch of failures is configuration, and once that is
// fixed the messages still need to go out.
export async function requeueDelivery(id: string): Promise<NotificationDelivery | undefined> {
  const [updated] = await db
    .update(notificationDeliveries)
    .set({ status: "pendiente", attempts: 0, nextAttemptAt: new Date(), lastError: null })
    .where(and(eq(notificationDeliveries.id, id), eq(notificationDeliveries.status, "fallido")))
    .returning();
  return updated;
}
