import type { Coupon } from "@workspace/db";

// Test factories. The audit calls for factories rather than hand-copied fixtures for a reason:
// a fixture pasted into twenty tests means a new NOT NULL column breaks twenty tests, and the
// fix is twenty edits. Here it is one default.
//
// Every factory takes an override object so a test states only the field it is actually about.

let seq = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

export function makeCoupon(overrides: Partial<Coupon> = {}): Coupon {
  return {
    id: nextId(),
    code: "TEST10",
    type: "percent",
    value: "10",
    startsAt: null,
    endsAt: null,
    maxUses: null,
    usedCount: 0,
    minPurchase: "0.00",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}
