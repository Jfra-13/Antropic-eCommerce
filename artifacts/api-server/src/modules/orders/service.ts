import { db, type Order } from "@workspace/db";
import type {
  Order as OrderDto,
  OrderList as OrderListDto,
  CreateOrderInput,
  ShipmentList as ShipmentListDto,
  AdvanceFulfillmentInput,
} from "@workspace/api-zod";
import { toCents, fromCents } from "../../lib/money";
import * as notifications from "../notifications/service";
import { getShippingCostCents } from "../shipping/service";
import { validateCoupon } from "../coupons/service";
import { tryConsumeCoupon } from "../coupons/queries";
import {
  getCartForCheckout,
  getProfileContact,
  getActivePickupPoint,
  getOrderByIdempotencyKey,
  insertOrder,
  insertOrderItems,
  insertRedemption,
  clearCartItems,
  getOrderForUser,
  getOrderItems,
  listOrdersForUser,
  latestProofStatus,
  listShipments,
  advanceFulfillmentTx,
} from "./queries";
import { toOrderDto, toOrderListItemDto, referenceCode } from "./mappers";

export type OrderResult =
  | { ok: true; status: number; order: OrderDto }
  | { ok: false; status: number; code: string; message: string };

function err(status: number, code: string, message: string): OrderResult {
  return { ok: false, status, code, message };
}

// Coupon lost the atomic use-count race inside the transaction (exhausted between validation
// and consumption). Thrown to roll back, then mapped to a 422 by the caller.
class CouponRaceError extends Error {}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "23505"
  );
}

// Assemble the full order DTO (items + latest proof status). Exported so the payments
// module returns the same shape after attaching a proof.
export async function buildOrderDto(order: Order): Promise<OrderDto> {
  const [items, proofStatus] = await Promise.all([
    getOrderItems(order.id),
    latestProofStatus(order.id),
  ]);
  return toOrderDto(order, items, proofStatus);
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

  // Delivery method requirements.
  if (input.deliveryMethod === "delivery") {
    if (!input.shippingAddress?.trim()) {
      return err(400, "SHIPPING_ADDRESS_REQUIRED", "shippingAddress is required for delivery");
    }
  } else {
    if (!input.pickupPointId) {
      return err(400, "PICKUP_POINT_REQUIRED", "pickupPointId is required for recojo");
    }
    const pickup = await getActivePickupPoint(input.pickupPointId);
    if (!pickup) {
      return err(400, "PICKUP_POINT_INVALID", "pickupPointId is not a valid active pickup point");
    }
  }

  const cart = await getCartForCheckout(userId);
  if (!cart || cart.lines.length === 0) {
    return err(409, "EMPTY_CART", "Cart is empty");
  }

  // Validate stock but do NOT decrement — decrement happens at payment approval (fase 5).
  for (const line of cart.lines) {
    if (!line.active) {
      return err(409, "OUT_OF_STOCK", `Variant ${line.variantId} is no longer available`);
    }
    if (line.stock < line.quantity) {
      return err(409, "OUT_OF_STOCK", `Insufficient stock for SKU ${line.sku}`);
    }
  }

  // Totals are computed server-side — the client never supplies amounts (planeación §5.2).
  const subtotalCents = cart.lines.reduce(
    (sum, line) => sum + toCents(line.unitPrice) * line.quantity,
    0,
  );
  const shippingCents = await getShippingCostCents(input.deliveryMethod, subtotalCents);

  let discountCents = 0;
  let couponId: string | null = null;
  let couponCode: string | null = null;
  if (input.couponCode) {
    const validation = await validateCoupon(input.couponCode, subtotalCents);
    if (!validation.ok) return err(422, validation.error, "Coupon is not valid");
    discountCents = validation.discountCents;
    couponId = validation.coupon.id;
    couponCode = validation.coupon.code;
  }
  const totalCents = subtotalCents + shippingCents - discountCents;

  try {
    const order = await db.transaction(async (tx) => {
      // Atomic coupon consumption. ponytail: use-count is bumped here at creation; refunding
      // a coupon when an order is later rejected is deferred to fase 5 if it ever matters.
      if (couponId) {
        const consumed = await tryConsumeCoupon(tx, couponId);
        if (!consumed) throw new CouponRaceError();
      }

      const inserted = await insertOrder(tx, {
        userId,
        deliveryMethod: input.deliveryMethod,
        pickupPointId: input.deliveryMethod === "recojo" ? input.pickupPointId! : null,
        shippingAddress:
          input.deliveryMethod === "delivery" ? input.shippingAddress!.trim() : null,
        shippingCost: fromCents(shippingCents),
        subtotal: fromCents(subtotalCents),
        discountAmount: fromCents(discountCents),
        total: fromCents(totalCents),
        couponId,
        couponCode,
        idempotencyKey: input.idempotencyKey ?? null,
      });

      await insertOrderItems(
        tx,
        cart.lines.map((line) => ({
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

      if (couponId) await insertRedemption(tx, couponId, inserted.id, userId);
      await clearCartItems(tx, cart.cartId);
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
  filters: { deliveryMethod?: Order["deliveryMethod"]; status?: NonNullable<Order["fulfillmentStatus"]> },
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
