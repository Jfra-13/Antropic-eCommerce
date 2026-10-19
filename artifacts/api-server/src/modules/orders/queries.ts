import { randomUUID } from "node:crypto";
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
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lt,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { Tx } from "../../lib/tx";
import { canTransitionFulfillment } from "../../lib/order-state";
import { parseOrderReference } from "@workspace/brand";
// Function-only import cycle (guest-access reads getOrderById from here): safe, nothing runs at load.
import { tokensMatch } from "./guest-access";

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

// The same lines as getCartForCheckout, for a cart that only exists in the guest's browser.
// Prices and stock come from the catalogue, never from the request: the client says which
// variants and how many, nothing else. Repeated variants are folded into one line, the way the
// server cart folds them, so a crafted body cannot split one SKU into lines the stock check
// would look at one by one.
//
// `missing` names the first variant that does not exist at all — a line that cannot be priced
// has to stop the checkout, not silently vanish from it.
export async function getLinesForItems(
  items: { variantId: string; quantity: number }[],
): Promise<{ lines: CheckoutLine[]; missing: string | null }> {
  const quantities = new Map<string, number>();
  for (const item of items) {
    quantities.set(item.variantId, (quantities.get(item.variantId) ?? 0) + item.quantity);
  }
  const ids = [...quantities.keys()];
  if (ids.length === 0) return { lines: [], missing: null };

  const rows = await db
    .select({
      variantId: productVariants.id,
      size: productVariants.size,
      color: productVariants.color,
      sku: productVariants.sku,
      stock: productVariants.stock,
      active: productVariants.active,
      priceOverride: productVariants.priceOverride,
      productName: products.name,
      productPrice: products.price,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(inArray(productVariants.id, ids));
  const byId = new Map(rows.map((r) => [r.variantId, r]));

  const lines: CheckoutLine[] = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) return { lines: [], missing: id };
    lines.push({
      variantId: r.variantId,
      quantity: quantities.get(id)!,
      size: r.size,
      color: r.color,
      sku: r.sku,
      stock: r.stock,
      active: r.active,
      unitPrice: r.priceOverride ?? r.productPrice,
      productName: r.productName,
    });
  }
  return { lines, missing: null };
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

// A guest order replayed by its idempotency key, with the email it was placed under so the
// caller can refuse a key presented with a different one. Only guest orders: an account order
// is never returned to an anonymous caller, whatever key they hold.
export async function getGuestOrderByIdempotencyKey(
  key: string,
): Promise<{ order: Order; email: string } | undefined> {
  const rows = await db
    .select({ order: orders, email: profiles.email })
    .from(orders)
    .innerJoin(profiles, eq(orders.userId, profiles.id))
    // is_guest: once a claim re-points the order to an account, its profile is the account's
    // and the order stops being replayable. Otherwise anyone holding the key plus the account
    // email could get the claimed order and its access token back anonymously.
    .where(
      and(
        eq(orders.idempotencyKey, key),
        isNotNull(orders.guestAccessToken),
        eq(profiles.isGuest, true),
      ),
    )
    .limit(1);
  return rows[0];
}

// Whether an ACCOUNT with this email has been blocked by staff. Guest checkout asks so that
// blocking an account is not undone by checking out without logging in.
export async function isEmailBlocked(email: string): Promise<boolean> {
  const rows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(
      and(
        sql`lower(${profiles.email}) = lower(${email})`,
        eq(profiles.isGuest, false),
        eq(profiles.blocked, true),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function insertGuestProfile(
  tx: Tx,
  values: { email: string; fullName: string; phone: string; shippingAddress: string | null },
): Promise<string> {
  const rows = await tx
    .insert(profiles)
    .values({ id: randomUUID(), isGuest: true, ...values })
    .returning({ id: profiles.id });
  return rows[0]!.id;
}

export async function getOrderById(orderId: string): Promise<Order | undefined> {
  const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return rows[0];
}

// Moves the guest orders named by `pairs` into the account `accountId`, in one transaction.
// Returns how many orders moved.
//
// Ownership is proven by the order's access token, never by email (auditoría §1.4): the token
// is the capability that already opens the order, while an email in the JWT only says which
// address the account has NOW — Supabase lets a session change it, and with confirmation off
// nothing proves the new one. A pair moves only when the token matches AND the order still
// belongs to a guest profile, so a forwarded link cannot take an order out of another account.
//
// The orders are re-pointed rather than looked up through the guest profile forever after:
// once `orders.user_id` is the account, "mis pedidos", the constancia upload and returns all
// work through the ownership check they already have, and no query has to learn that an order
// can belong to someone through a second table.
//
// The guest profiles themselves stay. payment_events.actor_id points at them — the guest is
// who uploaded the constancia, and the audit trail must keep saying so.
//
// Only orders.user_id moves. Guest profile fields (name, phone, address) are never copied into
// the account: they were typed at checkout and are unverified, and the order keeps its own
// contact snapshot anyway.
export async function claimGuestOrdersTx(
  accountId: string,
  pairs: { orderId: string; accessToken: string }[],
): Promise<number> {
  const tokens = new Map(pairs.map((p) => [p.orderId.toLowerCase(), p.accessToken]));
  return db.transaction(async (tx) => {
    const candidates = await tx
      .select({ id: orders.id, userId: orders.userId, token: orders.guestAccessToken })
      .from(orders)
      .innerJoin(profiles, eq(profiles.id, orders.userId))
      .where(and(inArray(orders.id, [...tokens.keys()]), eq(profiles.isGuest, true)))
      .for("update", { of: orders });
    const matched = candidates.filter(
      (c) => c.token !== null && tokensMatch(tokens.get(c.id.toLowerCase()) ?? "", c.token),
    );
    if (matched.length === 0) return 0;

    const ids = matched.map((m) => m.id);
    await tx.update(orders).set({ userId: accountId }).where(inArray(orders.id, ids));
    await tx
      .update(couponRedemptions)
      .set({ userId: accountId })
      .where(inArray(couponRedemptions.orderId, ids));
    return ids.length;
  });
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
  filters: {
    deliveryMethod?: Order["deliveryMethod"];
    status?: FulfillmentStatus;
    recentTerminalDays?: number;
  },
  page: number,
  limit: number,
): Promise<{ rows: ShipmentRow[]; total: number }> {
  const conds = [eq(orders.paymentStatus, "pagado"), isNotNull(orders.fulfillmentStatus)];
  if (filters.deliveryMethod) conds.push(eq(orders.deliveryMethod, filters.deliveryMethod));
  if (filters.status) conds.push(eq(orders.fulfillmentStatus, filters.status));
  // Keep the terminal columns bounded: delivered/picked-up orders older than the window are
  // hidden from the board (never deleted — the orders module keeps the full history).
  // updatedAt auto-bumps on the status change, so it marks when the order became terminal.
  if (filters.recentTerminalDays) {
    const cutoff = new Date(Date.now() - filters.recentTerminalDays * 24 * 60 * 60 * 1000);
    conds.push(
      or(
        notInArray(orders.fulfillmentStatus, ["entregado", "recogido"]),
        gte(orders.updatedAt, cutoff),
      )!,
    );
  }
  const where = and(...conds);
  const offset = (page - 1) * limit;

  const rows = await db
    .select({
      order: orders,
      customerEmail: profiles.email,
      customerName: sql<string | null>`coalesce(${orders.contactName}, ${profiles.fullName})`,
      customerPhone: sql<string | null>`coalesce(${orders.contactPhone}, ${profiles.phone})`,
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

export type AdminOrderRow = {
  order: Order;
  customerEmail: string;
  customerName: string | null;
  customerIsGuest: boolean;
};

export type AdminOrderFilters = {
  q?: string;
  paymentStatus?: Order["paymentStatus"];
  fulfillmentStatus?: FulfillmentStatus;
  userId?: string;
  // Inclusive date bounds on createdAt (zod coerces the YYYY-MM-DD params to Date).
  from?: Date;
  to?: Date;
};

// Full order listing for the back office (any payment/fulfilment state), newest first.
export async function listAdminOrders(
  filters: AdminOrderFilters,
  page: number,
  limit: number,
): Promise<{ rows: AdminOrderRow[]; total: number }> {
  const conds = [];
  if (filters.paymentStatus) conds.push(eq(orders.paymentStatus, filters.paymentStatus));
  if (filters.fulfillmentStatus) conds.push(eq(orders.fulfillmentStatus, filters.fulfillmentStatus));
  if (filters.userId) conds.push(eq(orders.userId, filters.userId));
  if (filters.from) conds.push(gte(orders.createdAt, filters.from));
  // Inclusive end date: strictly before the start of the following day.
  if (filters.to) conds.push(lt(orders.createdAt, new Date(filters.to.getTime() + 24 * 60 * 60 * 1000)));
  if (filters.q) {
    const term = `%${filters.q.trim()}%`;
    const qConds = [
      ilike(profiles.fullName, term),
      ilike(orders.contactName, term),
      ilike(profiles.email, term),
    ];
    // A term that reads as an order reference — bare digits, or the brand prefix followed by
    // digits — also matches the order number exactly. Parsing is shared with the builder in
    // lib/brand so the two cannot drift apart when the prefix changes.
    const num = parseOrderReference(filters.q);
    if (num !== null) qConds.push(eq(orders.orderNumber, num));
    conds.push(or(...qConds)!);
  }
  const where = conds.length > 0 ? and(...conds) : undefined;
  const offset = (page - 1) * limit;

  const rows = await db
    .select({
      order: orders,
      customerEmail: profiles.email,
      customerName: sql<string | null>`coalesce(${orders.contactName}, ${profiles.fullName})`,
      customerIsGuest: profiles.isGuest,
    })
    .from(orders)
    .innerJoin(profiles, eq(orders.userId, profiles.id))
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(limit)
    .offset(offset);

  const counted = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .innerJoin(profiles, eq(orders.userId, profiles.id))
    .where(where);

  return { rows, total: counted[0]?.count ?? 0 };
}

export type AdminOrderDetailRow = AdminOrderRow & {
  customerPhone: string | null;
  pickupPointName: string | null;
};

export async function getAdminOrderRow(orderId: string): Promise<AdminOrderDetailRow | undefined> {
  const rows = await db
    .select({
      order: orders,
      customerEmail: profiles.email,
      customerName: sql<string | null>`coalesce(${orders.contactName}, ${profiles.fullName})`,
      customerPhone: sql<string | null>`coalesce(${orders.contactPhone}, ${profiles.phone})`,
      customerIsGuest: profiles.isGuest,
      pickupPointName: pickupPoints.name,
    })
    .from(orders)
    .innerJoin(profiles, eq(orders.userId, profiles.id))
    .leftJoin(pickupPoints, eq(orders.pickupPointId, pickupPoints.id))
    .where(eq(orders.id, orderId))
    .limit(1);
  return rows[0];
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
