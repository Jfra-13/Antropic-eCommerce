import { pgTable, uuid, text, integer, boolean, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { couponTypeEnum } from "./enums";
import { timestamps, money } from "./helpers";

// value: for `percent` it's a whole percent (10 = 10%); for `fixed` it's a money amount.
// usedCount is bumped atomically (UPDATE ... WHERE used_count < max_uses) in the service.
export const coupons = pgTable(
  "coupons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    type: couponTypeEnum("type").notNull(),
    value: money("value").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    maxUses: integer("max_uses"),
    usedCount: integer("used_count").notNull().default(0),
    minPurchase: money("min_purchase").notNull().default("0"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [check("coupons_used_count_non_negative", sql`${t.usedCount} >= 0`)],
);

export const insertCouponSchema = createInsertSchema(coupons);
export type Coupon = typeof coupons.$inferSelect;
export type InsertCoupon = typeof coupons.$inferInsert;
