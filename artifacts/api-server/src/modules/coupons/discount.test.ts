import { describe, it, expect } from "vitest";
import { computeDiscountCents } from "./service";
import { makeCoupon } from "../../test/factories";

// A discount is money leaving the business, and it is computed server-side precisely so the
// client cannot influence it. These tests pin the two shapes and the cap.

describe("computeDiscountCents", () => {
  it("takes a percentage of the subtotal", () => {
    const coupon = makeCoupon({ type: "percent", value: "10" });
    expect(computeDiscountCents(coupon, 10_000)).toBe(1_000);
  });

  it("rounds a fractional percentage to the nearest cent", () => {
    // 33% of S/ 10.00 = 330.0000...; 33% of S/ 10.01 = 330.33 → 330 cents.
    expect(computeDiscountCents(makeCoupon({ type: "percent", value: "33" }), 1_000)).toBe(330);
    expect(computeDiscountCents(makeCoupon({ type: "percent", value: "33" }), 1_001)).toBe(330);
  });

  it("takes a fixed amount as a money string", () => {
    const coupon = makeCoupon({ type: "fixed", value: "15.00" });
    expect(computeDiscountCents(coupon, 10_000)).toBe(1_500);
  });

  it("never discounts more than the subtotal", () => {
    // Without the cap this produces a negative total — i.e. the shop paying the customer.
    const coupon = makeCoupon({ type: "fixed", value: "200.00" });
    expect(computeDiscountCents(coupon, 1_000)).toBe(1_000);
  });

  it("caps a 100% coupon at exactly the subtotal", () => {
    const coupon = makeCoupon({ type: "percent", value: "100" });
    expect(computeDiscountCents(coupon, 4_567)).toBe(4_567);
  });
});
