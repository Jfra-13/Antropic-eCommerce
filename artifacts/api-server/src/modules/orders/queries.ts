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
  type Order,
  type OrderItem,
  type InsertOrder,
  type InsertOrderItem,
  type PaymentProof,
} from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Tx } from "../../lib/tx";

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
