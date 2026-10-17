import { db, type Order } from "@workspace/db";
import type {
  Order as OrderDto,
  OrderList as OrderListDto,
  CreateOrderInput,
  CreateGuestOrderInput,
  GuestOrderReceipt,
  ShipmentList as ShipmentListDto,
  AdvanceFulfillmentInput,
  AdminOrderList as AdminOrderListDto,
  AdminOrderDetail as AdminOrderDetailDto,
} from "@workspace/api-zod";
import { toCents, fromCents } from "../../lib/money";
import { isUniqueViolation } from "../../lib/pg-errors";
import * as notifications from "../notifications/service";
import { getShippingCostCents } from "../shipping/service";
import { validateCoupon } from "../coupons/service";
import { tryConsumeCoupon } from "../coupons/queries";
import type { Tx } from "../../lib/tx";
import { generateGuestAccessToken } from "./guest-access";
import {
  getCartForCheckout,
  getLinesForItems,
  getProfileContact,
  getActivePickupPoint,
  getOrderByIdempotencyKey,
  getGuestOrderByIdempotencyKey,
  isEmailBlocked,
  insertGuestProfile,
  claimGuestOrdersTx,
  insertOrder,
  insertOrderItems,
  insertRedemption,
  clearCartItems,
  getOrderForUser,
  getOrderItems,
  listOrdersForUser,
  latestProofStatus,
  listShipments,
  listAdminOrders,
  getAdminOrderRow,
  advanceFulfillmentTx,
  type AdminOrderFilters,
  type CheckoutLine,
} from "./queries";
import { toOrderDto, toOrderItemDto, toOrderListItemDto, referenceCode } from "./mappers";

type OrderFailure = { ok: false; status: number; code: string; message: string };

export type OrderResult = { ok: true; status: number; order: OrderDto } | OrderFailure;

function err(status: number, code: string, message: string): OrderFailure {
  return { ok: false, status, code, message };
}

// Coupon lost the atomic use-count race inside the transaction (exhausted between validation
// and consumption). Thrown to roll back, then mapped to a 422 by the caller.
class CouponRaceError extends Error {}

// Assemble the full order DTO (items + latest proof status). Exported so the payments
// module returns the same shape after attaching a proof.
export async function buildOrderDto(order: Order): Promise<OrderDto> {
  const [items, proofStatus] = await Promise.all([
    getOrderItems(order.id),
    latestProofStatus(order.id),
  ]);
  return toOrderDto(order, items, proofStatus);
}

// What an order needs besides its lines and its customer. Account and guest checkout both
// send exactly these fields.
type Placement = Pick<
  CreateOrderInput,
  "deliveryMethod" | "shippingAddress" | "pickupPointId" | "couponCode" | "idempotencyKey"
>;

type PricedOrder = {
  subtotalCents: number;
  shippingCents: number;
  discountCents: number;
  totalCents: number;
  couponId: string | null;
  couponCode: string | null;
};

type Priced = { ok: true; priced: PricedOrder } | { ok: false; error: OrderFailure };

// Everything between "these are the lines" and "write the order", shared by account and guest
// checkout so the two cannot drift: the delivery rules, the stock check and above all the
// totals. A guest path that priced its own way would be a second place to get money wrong.
async function priceOrder(input: Placement, lines: CheckoutLine[]): Promise<Priced> {
  // Delivery method requirements.
  if (input.deliveryMethod === "delivery") {
    if (!input.shippingAddress?.trim()) {
      return { ok: false, error: err(400, "SHIPPING_ADDRESS_REQUIRED", "shippingAddress is required for delivery") };
    }
  } else {
    if (!input.pickupPointId) {
      return { ok: false, error: err(400, "PICKUP_POINT_REQUIRED", "pickupPointId is required for recojo") };
    }
    const pickup = await getActivePickupPoint(input.pickupPointId);
    if (!pickup) {
      return { ok: false, error: err(400, "PICKUP_POINT_INVALID", "pickupPointId is not a valid active pickup point") };
    }
  }

  if (lines.length === 0) {
    return { ok: false, error: err(409, "EMPTY_CART", "Cart is empty") };
  }

  // Validate stock but do NOT decrement — decrement happens at payment approval (fase 5).
  for (const line of lines) {
    if (!line.active) {
      return { ok: false, error: err(409, "OUT_OF_STOCK", `Variant ${line.variantId} is no longer available`) };
    }
    if (line.stock < line.quantity) {
      return { ok: false, error: err(409, "OUT_OF_STOCK", `Insufficient stock for SKU ${line.sku}`) };
    }
  }

  // Totals are computed server-side — the client never supplies amounts (planeación §5.2).
  const subtotalCents = lines.reduce(
    (sum, line) => sum + toCents(line.unitPrice) * line.quantity,
    0,
  );
  const shippingCents = await getShippingCostCents(input.deliveryMethod, subtotalCents);

  let discountCents = 0;
  let couponId: string | null = null;
  let couponCode: string | null = null;
  if (input.couponCode) {
    const validation = await validateCoupon(input.couponCode, subtotalCents);
    if (!validation.ok) return { ok: false, error: err(422, validation.error, "Coupon is not valid") };
    discountCents = validation.discountCents;
    couponId = validation.coupon.id;
    couponCode = validation.coupon.code;
  }
  const totalCents = subtotalCents + shippingCents - discountCents;
  return {
    ok: true,
    priced: { subtotalCents, shippingCents, discountCents, totalCents, couponId, couponCode },
  };
}

