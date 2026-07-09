import { db, coupons, type Coupon } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "../../lib/tx";

export async function getCouponByCode(code: string): Promise<Coupon | undefined> {
  const rows = await db.select().from(coupons).where(eq(coupons.code, code)).limit(1);
  return rows[0];
}

// Atomic use bump: increments used_count only while still under max_uses (null = unlimited).
// Returns true when a row was updated, false when the coupon is already exhausted — this is
// the race-safe gate at order creation, not the app-level check in validateCoupon.
export async function tryConsumeCoupon(tx: Tx, couponId: string): Promise<boolean> {
  const rows = await tx
    .update(coupons)
    .set({ usedCount: sql`${coupons.usedCount} + 1` })
    .where(
      and(
        eq(coupons.id, couponId),
        sql`(${coupons.maxUses} IS NULL OR ${coupons.usedCount} < ${coupons.maxUses})`,
      ),
    )
    .returning({ id: coupons.id });
  return rows.length > 0;
}
