import {
  db,
  paymentProofs,
  orders,
  orderItems,
  productVariants,
  profiles,
  type Order,
} from "@workspace/db";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { canTransitionPayment } from "../../lib/order-state";

// Attach a proof and move the order to verification in one transaction (two writes must not
// diverge). Returns the updated order row.
export async function attachProofAndVerify(
  orderId: string,
  storagePath: string,
  amountReported: string | null,
): Promise<Order> {
  return db.transaction(async (tx) => {
    await tx.insert(paymentProofs).values({ orderId, storagePath, amountReported });
    const rows = await tx
      .update(orders)
      .set({ paymentStatus: "en_verificacion" })
      .where(eq(orders.id, orderId))
      .returning();
    const order = rows[0];
    if (!order) throw new Error(`Order ${orderId} vanished during proof attach`);
    return order;
  });
}

export type VerificationQueueRow = {
  order: Order;
  customerEmail: string;
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
    .select({ order: orders, customerEmail: profiles.email })
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

// Thrown to roll back the approval transaction when a variant lacks stock (so no partial
// decrements survive). Caught right outside the transaction and mapped to a result.
class OutOfStockError extends Error {
  constructor(public sku: string | null) {
    super("out_of_stock");
  }
}

// THE critical transaction (planeación §2.5, §5.4). Approving a payment = transition to
// `pagado` + decrement stock of every order item, atomically. The order row is locked FOR
// UPDATE so two concurrent approvals of the same order serialize; the second sees `pagado`
// and returns without decrementing again (idempotent — approving twice never double-decrements).
// Each decrement is a guarded conditional UPDATE (stock >= qty), so an oversell can never
// commit — the whole transaction rolls back and the employee is told stock is insufficient.
export async function approvePaymentTx(orderId: string, adminId: string): Promise<ApproveResult> {
  try {
    return await db.transaction(async (tx): Promise<ApproveResult> => {
      const locked = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .for("update")
        .limit(1);
      const order = locked[0];
      if (!order) return { kind: "not_found" };
      if (order.paymentStatus === "pagado") return { kind: "ok", order };
      if (!canTransitionPayment(order.paymentStatus, "pagado")) {
        return { kind: "invalid_state", from: order.paymentStatus };
      }

      const items = await tx
        .select({
          variantId: orderItems.variantId,
          quantity: orderItems.quantity,
          sku: orderItems.sku,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));

      for (const item of items) {
        if (!item.variantId) continue; // variant deleted since purchase — nothing to decrement
        const decremented = await tx
          .update(productVariants)
          .set({ stock: sql`${productVariants.stock} - ${item.quantity}` })
          .where(
            and(eq(productVariants.id, item.variantId), gte(productVariants.stock, item.quantity)),
          )
          .returning({ id: productVariants.id });
        if (!decremented[0]) throw new OutOfStockError(item.sku);
      }

      const fulfillmentStatus =
        order.deliveryMethod === "delivery" ? "en_preparacion" : "recojo_pendiente";
      const now = new Date();
      const updated = await tx
        .update(orders)
        .set({ paymentStatus: "pagado", fulfillmentStatus, approvedBy: adminId, approvedAt: now })
        .where(eq(orders.id, orderId))
        .returning();

      await tx
        .update(paymentProofs)
        .set({ status: "aprobado", reviewedBy: adminId, reviewedAt: now })
        .where(and(eq(paymentProofs.orderId, orderId), eq(paymentProofs.status, "pendiente")));

      return { kind: "ok", order: updated[0]! };
    });
  } catch (e) {
    if (e instanceof OutOfStockError) return { kind: "out_of_stock", sku: e.sku };
    throw e;
  }
}

export type RejectResult =
  | { kind: "ok"; order: Order }
  | { kind: "not_found" }
  | { kind: "invalid_state"; from: Order["paymentStatus"] };

// Reject a payment: order -> rechazado, proofs -> rechazado. No stock touched. Idempotent.
export async function rejectPaymentTx(orderId: string, adminId: string): Promise<RejectResult> {
  return db.transaction(async (tx): Promise<RejectResult> => {
    const locked = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .for("update")
      .limit(1);
    const order = locked[0];
    if (!order) return { kind: "not_found" };
    if (order.paymentStatus === "rechazado") return { kind: "ok", order };
    if (!canTransitionPayment(order.paymentStatus, "rechazado")) {
      return { kind: "invalid_state", from: order.paymentStatus };
    }

    const now = new Date();
    const updated = await tx
      .update(orders)
      .set({ paymentStatus: "rechazado", approvedBy: adminId, approvedAt: now })
      .where(eq(orders.id, orderId))
      .returning();

    await tx
      .update(paymentProofs)
      .set({ status: "rechazado", reviewedBy: adminId, reviewedAt: now })
      .where(and(eq(paymentProofs.orderId, orderId), eq(paymentProofs.status, "pendiente")));

    return { kind: "ok", order: updated[0]! };
  });
}
