import { pgTable, uuid, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { coupons } from "./coupons";
import { orders } from "./orders";
import { profiles } from "./profiles";

// One coupon per order — the unique index enforces it.
export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    couponId: uuid("coupon_id")
      .notNull()
      .references(() => coupons.id),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("coupon_redemptions_order_uq").on(t.orderId),
    index("coupon_redemptions_coupon_idx").on(t.couponId),
  ],
);

export const insertCouponRedemptionSchema = createInsertSchema(couponRedemptions);
export type CouponRedemption = typeof couponRedemptions.$inferSelect;
export type InsertCouponRedemption = typeof couponRedemptions.$inferInsert;
