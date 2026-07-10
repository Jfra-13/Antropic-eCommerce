import {
  db,
  carts,
  cartItems,
  productVariants,
  products,
  orders,
  orderItems,
  couponRedemptions,
  paymentProofs,
  pickupPoints,
  profiles,
  type Order,
  type OrderItem,
  type InsertOrder,
  type InsertOrderItem,
  type PaymentProof,
} from "@workspace/db";
import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { Tx } from "../../lib/tx";
import { canTransitionFulfillment } from "../../lib/order-state";

type FulfillmentStatus = NonNullable<Order["fulfillmentStatus"]>;

export type CheckoutLine = {
  variantId: string;
  quantity: number;
  size: string;
  color: string;
  sku: string;
  stock: number;
  active: boolean;
  // Effective unit price (variant override or base product price). Fixed-point string.
  unitPrice: string;
  productName: string;
};

// Read the user's cart lines with the data checkout needs. Read outside the order
// transaction — a user racing their own checkout against their own cart edits is not a
// real concern, and stock isn't decremented here anyway (that's at approval, fase 5).
export async function getCartForCheckout(
  userId: string,
): Promise<{ cartId: string; lines: CheckoutLine[] } | null> {
  const cart = await db
    .select({ id: carts.id })
    .from(carts)
    .where(eq(carts.userId, userId))
    .limit(1);
  if (!cart[0]) return null;

  const rows = await db
    .select({
      variantId: cartItems.variantId,
      quantity: cartItems.quantity,
      size: productVariants.size,
      color: productVariants.color,
      sku: productVariants.sku,
      stock: productVariants.stock,
      active: productVariants.active,
      priceOverride: productVariants.priceOverride,
      productName: products.name,
      productPrice: products.price,
    })
    .from(cartItems)
    .innerJoin(productVariants, eq(cartItems.variantId, productVariants.id))
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(eq(cartItems.cartId, cart[0].id));

  const lines: CheckoutLine[] = rows.map((r) => ({
    variantId: r.variantId,
    quantity: r.quantity,
    size: r.size,
    color: r.color,
    sku: r.sku,
    stock: r.stock,
    active: r.active,
    unitPrice: r.priceOverride ?? r.productPrice,
    productName: r.productName,
  }));
  return { cartId: cart[0].id, lines };
}

export async function getActivePickupPoint(id: string): Promise<{ id: string } | undefined> {
  const rows = await db
    .select({ id: pickupPoints.id })
    .from(pickupPoints)
    .where(and(eq(pickupPoints.id, id), eq(pickupPoints.active, true)))
    .limit(1);
  return rows[0];
}

export async function getOrderByIdempotencyKey(
  userId: string,
  key: string,
): Promise<Order | undefined> {
  const rows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.userId, userId), eq(orders.idempotencyKey, key)))
    .limit(1);
  return rows[0];
}

export async function insertOrder(tx: Tx, values: InsertOrder): Promise<Order> {
  const rows = await tx.insert(orders).values(values).returning();
  const order = rows[0];
  if (!order) throw new Error("Order insert returned no row");
  return order;
}

export async function insertOrderItems(tx: Tx, items: InsertOrderItem[]): Promise<void> {
  if (items.length > 0) await tx.insert(orderItems).values(items);
}

export async function insertRedemption(
  tx: Tx,
  couponId: string,
  orderId: string,
  userId: string,
): Promise<void> {
  await tx.insert(couponRedemptions).values({ couponId, orderId, userId });
}

export async function clearCartItems(tx: Tx, cartId: string): Promise<void> {
  await tx.delete(cartItems).where(eq(cartItems.cartId, cartId));
}

export async function getOrderForUser(userId: string, orderId: string): Promise<Order | undefined> {
  const rows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function getOrderItems(orderId: string): Promise<OrderItem[]> {
  return db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
}

export async function listOrdersForUser(
  userId: string,
  page: number,
  limit: number,
): Promise<{ items: Order[]; total: number }> {
  const offset = (page - 1) * limit;
  const items = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt))
    .limit(limit)
    .offset(offset);
  const counted = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(eq(orders.userId, userId));
  return { items, total: counted[0]?.count ?? 0 };
}

// Contact fields the order flow needs: completeness gate at creation, contact info on the
// admin boards.
export async function getProfileContact(
  userId: string,
): Promise<{ fullName: string | null; phone: string | null } | undefined> {
  const rows = await db
    .select({ fullName: profiles.fullName, phone: profiles.phone })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return rows[0];
}

export type ShipmentRow = {
  order: Order;
  customerEmail: string;
  customerName: string | null;
  customerPhone: string | null;
};

// Paid orders in fulfilment (the logistics board), optionally filtered by method/status.
// Oldest first — logistics works the oldest order first.
export async function listShipments(
  filters: { deliveryMethod?: Order["deliveryMethod"]; status?: FulfillmentStatus },
  page: number,
  limit: number,
): Promise<{ rows: ShipmentRow[]; total: number }> {
  const conds = [eq(orders.paymentStatus, "pagado"), isNotNull(orders.fulfillmentStatus)];
  if (filters.deliveryMethod) conds.push(eq(orders.deliveryMethod, filters.deliveryMethod));
  if (filters.status) conds.push(eq(orders.fulfillmentStatus, filters.status));
  const where = and(...conds);
  const offset = (page - 1) * limit;

  const rows = await db
    .select({
      order: orders,
      customerEmail: profiles.email,
      customerName: profiles.fullName,
      customerPhone: profiles.phone,
    })
    .from(orders)
    .innerJoin(profiles, eq(orders.userId, profiles.id))
    .where(where)
    .orderBy(asc(orders.createdAt))
    .limit(limit)
    .offset(offset);

  const counted = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(where);

  return { rows, total: counted[0]?.count ?? 0 };
}

export type AdvanceResult =
  | { kind: "ok"; order: Order }
  | { kind: "not_found" }
  | { kind: "not_in_fulfillment" }
  | { kind: "invalid_transition"; from: FulfillmentStatus };

// Advance an order along its fulfilment state machine. Locked FOR UPDATE so two staff can't
// double-advance the same order; the transition map rejects illegal hops (HTTP 409).
export async function advanceFulfillmentTx(
  orderId: string,
  to: FulfillmentStatus,
): Promise<AdvanceResult> {
  return db.transaction(async (tx): Promise<AdvanceResult> => {
    const locked = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .for("update")
      .limit(1);
    const order = locked[0];
    if (!order) return { kind: "not_found" };
    if (order.paymentStatus !== "pagado" || order.fulfillmentStatus === null) {
      return { kind: "not_in_fulfillment" };
    }
    if (!canTransitionFulfillment(order.fulfillmentStatus, to)) {
      return { kind: "invalid_transition", from: order.fulfillmentStatus };
    }
    const updated = await tx
      .update(orders)
      .set({ fulfillmentStatus: to })
      .where(eq(orders.id, orderId))
      .returning();
    return { kind: "ok", order: updated[0]! };
  });
}

// Latest proof status for the order, for the DTO's paymentProofStatus field (null = none yet).
export async function latestProofStatus(orderId: string): Promise<PaymentProof["status"] | null> {
  const rows = await db
    .select({ status: paymentProofs.status })
    .from(paymentProofs)
    .where(eq(paymentProofs.orderId, orderId))
    .orderBy(desc(paymentProofs.createdAt))
    .limit(1);
  return rows[0]?.status ?? null;
}