// The writes every order makes, inside the caller's transaction.
async function writeOrder(
  tx: Tx,
  customerId: string,
  input: Placement,
  lines: CheckoutLine[],
  priced: PricedOrder,
  guestAccessToken: string | null,
): Promise<Order> {
  const { couponId, couponCode } = priced;
  // Atomic coupon consumption. ponytail: use-count is bumped here at creation; refunding
  // a coupon when an order is later rejected is deferred to fase 5 if it ever matters.
  if (couponId) {
    const consumed = await tryConsumeCoupon(tx, couponId);
    if (!consumed) throw new CouponRaceError();
  }

  const inserted = await insertOrder(tx, {
    userId: customerId,
    deliveryMethod: input.deliveryMethod,
    pickupPointId: input.deliveryMethod === "recojo" ? input.pickupPointId! : null,
    shippingAddress: input.deliveryMethod === "delivery" ? input.shippingAddress!.trim() : null,
    shippingCost: fromCents(priced.shippingCents),
    subtotal: fromCents(priced.subtotalCents),
    discountAmount: fromCents(priced.discountCents),
    total: fromCents(priced.totalCents),
    couponId,
    couponCode,
    idempotencyKey: input.idempotencyKey ?? null,
    guestAccessToken,
  });

  await insertOrderItems(
    tx,
    lines.map((line) => ({
      orderId: inserted.id,
      variantId: line.variantId,
      productName: line.productName,
      variantLabel: `${line.size} / ${line.color}`,
      sku: line.sku,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      lineTotal: fromCents(toCents(line.unitPrice) * line.quantity),
    })),
  );

  if (couponId) await insertRedemption(tx, couponId, inserted.id, customerId);
  return inserted;
}

export async function createOrder(
  userId: string,
  input: CreateOrderInput,
): Promise<OrderResult> {
  // Idempotency: a repeated key returns the existing order instead of creating a second one.
  if (input.idempotencyKey) {
    const existing = await getOrderByIdempotencyKey(userId, input.idempotencyKey);
    if (existing) return { ok: true, status: 200, order: await buildOrderDto(existing) };
  }

  // The order needs a reachable customer: name + phone on the profile (requerimientos §7.4).
  // The server enforces it; the checkout UI guides the user to fill it inline.
  const contact = await getProfileContact(userId);
  if (!contact?.fullName?.trim() || !contact.phone?.trim()) {
    return err(422, "PROFILE_INCOMPLETE", "Profile name and phone are required to order");
  }

  const cart = await getCartForCheckout(userId);
  const lines = cart?.lines ?? [];
  const result = await priceOrder(input, lines);
  if (!result.ok) {
    // The double click: a concurrent request with this same key can commit between the lookup
    // above and the cart read, and then the cart is empty precisely because it became that
    // order. The key promises the order back, not "cart is empty" — so look once more. The
    // empty read means the other transaction has committed, so the lookup cannot miss it.
    if (result.error.code === "EMPTY_CART" && input.idempotencyKey) {
      const existing = await getOrderByIdempotencyKey(userId, input.idempotencyKey);
      if (existing) return { ok: true, status: 200, order: await buildOrderDto(existing) };
    }
    return result.error;
  }

  try {
    const order = await db.transaction(async (tx) => {
      const inserted = await writeOrder(tx, userId, input, lines, result.priced, null);
      // A non-empty `lines` means the cart exists: priceOrder refuses an empty one.
      await clearCartItems(tx, cart!.cartId);
      return inserted;
    });

    return { ok: true, status: 201, order: await buildOrderDto(order) };
  } catch (e) {
    if (e instanceof CouponRaceError) {
      return err(422, "COUPON_EXHAUSTED", "Coupon is no longer available");
    }
    // Concurrent request with the same idempotency key won the unique constraint — return it.
    if (input.idempotencyKey && isUniqueViolation(e)) {
      const existing = await getOrderByIdempotencyKey(userId, input.idempotencyKey);
      if (existing) return { ok: true, status: 200, order: await buildOrderDto(existing) };
    }
    throw e;
  }
}

