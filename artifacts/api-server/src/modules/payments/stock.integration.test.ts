import { describe, it, expect, beforeEach } from "vitest";
import { approvePaymentTx } from "./queries";
import {
  resetDatabase,
  seedProfile,
  seedVariant,
  seedOrderAwaitingApproval,
  variantStock,
} from "../../test/db";

// Approving a payment is the one transaction in this system that moves stock, and it is the
// place an oversell would happen. The audit lists "two simultaneous purchases of the last unit,
// only one may complete" as the single test that proves the design rather than describing it.
//
// Every case below runs the real transaction against real Postgres. A mock here would only
// prove that the mock behaves, which is exactly the thing not in doubt.

describe("payment approval and stock", () => {
  let adminId: string;

  beforeEach(async () => {
    await resetDatabase();
    adminId = await seedProfile({ role: "admin" });
  });

  it("lets only one of two concurrent buyers take the last unit", async () => {
    const { variantId, sku } = await seedVariant(1);
    const buyerA = await seedProfile();
    const buyerB = await seedProfile();
    const orderA = await seedOrderAwaitingApproval(buyerA, [{ variantId, sku, quantity: 1 }]);
    const orderB = await seedOrderAwaitingApproval(buyerB, [{ variantId, sku, quantity: 1 }]);

    // Two different orders, so the FOR UPDATE lock on the order row does not serialise them.
    // What has to hold the line is the guarded conditional decrement on the variant.
    const [resultA, resultB] = await Promise.all([
      approvePaymentTx(orderA, adminId),
      approvePaymentTx(orderB, adminId),
    ]);

    const kinds = [resultA.kind, resultB.kind].sort();
    expect(kinds).toEqual(["ok", "out_of_stock"]);
    expect(await variantStock(variantId)).toBe(0);
  });

  it("never drives stock negative under a burst of concurrent approvals", async () => {
    // Three units, five buyers. Exactly three may win, and the shelf must land on zero —
    // not -2, which is what an unguarded `stock = stock - 1` would produce.
    const { variantId, sku } = await seedVariant(3);
    const orderIds = await Promise.all(
      Array.from({ length: 5 }, async () => {
        const buyer = await seedProfile();
        return seedOrderAwaitingApproval(buyer, [{ variantId, sku, quantity: 1 }]);
      }),
    );

    const results = await Promise.all(orderIds.map((id) => approvePaymentTx(id, adminId)));

    expect(results.filter((r) => r.kind === "ok")).toHaveLength(3);
    expect(results.filter((r) => r.kind === "out_of_stock")).toHaveLength(2);
    expect(await variantStock(variantId)).toBe(0);
  });

  it("is idempotent when the same order is approved twice at once", async () => {
    // A double-click in the backoffice must not decrement twice. Here the order-row lock is
    // what serialises: the loser wakes up, sees `pagado`, and returns without touching stock.
    const { variantId, sku } = await seedVariant(5);
    const buyer = await seedProfile();
    const orderId = await seedOrderAwaitingApproval(buyer, [{ variantId, sku, quantity: 2 }]);

    const results = await Promise.all([
      approvePaymentTx(orderId, adminId),
      approvePaymentTx(orderId, adminId),
    ]);

    expect(results.every((r) => r.kind === "ok")).toBe(true);
    expect(await variantStock(variantId)).toBe(3); // decremented once, not twice
  });

  it("rolls the whole approval back when one line of several is short", async () => {
    // Atomicity, stated as stock: the plentiful item must NOT be decremented just because it
    // was processed before the one that failed.
    const plentiful = await seedVariant(10);
    const scarce = await seedVariant(1);
    const buyer = await seedProfile();
    const orderId = await seedOrderAwaitingApproval(buyer, [
      { variantId: plentiful.variantId, sku: plentiful.sku, quantity: 2 },
      { variantId: scarce.variantId, sku: scarce.sku, quantity: 5 },
    ]);

    const result = await approvePaymentTx(orderId, adminId);

    expect(result.kind).toBe("out_of_stock");
    expect(await variantStock(plentiful.variantId)).toBe(10);
    expect(await variantStock(scarce.variantId)).toBe(1);
  });

  it("refuses to approve an order that never reached verification", async () => {
    // The state machine, enforced inside the transaction: no path to `pagado` skips a human.
    const { variantId, sku } = await seedVariant(5);
    const buyer = await seedProfile();
    const orderId = await seedOrderAwaitingApproval(buyer, [{ variantId, sku, quantity: 1 }]);
    await approvePaymentTx(orderId, adminId);

    // Now it is `pagado`; a rejected-then-approved path is the only re-entry, and approving
    // again is the idempotent no-op covered above. Approving a fresh `pendiente_pago` order:
    const other = await seedProfile();
    const pendingOrder = await seedOrderAwaitingApproval(other, [{ variantId, sku, quantity: 1 }]);
    const { db, orders } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    await db.update(orders).set({ paymentStatus: "pendiente_pago" }).where(eq(orders.id, pendingOrder));

    const result = await approvePaymentTx(pendingOrder, adminId);
    expect(result.kind).toBe("invalid_state");
    expect(await variantStock(variantId)).toBe(4); // untouched by the refused approval
  });
});
