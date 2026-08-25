import {
  db,
  paymentProofs,
  paymentEvents,
  orders,
  profiles,
  type Order,
} from "@workspace/db";
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { settlePaymentTx } from "./settlement";

export type AttachProofResult =
  | { kind: "ok"; order: Order }
  | { kind: "not_found" }
  | { kind: "invalid_state"; from: Order["paymentStatus"] };

// Attach a constancia and move the order into the verification queue.
//
// This runs through settlePaymentTx like every other payment-status move, which buys two
// things the hand-rolled transaction it replaced did not have: the state machine is now
// checked while holding the order lock rather than in the service beforehand (so two uploads
// racing each other can no longer both pass the check), and the upload lands in the order's
// payment_events history instead of being invisible until someone approved it.
export async function attachProofAndVerify(
  orderId: string,
  userId: string,
  storagePath: string,
  amountReported: string | null,
): Promise<AttachProofResult> {
  const result = await settlePaymentTx({
    orderId,
    provider: "manual_yape",
    to: "en_verificacion",
    actor: { kind: "customer", profileId: userId },
    event: { eventId: null, type: "proof_attached", amount: amountReported },
    // The proof row and the status change must not diverge, so the insert happens inside the
    // settlement transaction rather than next to it.
    beforeSettle: async (tx) => {
      await tx.insert(paymentProofs).values({ orderId, storagePath, amountReported });
    },
  });
  switch (result.kind) {
    case "ok":
      // `alreadySettled` means the order was ALREADY in verification, so the settlement was a
      // no-op and beforeSettle never ran — the constancia was not stored. Approving twice is
      // harmlessly idempotent; a second upload that silently vanishes is not, so this path
      // reports the conflict instead of a success the customer would believe.
      return result.alreadySettled
        ? { kind: "invalid_state", from: result.order.paymentStatus }
        : { kind: "ok", order: result.order };
    case "not_found":
      return { kind: "not_found" };
    case "invalid_state":
      return { kind: "invalid_state", from: result.from };
    case "out_of_stock":
    case "wrong_provider":
    case "duplicate_event":
      throw new Error(`Unreachable on the constancia upload path: ${result.kind}`);
  }
}

export type VerificationQueueRow = {
  order: Order;
  customerEmail: string;
  customerName: string | null;
  customerPhone: string | null;
  proofPath: string | null;
  amountReported: string | null;
};

// Orders awaiting verification, oldest first (FIFO — the employee works the oldest constancia).
// Latest proof per order is joined in a second batched query to keep the page query flat.
export async function listVerificationQueue(
  page: number,
  limit: number,
): Promise<{ rows: VerificationQueueRow[]; total: number }> {
  const offset = (page - 1) * limit;

  const orderRows = await db
    .select({
      order: orders,
      customerEmail: profiles.email,
      customerName: profiles.fullName,
      customerPhone: profiles.phone,
    })
    .from(orders)
    .innerJoin(profiles, eq(orders.userId, profiles.id))
    .where(eq(orders.paymentStatus, "en_verificacion"))
    .orderBy(asc(orders.createdAt))
    .limit(limit)
    .offset(offset);

  const counted = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(eq(orders.paymentStatus, "en_verificacion"));

  const orderIds = orderRows.map((r) => r.order.id);
  const latestProofByOrder = new Map<string, { path: string; amount: string | null }>();
  if (orderIds.length > 0) {
    // Latest proof per order via DISTINCT ON (orderId) ordered by createdAt desc.
    const proofs = await db
      .selectDistinctOn([paymentProofs.orderId], {
        orderId: paymentProofs.orderId,
        storagePath: paymentProofs.storagePath,
        amountReported: paymentProofs.amountReported,
      })
      .from(paymentProofs)
      .where(inArray(paymentProofs.orderId, orderIds))
      .orderBy(paymentProofs.orderId, desc(paymentProofs.createdAt));
    for (const p of proofs) {
      latestProofByOrder.set(p.orderId, { path: p.storagePath, amount: p.amountReported });
    }
  }

  const rows: VerificationQueueRow[] = orderRows.map((r) => {
    const proof = latestProofByOrder.get(r.order.id);
    return {
      order: r.order,
      customerEmail: r.customerEmail,
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      proofPath: proof?.path ?? null,
      amountReported: proof?.amount ?? null,
    };
  });
  return { rows, total: counted[0]?.count ?? 0 };
}

