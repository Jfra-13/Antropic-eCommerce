import { pgTable, uuid, text, serial, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { profiles } from "./profiles";
import { pickupPoints } from "./pickup-points";
import { coupons } from "./coupons";
import {
  paymentStatusEnum,
  fulfillmentStatusEnum,
  deliveryMethodEnum,
} from "./enums";
import { timestamps, money } from "./helpers";

// The core. Totals are ALWAYS computed server-side; coupon code + amounts are snapshotted.
// Reference for the Yape match is derived: `ANT-${orderNumber}` (not stored).
// fulfillmentStatus is null until payment is approved.
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: serial("order_number").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id),
    paymentStatus: paymentStatusEnum("payment_status").notNull().default("pendiente_pago"),
    fulfillmentStatus: fulfillmentStatusEnum("fulfillment_status"),
    deliveryMethod: deliveryMethodEnum("delivery_method").notNull(),
    pickupPointId: uuid("pickup_point_id").references(() => pickupPoints.id),
    shippingAddress: text("shipping_address"),
    shippingCost: money("shipping_cost").notNull().default("0"),
    subtotal: money("subtotal").notNull(),
    discountAmount: money("discount_amount").notNull().default("0"),
    total: money("total").notNull(),
    couponId: uuid("coupon_id").references(() => coupons.id),
    couponCode: text("coupon_code"),
    // Client-supplied idempotency key: double-click on "Continuar" must not create two orders.
    idempotencyKey: text("idempotency_key").unique(),
    // Audit: it's money — who approved/rejected and when.
    approvedBy: uuid("approved_by").references(() => profiles.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("orders_user_status_idx").on(t.userId, t.paymentStatus),
    // The verification queue is polled constantly — partial index keeps it cheap.
    index("orders_verification_idx")
      .on(t.id)
      .where(sql`${t.paymentStatus} = 'en_verificacion'`),
  ],
);

export const insertOrderSchema = createInsertSchema(orders);
export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;
