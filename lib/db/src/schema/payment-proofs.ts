import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { orders } from "./orders";
import { profiles } from "./profiles";
import { paymentProofStatusEnum } from "./enums";
import { timestamps, money } from "./helpers";

// Yape/Plin constancia. Stored in a PRIVATE Storage bucket (sensitive) — DB holds the
// path; access is via signed URLs to employee/admin and the order owner only.
export const paymentProofs = pgTable(
  "payment_proofs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    storagePath: text("storage_path").notNull(),
    amountReported: money("amount_reported"),
    status: paymentProofStatusEnum("status").notNull().default("pendiente"),
    reviewedBy: uuid("reviewed_by").references(() => profiles.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("payment_proofs_order_idx").on(t.orderId)],
);

export const insertPaymentProofSchema = createInsertSchema(paymentProofs);
export type PaymentProof = typeof paymentProofs.$inferSelect;
export type InsertPaymentProof = typeof paymentProofs.$inferInsert;
