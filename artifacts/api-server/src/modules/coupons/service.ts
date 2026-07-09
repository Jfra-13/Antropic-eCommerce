import type { Coupon } from "@workspace/db";
import { toCents } from "../../lib/money";
import { getCouponByCode } from "./queries";

export type CouponError =
  | "COUPON_NOT_FOUND"
  | "COUPON_INACTIVE"
  | "COUPON_NOT_STARTED"
  | "COUPON_EXPIRED"
  | "COUPON_MIN_PURCHASE"
  | "COUPON_EXHAUSTED";

export type CouponValidation =
  | { ok: true; coupon: Coupon; discountCents: number }
  | { ok: false; error: CouponError };

// Discount in cents. percent: value is a whole percent (10 = 10%). fixed: value is a money
// amount. The discount never exceeds the subtotal (no negative totals).
export function computeDiscountCents(coupon: Coupon, subtotalCents: number): number {
  const raw =
    coupon.type === "percent"
      ? Math.round((subtotalCents * Number(coupon.value)) / 100)
      : toCents(coupon.value);
  return Math.min(raw, subtotalCents);
}

// Validates a coupon against the subtotal (cents). Does NOT consume it — consumption is
// atomic inside the order-creation transaction (planeación §5.3). Validated at quote AND at
// order creation because it can expire/exhaust in between.
export async function validateCoupon(
  code: string,
  subtotalCents: number,
): Promise<CouponValidation> {
  const coupon = await getCouponByCode(code);
  if (!coupon) return { ok: false, error: "COUPON_NOT_FOUND" };
  if (!coupon.active) return { ok: false, error: "COUPON_INACTIVE" };

  const now = new Date();
  if (coupon.startsAt && now < coupon.startsAt) return { ok: false, error: "COUPON_NOT_STARTED" };
  if (coupon.endsAt && now > coupon.endsAt) return { ok: false, error: "COUPON_EXPIRED" };
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    return { ok: false, error: "COUPON_EXHAUSTED" };
  }
  if (subtotalCents < toCents(coupon.minPurchase)) {
    return { ok: false, error: "COUPON_MIN_PURCHASE" };
  }

  return { ok: true, coupon, discountCents: computeDiscountCents(coupon, subtotalCents) };
}
