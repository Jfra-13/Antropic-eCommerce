import { pgTable, uuid, text, serial, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { profiles } from "./profiles";
import { pickupPoints } from "./pickup-points";
import { coupons } from "./coupons";
import {
  paymentStatusEnum,
  paymentMethodEnum,
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
    // Which payment provider owns this order. Recorded rather than inferred: with a second
    // method in play, "is this order waiting for a constancia or for a webhook?" has to be a
    // fact on the row, not a guess from its shape.
    paymentMethod: paymentMethodEnum("payment_method").notNull().default("manual_yape"),
    fulfillmentStatus: fulfillmentStatusEnum("fulfillment_status"),
    deliveryMethod: deliveryMethodEnum("delivery_method").notNull(),
    pickupPointId: uuid("pickup_point_id").references(() => pickupPoints.id),
    shippingAddress: text("shipping_address"),
    // Snapshot of who to call about this order. The order records how it was placed and must not
    // depend on whoever owns it later: a guest claim moves user_id to an account whose profile
    // can be empty. Nullable because rows from before the snapshot have none; reads fall back
    // to the profile for those.
    contactName: text("contact_name"),
    contactPhone: text("contact_phone"),
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
    // Guest orders only (null for orders placed from an account). The capability behind the
    // "ver mi pedido" link a guest gets by email: whoever holds it can see this one order and
    // upload its constancia, nothing else. A guest has no session, and the payment does not
    // finish in one visit — the customer leaves to pay with Yape and has to come back — so
    // without this the order would be unreachable the moment the tab closes.
    //
    // Stored as issued rather than hashed, on purpose: every later email for the order
    // (constancia recibida, pago confirmado, enviado…) has to rebuild the same link, and a
    // hash cannot be turned back into one. It guards nothing that a reader of this table
    // cannot already see on the row itself.
    guestAccessToken: text("guest_access_token").unique(),
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
