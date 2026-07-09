import type { Order as OrderDto, PaymentProofUploadUrl } from "@workspace/api-zod";
import { getOrderForUser } from "../orders/queries";
import { buildOrderDto } from "../orders/service";
import { canTransitionPayment } from "../../lib/order-state";
import { createProofUploadUrl } from "../../lib/storage";
import { attachProofAndVerify } from "./queries";

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
