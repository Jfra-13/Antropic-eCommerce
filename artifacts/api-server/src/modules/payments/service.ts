import type {
  Order as OrderDto,
  PaymentProofUploadUrl,
  PaymentVerificationQueue,
} from "@workspace/api-zod";
import { getOrderForUser } from "../orders/queries";
import { buildOrderDto } from "../orders/service";
import { referenceCode } from "../orders/mappers";
import { canTransitionPayment } from "../../lib/order-state";
import { createProofUploadUrl, createProofDownloadUrl } from "../../lib/storage";
import * as notifications from "../notifications/service";
import {
  attachProofAndVerify,
  listVerificationQueue,
  listPaymentEvents,
  findExpirableOrders,
  approvePaymentTx,
  rejectPaymentTx,
  type PaymentEventRow,
} from "./queries";
import { settlePaymentTx } from "./settlement";

export type UploadUrlResult =
  | { ok: true; upload: PaymentProofUploadUrl }
  | { ok: false; status: number; code: string; message: string };

export type AttachResult =
  | { ok: true; order: OrderDto }
  | { ok: false; status: number; code: string; message: string };

export async function createUploadUrl(
  userId: string,
  orderId: string,
): Promise<UploadUrlResult> {
  const order = await getOrderForUser(userId, orderId);
  if (!order) return { ok: false, status: 404, code: "NOT_FOUND", message: "Order not found" };

  const upload = await createProofUploadUrl(orderId);
  return { ok: true, upload };
}

export async function attachProof(
  userId: string,
  orderId: string,
  path: string,
  amountReported: string | null,
): Promise<AttachResult> {
  const order = await getOrderForUser(userId, orderId);
  if (!order) return { ok: false, status: 404, code: "NOT_FOUND", message: "Order not found" };

  // Cheap pre-check for a clear error message. The binding check is inside the transaction
  // (settlePaymentTx), which is what makes two simultaneous uploads safe rather than lucky.
  if (!canTransitionPayment(order.paymentStatus, "en_verificacion")) {
    return {
      ok: false,
      status: 409,
      code: "INVALID_STATE",
      message: `Order in state '${order.paymentStatus}' cannot accept a payment proof`,
    };
  }

  const result = await attachProofAndVerify(orderId, userId, path, amountReported);
  if (result.kind === "not_found") {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Order not found" };
  }
  if (result.kind === "invalid_state") {
    return {
      ok: false,
      status: 409,
      code: "INVALID_STATE",
      message: `Order in state '${result.from}' cannot accept a payment proof`,
    };
  }

  const updated = result.order;
  // Best-effort: alert the backoffice that a constancia is awaiting verification,
  // and confirm to the customer that it arrived.
  void notifications.notifyAdminNewProof(updated);
  void notifications.notifyProofReceived(updated);
  return { ok: true, order: await buildOrderDto(updated) };
}

// --- Backoffice: payment verification (planeación §5.1, §5.4; requerimientos §6.3) ---

export type AdminResult =
  | { ok: true; order: OrderDto }
  | { ok: false; status: number; code: string; message: string };

export async function getVerificationQueue(
  page: number,
  limit: number,
): Promise<PaymentVerificationQueue> {
  const { rows, total } = await listVerificationQueue(page, limit);
  // ponytail: signs one URL per queue row. Fine for a small pending queue; if it ever grows
  // to hundreds, drop proofUrl here and sign lazily on click via a dedicated endpoint.
  const items = await Promise.all(
    rows.map(async (r) => ({
      id: r.order.id,
      orderNumber: r.order.orderNumber,
      referenceCode: referenceCode(r.order.orderNumber),
      customerEmail: r.customerEmail,
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      deliveryMethod: r.order.deliveryMethod,
      total: r.order.total,
      amountReported: r.amountReported,
      proofUrl: r.proofPath ? await createProofDownloadUrl(r.proofPath) : null,
      createdAt: r.order.createdAt,
    })),
  );
  return { items, total, page, limit };
}

export async function approvePayment(orderId: string, adminId: string): Promise<AdminResult> {
  const result = await approvePaymentTx(orderId, adminId);
  switch (result.kind) {
    case "ok":
      // Best-effort: tell the customer their payment was confirmed.
      void notifications.notifyPaymentApproved(result.order);
      return { ok: true, order: await buildOrderDto(result.order) };
    case "not_found":
      return { ok: false, status: 404, code: "NOT_FOUND", message: "Order not found" };
    case "invalid_state":
      return {
        ok: false,
        status: 409,
        code: "INVALID_STATE",
        message: `Order in state '${result.from}' is not awaiting verification`,
      };
    case "out_of_stock":
      return {
        ok: false,
        status: 409,
        code: "OUT_OF_STOCK",
        message: result.sku
          ? `Insufficient stock for SKU ${result.sku} — cannot approve`
          : "Insufficient stock — cannot approve",
      };
  }
}

export async function rejectPayment(orderId: string, adminId: string): Promise<AdminResult> {
  const result = await rejectPaymentTx(orderId, adminId);
  switch (result.kind) {
    case "ok":
      return { ok: true, order: await buildOrderDto(result.order) };
    case "not_found":
      return { ok: false, status: 404, code: "NOT_FOUND", message: "Order not found" };
    case "invalid_state":
      return {
        ok: false,
        status: 409,
        code: "INVALID_STATE",
        message: `Order in state '${result.from}' is not awaiting verification`,
      };
  }
}

// --- Payment history (auditoría §6.1: "historial de cambios de estado con autor") ----------

export async function getPaymentEvents(orderId: string): Promise<PaymentEventRow[]> {
  return listPaymentEvents(orderId);
}

// --- Expiry of abandoned orders (auditoría §3.3, §6.1) -------------------------------------

// How long an unpaid order is held before it is written off. Generous on purpose: the customer
// has to leave the site, open Yape, pay, screenshot it and come back, and doing that the next
// morning is entirely normal behaviour for this store.
export const DEFAULT_EXPIRY_HOURS = 72;

// Cap per run, so a first run against a database with years of abandoned orders does bounded
// work instead of one enormous pass.
const EXPIRY_BATCH = 500;

export type ExpiryReport = { expired: number; skipped: number };

// Close orders nobody is going to pay. Each one is settled individually rather than in a bulk
// UPDATE: expiry is a payment-status change like any other, so it goes through the same locked
// transaction and leaves the same audit trail. A bulk statement would be faster and would
// silently bypass the state machine, the event history and the provider hook.
//
// Orders in `en_verificacion` are never touched — see the prohibition in lib/order-state.ts.
// Anything that races us into a state we may not leave (staff approving while the job runs) is
// counted as skipped, not retried: the human decision wins.
export async function expireAbandonedOrders(
  olderThanHours: number = DEFAULT_EXPIRY_HOURS,
): Promise<ExpiryReport> {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
  const candidates = await findExpirableOrders(cutoff, EXPIRY_BATCH);

  let expired = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    const result = await settlePaymentTx({
      orderId: candidate.id,
      // The order's own provider, not a constant: expiry is provider-agnostic and a hardcoded
      // "manual_yape" here would start refusing to expire orders the day a second one exists.
      provider: candidate.paymentMethod,
      to: "expirado",
      actor: { kind: "system" },
      event: { eventId: null, type: "expired_unpaid" },
    });
    if (result.kind === "ok" && !result.alreadySettled) expired += 1;
    else skipped += 1;
  }
  return { expired, skipped };
}
