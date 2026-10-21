import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, orders, carts, cartItems, wishlists } from "@workspace/db";
import {
  resetDatabase,
  seedProfile,
  seedVariant,
  seedOrderInState,
  orderPaymentStatus,
  type SeededVariant,
} from "../test/db";
import { startApi, type Api } from "../test/http";

// Only the JWT signature is faked: the token is the profile id, and requireAuth still loads
// the profile from the database.
vi.mock("jose", () => ({
  createRemoteJWKSet: () => () => undefined,
  jwtVerify: async (token: string) => ({ payload: { sub: token } }),
}));

// Auditoría §11.11, Fases A y B: the ownership checks on orders, constancias, returns, cart and
// wishlist existed in the code with nothing to fail if one was removed. One scenario covers
// them all: user B, with a valid session of their own, presents user A's ids everywhere.
// Each refusal is paired with A doing the same thing successfully, so a route that refuses
// everyone cannot pass for one that checks the owner.
describe("one customer against another customer's resources", () => {
  let api: Api;
  let a: string;
  let b: string;
  let variant: SeededVariant;
  let paidOrder: string;
  let unpaidOrder: string;

  beforeAll(async () => {
    await resetDatabase();
    a = await seedProfile();
    b = await seedProfile();
    variant = await seedVariant(10);
    paidOrder = await seedOrderInState(a, "pagado");
    unpaidOrder = await seedOrderInState(a, "pendiente_pago");
    // Fulfillment, not payment: a return needs a delivered order. payment_status is untouched.
    await db
      .update(orders)
      .set({ fulfillmentStatus: "entregado" })
      .where(eq(orders.id, paidOrder));
    api = await startApi();

    // A builds up what B will go after, through the same routes.
    expect((await api.request("POST", "/cart/items", a, { variantId: variant.variantId, quantity: 1 })).status).toBe(200);
    expect((await api.request("POST", "/wishlist", a, { productId: variant.productId })).ok).toBe(true);
    expect((await api.request("POST", "/returns", a, { orderId: paidOrder })).status).toBe(201);
  });

  afterAll(async () => {
    await api.close();
  });

  it("does not list or open another customer's orders", async () => {
    const own = await (await api.request("GET", "/orders", a)).text();
    expect(own).toContain(paidOrder);
    const theirs = await (await api.request("GET", "/orders", b)).text();
    expect(theirs).not.toContain(paidOrder);
    expect(theirs).not.toContain(unpaidOrder);

    expect((await api.request("GET", `/orders/${paidOrder}`, a)).status).toBe(200);
    expect((await api.request("GET", `/orders/${paidOrder}`, b)).status).toBe(404);
  });

  it("does not let them upload a constancia to another customer's order", async () => {
    const uploadUrl = await api.request("POST", `/orders/${unpaidOrder}/payment-proof/upload-url`, b, {});
    expect(uploadUrl.status).toBe(404);

    // A path shaped exactly like one the server would issue for that order.
    const attach = await api.request("POST", `/orders/${unpaidOrder}/payment-proof`, b, {
      path: `${unpaidOrder}/${crypto.randomUUID()}`,
    });
    expect(attach.status).toBe(404);
    expect(await orderPaymentStatus(unpaidOrder)).toBe("pendiente_pago");
  });

  it("does not show or open returns on another customer's order", async () => {
    const own = await (await api.request("GET", `/returns?orderId=${paidOrder}`, a)).json();
    expect(JSON.stringify(own)).toContain(paidOrder);
    const theirs = await (await api.request("GET", `/returns?orderId=${paidOrder}`, b)).json();
    expect(JSON.stringify(theirs)).not.toContain(paidOrder);

    // 404, not 409: A already has a ticket open on this order, and B must not learn that.
    const open = await api.request("POST", "/returns", b, { orderId: paidOrder });
    expect(open.status).toBe(404);
  });

  it("does not show or change another customer's cart", async () => {
    expect(await (await api.request("GET", "/cart", a)).text()).toContain(variant.variantId);
    expect(await (await api.request("GET", "/cart", b)).text()).not.toContain(variant.variantId);

    await api.request("PATCH", `/cart/items/${variant.variantId}`, b, { quantity: 5 });
    await api.request("DELETE", `/cart/items/${variant.variantId}`, b);

    const [aItem] = await db
      .select({ quantity: cartItems.quantity })
      .from(cartItems)
      .innerJoin(carts, eq(carts.id, cartItems.cartId))
      .where(and(eq(carts.userId, a), eq(cartItems.variantId, variant.variantId)));
    expect(aItem?.quantity).toBe(1);
  });

  it("does not show or change another customer's wishlist", async () => {
    expect(await (await api.request("GET", "/wishlist", a)).text()).toContain(variant.productId);
    expect(await (await api.request("GET", "/wishlist", b)).text()).not.toContain(variant.productId);

    await api.request("DELETE", `/wishlist/${variant.productId}`, b);

    const aRows = await db
      .select()
      .from(wishlists)
      .where(and(eq(wishlists.userId, a), eq(wishlists.productId, variant.productId)));
    expect(aRows).toHaveLength(1);
  });
});
