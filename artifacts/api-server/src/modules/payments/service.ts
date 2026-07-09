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
import {
  attachProofAndVerify,
  listVerificationQueue,
  approvePaymentTx,
  rejectPaymentTx,
} from "./queries";

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

  if (!canTransitionPayment(order.paymentStatus, "en_verificacion")) {
    return {
      ok: false,
      status: 409,
      code: "INVALID_STATE",
      message: `Order in state '${order.paymentStatus}' cannot accept a payment proof`,
    };
  }

  const updated = await attachProofAndVerify(orderId, path, amountReported);
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