export type ApproveResult =
  | { kind: "ok"; order: Order }
  | { kind: "not_found" }
  | { kind: "invalid_state"; from: Order["paymentStatus"] }
  | { kind: "out_of_stock"; sku: string | null };

// Approve a Yape/Plin constancia: order -> pagado, stock decremented, fulfillment started.
//
// The transaction itself now lives in settlement.ts, shared with every other way an order can
// be settled; this is the manual provider's entry into it. Keeping the wrapper (rather than
// making callers build a SettlementInput) is what let the fase 6 refactor be proved by the
// existing stock.integration.test.ts passing untouched.
//
// `duplicate_event` and `wrong_provider` cannot happen on this path — a staff approval carries
// no external event id to replay, and the order's own provider is what routed us here — so
// they are folded into the states the backoffice already knows how to render.
export async function approvePaymentTx(orderId: string, adminId: string): Promise<ApproveResult> {
  const result = await settlePaymentTx({
    orderId,
    provider: "manual_yape",
    to: "pagado",
    actor: { kind: "staff", profileId: adminId },
    event: { eventId: null, type: "manual_approved" },
  });
  switch (result.kind) {
    case "ok":
      return { kind: "ok", order: result.order };
    case "not_found":
      return { kind: "not_found" };
    case "out_of_stock":
      return { kind: "out_of_stock", sku: result.sku };
    case "invalid_state":
      return { kind: "invalid_state", from: result.from };
    case "wrong_provider":
    case "duplicate_event":
      throw new Error(`Unreachable on the manual approval path: ${result.kind}`);
  }
}

export type RejectResult =
  | { kind: "ok"; order: Order }
  | { kind: "not_found" }
  | { kind: "invalid_state"; from: Order["paymentStatus"] };

// Reject a constancia: order -> rechazado, proofs -> rechazado. No stock touched. Idempotent.
export async function rejectPaymentTx(orderId: string, adminId: string): Promise<RejectResult> {
  const result = await settlePaymentTx({
    orderId,
    provider: "manual_yape",
    to: "rechazado",
    actor: { kind: "staff", profileId: adminId },
    event: { eventId: null, type: "manual_rejected" },
  });
  switch (result.kind) {
    case "ok":
      return { kind: "ok", order: result.order };
    case "not_found":
      return { kind: "not_found" };
    case "invalid_state":
      return { kind: "invalid_state", from: result.from };
    case "out_of_stock":
    case "wrong_provider":
    case "duplicate_event":
      throw new Error(`Unreachable on the manual rejection path: ${result.kind}`);
  }
}

// The order's payment history, oldest first — the audit trail §6.1 asked for and could not
// have, back when the only record was orders.approved_by being overwritten by each decision.
export async function listPaymentEvents(orderId: string): Promise<PaymentEventRow[]> {
  return db
    .select({
      id: paymentEvents.id,
      provider: paymentEvents.provider,
      type: paymentEvents.type,
      fromStatus: paymentEvents.fromStatus,
      toStatus: paymentEvents.toStatus,
      actorId: paymentEvents.actorId,
      actorName: profiles.fullName,
      actorEmail: profiles.email,
      amount: paymentEvents.amount,
      currency: paymentEvents.currency,
      createdAt: paymentEvents.createdAt,
    })
    .from(paymentEvents)
    .leftJoin(profiles, eq(paymentEvents.actorId, profiles.id))
    .where(eq(paymentEvents.orderId, orderId))
    .orderBy(asc(paymentEvents.createdAt));
}

export type PaymentEventRow = {
  id: string;
  provider: Order["paymentMethod"];
  type: string;
  fromStatus: Order["paymentStatus"] | null;
  toStatus: Order["paymentStatus"];
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  amount: string | null;
  currency: string | null;
  createdAt: Date;
};

// Orders abandoned before payment: never paid, never rejected-and-retried, and old enough that
// the customer is not coming back. Deliberately NOT including `en_verificacion` — see the
// prohibition in lib/order-state.ts: an order with a constancia under review may represent
// money that was actually sent, and no timer gets to close that.
export async function findExpirableOrders(
  olderThan: Date,
  limit: number,
): Promise<{ id: string; paymentMethod: Order["paymentMethod"] }[]> {
  return db
    .select({ id: orders.id, paymentMethod: orders.paymentMethod })
    .from(orders)
    .where(
      and(
        inArray(orders.paymentStatus, ["pendiente_pago", "rechazado"]),
        lt(orders.createdAt, olderThan),
      ),
    )
    .orderBy(asc(orders.createdAt))
    .limit(limit);
}
