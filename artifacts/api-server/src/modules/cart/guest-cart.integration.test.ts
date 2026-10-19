import { describe, it, expect, beforeEach } from "vitest";
import { db, products, productVariants } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveGuestCart } from "./service";
import { resetDatabase, seedVariant } from "../../test/db";

// The guest cart lives in the browser as variant ids (auditoría §1.4). Resolving them against
// the first page of the catalogue blocked checkout for anything outside it; the API is the only
// place that can tell "no longer sold" from "not loaded".

beforeEach(async () => {
  await resetDatabase();
});

describe("resolveGuestCart", () => {
  it("resolves every variant still sold, with the variant's effective price", async () => {
    const plain = await seedVariant(3, "40.00");
    const overridden = await seedVariant(0, "50.00");
    await db
      .update(productVariants)
      .set({ priceOverride: "45.00" })
      .where(eq(productVariants.id, overridden.variantId));

    const cart = await resolveGuestCart([
      { variantId: plain.variantId, quantity: 2 },
      { variantId: overridden.variantId, quantity: 1 },
    ]);

    expect(cart.missing).toEqual([]);
    expect(cart.items.map((i) => [i.variantId, i.unitPrice, i.quantity])).toEqual([
      [plain.variantId, "40.00", 2],
      // Zero stock is still a line: the customer has to see it to fix it.
      [overridden.variantId, "45.00", 1],
    ]);
  });

  it("reports deactivated variants and products, and unknown ids, as missing", async () => {
    const live = await seedVariant(5);
    const offVariant = await seedVariant(5);
    const offProduct = await seedVariant(5);
    await db
      .update(productVariants)
      .set({ active: false })
      .where(eq(productVariants.id, offVariant.variantId));
    await db.update(products).set({ active: false }).where(eq(products.id, offProduct.productId));
    const unknown = crypto.randomUUID();

    const cart = await resolveGuestCart(
      [live, offVariant, offProduct].map((v) => ({ variantId: v.variantId, quantity: 1 })).concat({
        variantId: unknown,
        quantity: 1,
      }),
    );

    expect(cart.items.map((i) => i.variantId)).toEqual([live.variantId]);
    expect(cart.missing.sort()).toEqual(
      [offVariant.variantId, offProduct.variantId, unknown].sort(),
    );
  });
});
