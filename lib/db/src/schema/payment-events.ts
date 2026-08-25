import { pgTable, uuid, text, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { orders } from "./orders";
import { profiles } from "./profiles";
import { paymentStatusEnum, paymentMethodEnum } from "./enums";
import { timestamps, money } from "./helpers";

// Append-only history of everything that moved an order's payment status, and the idempotency
// guard a payment gateway webhook will need (auditoría §6.2).
//
// Two jobs, one table, on purpose:
//
//  1. AUDIT. Until now the only trace of the money was `orders.approved_by` / `approved_at`,
//     which the next state change overwrites. "Who rejected this on Tuesday and who approved
//     it on Thursday" was unanswerable. Rows here are never updated or deleted: the previous
//     state is a column, not a thing you overwrite.
//
//  2. IDEMPOTENCY. Every payment gateway retries webhooks — on timeout, on a non-2xx, and
//     sometimes just because. Replaying "payment succeeded" a second time must not decrement
//     stock a second time. `eventId` is the provider's own id for the delivery, and the unique
//     index below is what makes the replay fail instead of settle.
//
// THE INVARIANT, and the reason this table is not written by a separate logging call: the row
// is inserted INSIDE the same transaction as the status change (see modules/payments/
// settlement.ts). If the two are split, a retried webhook that arrives while the first is
// still committing finds no event row, decides the payment is new, and settles it twice.
// Anything that moves payment status and does not insert here in the same transaction is a
// bug, however tidy it looks.
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    provider: paymentMethodEnum("provider").notNull(),
    // The provider's id for this delivery. NULL for events this system originates itself — a
    // staff approval and the expiry job have no external id, and there is nothing to
    // deduplicate because nobody retries them.
    eventId: text("event_id"),
    // Free text rather than an enum: the manual flow's vocabulary is ours (`proof_attached`,
    // `approved`, `rejected`, `expired`), but a gateway's event names belong to the gateway
    // and are not something to migrate the database over.
    type: text("type").notNull(),
    // Null only for an event that records no movement; every settlement writes both.
    fromStatus: paymentStatusEnum("from_status"),
    toStatus: paymentStatusEnum("to_status").notNull(),
    // The staff member responsible. NULL when the actor is not a person: a gateway webhook or
    // the expiry job. Read it together with `provider` — "nobody" and "an employee" are
    // different answers and the audit trail has to keep them apart.
    actorId: uuid("actor_id").references(() => profiles.id),
    // What the provider said was paid. Kept because the webhook contract (docs/PAGOS.md)
    // requires contrasting amount and currency against the order before settling: storing the
    // reported figures is what makes that check auditable after the fact.
    amount: money("amount"),
    currency: text("currency"),
    // Raw provider payload, for reconciling a dispute against what was actually received.
    payload: jsonb("payload"),
    ...timestamps,
  },
  (t) => [
    // The order's history, newest last — this is the read path for the backoffice timeline.
    index("payment_events_order_idx").on(t.orderId, t.createdAt),
    // The webhook idempotency guard. Partial because the manual flow leaves `eventId` NULL,
    // and in Postgres every NULL is distinct — without the WHERE clause the index would be
    // dead weight for gateways and would still not constrain anything for us.
    uniqueIndex("payment_events_provider_event_idx")
      .on(t.provider, t.eventId)
      .where(sql`${t.eventId} is not null`),
  ],
);

export const insertPaymentEventSchema = createInsertSchema(paymentEvents);
export type PaymentEvent = typeof paymentEvents.$inferSelect;
export type InsertPaymentEvent = typeof paymentEvents.$inferInsert;
