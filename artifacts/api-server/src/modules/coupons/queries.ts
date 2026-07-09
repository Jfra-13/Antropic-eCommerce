import { db, coupons, type Coupon, type InsertCoupon } from "@workspace/db";
import { and, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
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

// --- Admin CRUD (requerimientos §6.6) ---

// Coupons for the admin management table, newest first, optional code search.
export async function listCoupons(
  q: string | undefined,
  page: number,
  limit: number,
): Promise<{ rows: Coupon[]; total: number }> {
  const offset = (page - 1) * limit;
  const where: SQL | undefined = q ? ilike(coupons.code, `%${q}%`) : undefined;

  const rows = await db
    .select()
    .from(coupons)
    .where(where)
    .orderBy(desc(coupons.createdAt))
    .limit(limit)
    .offset(offset);

  const counted = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(coupons)
    .where(where);

  return { rows, total: counted[0]?.count ?? 0 };
}

export async function insertCoupon(values: InsertCoupon): Promise<Coupon> {
  const rows = await db.insert(coupons).values(values).returning();
  return rows[0]!;
}

export async function updateCouponRow(
  id: string,
  patch: Partial<InsertCoupon>,
): Promise<Coupon | undefined> {
  const rows = await db.update(coupons).set(patch).where(eq(coupons.id, id)).returning();
  return rows[0];
}

// Hard delete. A redeemed coupon is FK-referenced by coupon_redemptions (no cascade),
// so Postgres raises 23503 and the service maps it to 409 — redemption history is never orphaned.
export async function deleteCouponRow(id: string): Promise<boolean> {
  const rows = await db.delete(coupons).where(eq(coupons.id, id)).returning({ id: coupons.id });
  return rows.length > 0;
}
