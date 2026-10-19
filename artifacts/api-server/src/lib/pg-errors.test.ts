import { describe, it, expect } from "vitest";
import { isUniqueViolation } from "./pg-errors";

// Drizzle hangs the pg error off `cause`; the constraint name sits next to its code.
const wrapped = (code: string, constraint?: string) => ({ cause: { code, constraint } });

describe("isUniqueViolation", () => {
  it("matches only the named constraint when one is given", () => {
    const e = wrapped("23505", "orders_idempotency_key_unique");
    expect(isUniqueViolation(e, "orders_idempotency_key_unique")).toBe(true);
    expect(isUniqueViolation(e, "coupon_redemptions_order_uq")).toBe(false);
    expect(isUniqueViolation(e)).toBe(true);
  });

  it("is false for other SQLSTATEs and non-pg errors", () => {
    expect(isUniqueViolation(wrapped("23503", "x"), "x")).toBe(false);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
  });
});
