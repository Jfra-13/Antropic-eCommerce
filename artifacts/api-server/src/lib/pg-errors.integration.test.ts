import { describe, it, expect, beforeEach } from "vitest";
import { db, carts, cartItems, categories, orders } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createOrder } from "../modules/orders/service";
import { createProduct } from "../modules/catalog/service";
import { resetDatabase, seedProfile, seedVariant } from "../test/db";

// Two guards that read the Postgres error code to turn a unique violation into a business
// answer, and that were both inert until Fase 9: drizzle hides the code on `cause`, so each
// conflict surfaced as a 500 (lib/pg-errors.ts). Each case below provokes the real violation
// in Postgres; neither would pass with the old `.code`-only check.

beforeEach(async () => {
  await resetDatabase();
});

describe("unique violations surface as answers, not 500s", () => {
  it("returns the winner's order when the same idempotency key is submitted twice at once", async () => {
    // The double click on "Confirmar" from a logged-in customer. Depending on timing the loser
    // either reaches the insert and hits the unique index, or reads the cart after the winner
    // emptied it. Both paths were broken before Fase 9 (a 500, and a 409 EMPTY_CART); either
    // way the loser must get the winner's order back. Repeated, so both interleavings run.
    const userId = await seedProfile({ fullName: "Ana Cuenta", phone: "999" });
    const { variantId } = await seedVariant(5);
    const [cart] = await db.insert(carts).values({ userId }).returning({ id: carts.id });
    const input = { deliveryMethod: "delivery" as const, shippingAddress: "Av. Cuenta 1" };

    for (let round = 0; round < 5; round++) {
      const key = `account-race-${round}`;
      await db.insert(cartItems).values({ cartId: cart!.id, variantId, quantity: 1 }).onConflictDoNothing();
      const attempt = { ...input, idempotencyKey: key };

      const [a, b] = await Promise.all([createOrder(userId, attempt), createOrder(userId, attempt)]);

      expect(a.ok && b.ok).toBe(true);
      if (!a.ok || !b.ok) return;
      expect(a.order.id).toBe(b.order.id);
    }
    expect(await db.select().from(orders).where(eq(orders.userId, userId))).toHaveLength(5);
  });

  it("answers 409 DUPLICATE when a product's slug already exists", async () => {
    const [category] = await db
      .insert(categories)
      .values({ name: "Corsets", slug: "corsets" })
      .returning({ id: categories.id });
    const input = { name: "Corset Rosa", price: "89.90", categoryId: category!.id };

    const first = await createProduct(input);
    const second = await createProduct(input);

    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: false, status: 409, code: "DUPLICATE" });
  });
});
