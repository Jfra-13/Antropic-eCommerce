import type { Coupon } from "@workspace/db";
import type {
  Coupon as CouponDto,
  CouponList as CouponListDto,
  CreateCouponInput,
  UpdateCouponInput,
} from "@workspace/api-zod";
import { toCents } from "../../lib/money";
import {
  getCouponByCode,
  listCoupons,
  insertCoupon,
  updateCouponRow,
  deleteCouponRow,
} from "./queries";

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

// --- Admin CRUD (requerimientos §6.6, solo Admin) ---

export type AdminCouponResult =
  | { ok: true; status: number; coupon: CouponDto }
  | { ok: false; status: number; code: string; message: string };

function pgErrorCode(e: unknown): string | undefined {
  return typeof e === "object" && e !== null && "code" in e
    ? (e as { code?: string }).code
    : undefined;
}

function toCouponDto(row: Coupon): CouponDto {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    value: row.value,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    minPurchase: row.minPurchase,
    active: row.active,
    createdAt: row.createdAt,
  };
}

// value is money-as-string. percent: whole/decimal percent (10 = 10%); fixed: money amount.
// Returns a human message when invalid. The percent ceiling is only checked when `type` is
// known in the same request; validateCoupon caps any discount at the subtotal regardless.
function validateValue(type: CouponDto["type"] | undefined, value: string): string | undefined {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return "value must be a positive amount (max 2 decimals)";
  const n = Number(value);
  if (n <= 0) return "value must be greater than 0";
  if (type === "percent" && n > 100) return "percent value cannot exceed 100";
  return undefined;
}

export async function getCoupons(
  q: string | undefined,
  page: number,
  limit: number,
): Promise<CouponListDto> {
  const { rows, total } = await listCoupons(q, page, limit);
  return { items: rows.map(toCouponDto), total, page, limit };
}

export async function createCoupon(input: CreateCouponInput): Promise<AdminCouponResult> {
  const invalid = validateValue(input.type, input.value);
  if (invalid) return { ok: false, status: 400, code: "INVALID_VALUE", message: invalid };

  try {
    const coupon = await insertCoupon({
      code: input.code,
      type: input.type,
      value: input.value,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      maxUses: input.maxUses ?? null,
      minPurchase: input.minPurchase ?? "0",
      active: input.active ?? true,
    });
    return { ok: true, status: 201, coupon: toCouponDto(coupon) };
  } catch (e) {
    if (pgErrorCode(e) === "23505") {
      return { ok: false, status: 409, code: "DUPLICATE", message: "Coupon code already exists" };
    }
    throw e;
  }
}

export async function updateCoupon(
  id: string,
  input: UpdateCouponInput,
): Promise<AdminCouponResult> {
  if (input.value !== undefined) {
    const invalid = validateValue(input.type, input.value);
    if (invalid) return { ok: false, status: 400, code: "INVALID_VALUE", message: invalid };
  }

  const patch: Record<string, unknown> = {};
  if (input.code !== undefined) patch["code"] = input.code;
  if (input.type !== undefined) patch["type"] = input.type;
  if (input.value !== undefined) patch["value"] = input.value;
  if (input.startsAt !== undefined) patch["startsAt"] = input.startsAt;
  if (input.endsAt !== undefined) patch["endsAt"] = input.endsAt;
  if (input.maxUses !== undefined) patch["maxUses"] = input.maxUses;
  if (input.minPurchase !== undefined) patch["minPurchase"] = input.minPurchase;
  if (input.active !== undefined) patch["active"] = input.active;

  try {
    const coupon = await updateCouponRow(id, patch);
    if (!coupon) return { ok: false, status: 404, code: "NOT_FOUND", message: "Coupon not found" };
    return { ok: true, status: 200, coupon: toCouponDto(coupon) };
  } catch (e) {
    if (pgErrorCode(e) === "23505") {
      return { ok: false, status: 409, code: "DUPLICATE", message: "Coupon code already exists" };
    }
    throw e;
  }
}

export type DeleteCouponResult =
  | { ok: true }
  | { ok: false; status: number; code: string; message: string };

export async function deleteCoupon(id: string): Promise<DeleteCouponResult> {
  try {
    const deleted = await deleteCouponRow(id);
    if (!deleted) return { ok: false, status: 404, code: "NOT_FOUND", message: "Coupon not found" };
    return { ok: true };
  } catch (e) {
    if (pgErrorCode(e) === "23503") {
      return {
        ok: false,
        status: 409,
        code: "REDEEMED",
        message: "Coupon already redeemed, cannot delete. Deactivate it instead.",
      };
    }
    throw e;
  }
}
