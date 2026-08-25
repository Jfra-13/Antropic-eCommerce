import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { notificationChannelEnum, notificationStatusEnum } from "./enums";
import { timestamps } from "./helpers";

// Outbox for every message this system sends out (auditoría §5, §8.3).
//
// Before this table, a notification was a `void notifyX(...)` whose failures ended in a
// `logger.warn` and nowhere else. Two questions had no answer: "did the customer ever get the
// confirmation?" and "is email working right now?" — and the second one only gets asked after
// the first one has been asked ten times.
//
// THE INVARIANT that survives from before: a notification failure must NEVER break a business
// flow. The complaint is filed, the payment is approved, the order ships — whether or not the
// mail goes out. This table changes what is VISIBLE about a failure, not what a failure is
// allowed to do. Anything that makes a send blocking or fatal is a bug.
//
// Why the rendered body is stored rather than re-composed on retry:
//   - A retry sends what was actually composed, not what the same template would produce
//     today against data that has since changed.
//   - The retry job stays independent of every business module: it reads a row and posts it.
//   - "What exactly did we send them" becomes answerable. For the Hoja de Reclamación that is
//     the legally interesting question, since the mail IS the consumer's constancia.
// The cost is that this table holds personal data (name, address, order contents) for as long
// as rows are kept. There is deliberately NO automatic purge: a retention period for the
// constancia of a complaint is a legal decision, not a default someone picks in code.
// See docs/OBSERVABILIDAD.md §5.
export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channel: notificationChannelEnum("channel").notNull().default("email"),
    // Which notification this is: `payment_approved`, `complaint_filed`, `stock_available`…
    // Free text rather than an enum, for the same reason as payment_events.type: the set grows
    // with product copy, and that is not worth a migration (and two divergent databases after
    // the fork) every time somebody adds a message.
    kind: text("kind").notNull(),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull(),
    bodyHtml: text("body_html").notNull(),

    // What this notification is about, for the backoffice: "order", "complaint", "return",
    // "variant". No foreign key on purpose — the target is a different table depending on
    // `relatedType`, and a delivery record outliving the thing it refers to is fine (it is
    // evidence of what was sent, not a live link).
    relatedType: text("related_type"),
    relatedId: uuid("related_id"),

    status: notificationStatusEnum("status").notNull().default("pendiente"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    // When the retry job may next claim this row. Doubles as the claim lease: the claiming
    // UPDATE pushes it forward before delivery is attempted, so a job that dies mid-flight
    // releases the row after the backoff instead of wedging it. NULL once terminal.
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    // The retry job's read path: the due queue, oldest first. Partial because everything the
    // job cares about is `pendiente` and that is a small minority of the table once the store
    // has been running for a while.
    index("notification_deliveries_due_idx")
      .on(t.nextAttemptAt)
      .where(sql`${t.status} = 'pendiente'`),
    // The backoffice's read path: "what is failing", newest first.
    index("notification_deliveries_status_idx").on(t.status, t.createdAt),
    // "Did this order's customer get their emails?" from the order screen.
    index("notification_deliveries_related_idx").on(t.relatedType, t.relatedId),
  ],
);

export const insertNotificationDeliverySchema = createInsertSchema(notificationDeliveries);
export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;
export type InsertNotificationDelivery = typeof notificationDeliveries.$inferInsert;