// --- Guest checkout (auditoría §1.4) ---------------------------------------------------------

export type GuestOrderResult = { ok: true; status: number; receipt: GuestOrderReceipt } | OrderFailure;

async function guestReceipt(order: Order): Promise<GuestOrderReceipt> {
  return { order: await buildOrderDto(order), accessToken: order.guestAccessToken! };
}

// A repeated idempotency key returns the order it already created — and its token — only to a
// caller presenting the same email. Anything else is somebody else's key.
async function replayGuestOrder(key: string, email: string): Promise<GuestOrderResult | null> {
  const existing = await getGuestOrderByIdempotencyKey(key);
  if (!existing) return null;
  if (existing.email.toLowerCase() !== email) {
    return err(409, "IDEMPOTENCY_KEY_REUSED", "This idempotency key belongs to another order");
  }
  return { ok: true, status: 200, receipt: await guestReceipt(existing.order) };
}

// Places an order for someone without an account. The model is the one decided in §1.4: a
// guest PROFILE (a contact record with no Supabase account behind it) so `orders.user_id` stays
// NOT NULL and every join, the verification queue included, sees the order like any other.
//
// One guest profile per order, never looked up and reused by email. Contact details live on the
// profile, so reuse would mean the second checkout under an address overwrites the first one's
// name and phone — and the email is just something typed into a form. Anyone could rewrite the
// contact details of a stranger's pending order by checking out with their address. Separate
// rows cost a few duplicate contacts; claiming merges them into the account later anyway.
export async function createGuestOrder(input: CreateGuestOrderInput): Promise<GuestOrderResult> {
  const email = input.email.trim().toLowerCase();

  if (input.idempotencyKey) {
    const replay = await replayGuestOrder(input.idempotencyKey, email);
    if (replay) return replay;
  }

  // Blocking an account would mean nothing if the same person could check out logged out.
  if (await isEmailBlocked(email)) {
    return err(403, "BLOCKED", "This email cannot place orders. Contact the store.");
  }

  const { lines, missing } = await getLinesForItems(input.items);
  if (missing) return err(409, "OUT_OF_STOCK", `Variant ${missing} is no longer available`);
  const result = await priceOrder(input, lines);
  if (!result.ok) return result.error;

  try {
    const order = await db.transaction(async (tx) => {
      // Inside the order transaction, so a checkout that fails (stock, coupon race) leaves no
      // orphan contact record behind.
      const guestId = await insertGuestProfile(tx, {
        email,
        fullName: input.fullName.trim(),
        phone: input.phone.trim(),
        shippingAddress:
          input.deliveryMethod === "delivery" ? (input.shippingAddress?.trim() ?? null) : null,
      });
      return writeOrder(tx, guestId, input, lines, result.priced, generateGuestAccessToken());
    });

    // The way back to the order: without it a guest who closes the tab before paying has no
    // way to upload the constancia. Best-effort like every notification.
    void notifications.notifyGuestOrderPlaced(order);
    return { ok: true, status: 201, receipt: await guestReceipt(order) };
  } catch (e) {
    if (e instanceof CouponRaceError) {
      return err(422, "COUPON_EXHAUSTED", "Coupon is no longer available");
    }
    if (input.idempotencyKey && isUniqueViolation(e)) {
      const replay = await replayGuestOrder(input.idempotencyKey, email);
      // The key exists but not on a guest order: it is an account's key, and not ours to replay.
      return replay ?? err(409, "IDEMPOTENCY_KEY_REUSED", "This idempotency key belongs to another order");
    }
    throw e;
  }
}

export type ClaimResult = { ok: true; claimed: number } | OrderFailure;

// Brings the guest orders placed under the caller's email into their account.
//
// Matching on email is only safe when the session proves the caller controls that mailbox —
// otherwise registering someone else's address would hand over their orders, address and phone
// included. `emailProven` comes from how this session signed in (lib/auth.ts).
export async function claimGuestOrders(user: {
  id: string;
  email: string;
  emailProven: boolean;
}): Promise<ClaimResult> {
  if (!user.emailProven) {
    return {
      ok: false,
      status: 403,
      code: "EMAIL_NOT_PROVEN",
      message: "Sign in with a magic link or Google to link guest orders to this account",
    };
  }
  if (!user.email.trim()) return { ok: true, claimed: 0 };
  return { ok: true, claimed: await claimGuestOrdersTx(user.id, user.email.trim()) };
}

export async function getOrder(userId: string, orderId: string): Promise<OrderDto | null> {
  const order = await getOrderForUser(userId, orderId);
  if (!order) return null;
  return buildOrderDto(order);
}

export async function listOrders(
  userId: string,
  page: number,
  limit: number,
): Promise<OrderListDto> {
  const { items, total } = await listOrdersForUser(userId, page, limit);
  return { items: items.map(toOrderListItemDto), total, page, limit };
}

// --- Backoffice: shipments / logistics (planeación §5.1; requerimientos §6.4) ---

export async function getShipments(
  filters: {
    deliveryMethod?: Order["deliveryMethod"];
    status?: NonNullable<Order["fulfillmentStatus"]>;
    recentTerminalDays?: number;
  },
  page: number,
  limit: number,
): Promise<ShipmentListDto> {
  const { rows, total } = await listShipments(filters, page, limit);
  const items = rows.map((r) => ({
    id: r.order.id,
    orderNumber: r.order.orderNumber,
    referenceCode: referenceCode(r.order.orderNumber),
    customerEmail: r.customerEmail,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    deliveryMethod: r.order.deliveryMethod,
    // fulfillmentStatus is guaranteed non-null by the query (isNotNull filter).
    fulfillmentStatus: r.order.fulfillmentStatus!,
    shippingAddress: r.order.shippingAddress,
    total: r.order.total,
    createdAt: r.order.createdAt,
  }));
  return { items, total, page, limit };
}

// --- Backoffice: full orders module (ronda 5) — employee + admin ---

export async function getAdminOrders(
  filters: AdminOrderFilters,
  page: number,
  limit: number,
): Promise<AdminOrderListDto> {
  const { rows, total } = await listAdminOrders(filters, page, limit);
  const items = rows.map((r) => ({
    id: r.order.id,
    orderNumber: r.order.orderNumber,
    referenceCode: referenceCode(r.order.orderNumber),
    customerEmail: r.customerEmail,
    customerName: r.customerName,
    customerIsGuest: r.customerIsGuest,
    deliveryMethod: r.order.deliveryMethod,
    paymentStatus: r.order.paymentStatus,
    fulfillmentStatus: r.order.fulfillmentStatus,
    total: r.order.total,
    createdAt: r.order.createdAt,
  }));
  return { items, total, page, limit };
}

export async function getAdminOrderDetail(orderId: string): Promise<AdminOrderDetailDto | null> {
  const row = await getAdminOrderRow(orderId);
  if (!row) return null;
  const [items, proofStatus] = await Promise.all([
    getOrderItems(row.order.id),
    latestProofStatus(row.order.id),
  ]);
  return {
    id: row.order.id,
    orderNumber: row.order.orderNumber,
    referenceCode: referenceCode(row.order.orderNumber),
    customerEmail: row.customerEmail,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    customerIsGuest: row.customerIsGuest,
    paymentStatus: row.order.paymentStatus,
    paymentMethod: row.order.paymentMethod,
    fulfillmentStatus: row.order.fulfillmentStatus,
    deliveryMethod: row.order.deliveryMethod,
    pickupPointId: row.order.pickupPointId,
    pickupPointName: row.pickupPointName,
    shippingAddress: row.order.shippingAddress,
    subtotal: row.order.subtotal,
    shippingCost: row.order.shippingCost,
    discountAmount: row.order.discountAmount,
    total: row.order.total,
    couponCode: row.order.couponCode,
    paymentProofStatus: proofStatus,
    createdAt: row.order.createdAt,
    updatedAt: row.order.updatedAt,
    items: items.map(toOrderItemDto),
  };
}

export async function advanceFulfillment(
  orderId: string,
  to: AdvanceFulfillmentInput["to"],
): Promise<OrderResult> {
  const result = await advanceFulfillmentTx(orderId, to);
  switch (result.kind) {
    case "ok":
      // Best-effort: notify the customer of the new fulfilment state.
      void notifications.notifyOrderStatusChanged(result.order);
      return { ok: true, status: 200, order: await buildOrderDto(result.order) };
    case "not_found":
      return err(404, "NOT_FOUND", "Order not found");
    case "not_in_fulfillment":
      return err(409, "NOT_IN_FULFILLMENT", "Order is not a paid order in fulfilment");
    case "invalid_transition":
      return err(
        409,
        "INVALID_TRANSITION",
        `Cannot move fulfilment from '${result.from}' to '${to}'`,
      );
  }
}
