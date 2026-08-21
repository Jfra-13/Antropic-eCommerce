import {
  db,
  orders,
  orderItems,
  paymentEvents,
  productVariants,
  type Order,
} from "@workspace/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { canTransitionPayment } from "../../lib/order-state";
import type { Tx } from "../../lib/tx";
import { providerFor } from "./providers";

type PaymentStatus = Order["paymentStatus"];
type PaymentMethod = Order["paymentMethod"];

// Who caused the settlement. The three are kept apart because the audit trail has to be able
// to answer "was this a decision, the customer, or nobody?" — and because only the first may
// be written to orders.approved_by, the money-audit column.
//   staff:    an employee or admin approving/rejecting a constancia.
//   customer: the buyer acting on their own order (attaching a constancia).
//   system:   a gateway webhook or this system's expiry job. There is genuinely no person
//             behind it, and recording none is more honest than inventing one.
export type SettlementActor =
  | { kind: "staff"; profileId: string }
  | { kind: "customer"; profileId: string }
  | { kind: "system" };

function actorProfileId(actor: SettlementActor): string | null {
  return actor.kind === "system" ? null : actor.profileId;
}

export type SettlementInput = {
  orderId: string;
  provider: PaymentMethod;
  to: PaymentStatus;
  actor: SettlementActor;
  event: {
    // The provider's own id for this delivery, or null when nothing external produced it.
    // See the duplicate-delivery note below for what this actually buys.
    eventId: string | null;
    type: string;
    // What the provider reported was paid. The webhook contract (docs/PAGOS.md) requires
    // contrasting these against the order before calling in here; they are stored so that
    // check is auditable later.
    amount?: string | null;
    currency?: string | null;
    payload?: unknown;
  };
  // Provider-owned write that must land in the same transaction and BEFORE the status change
  // — the manual flow's constancia row is the only user today. It runs after the transition
  // has been validated, so an illegal or duplicate move writes nothing at all.
  beforeSettle?: (tx: Tx, order: Order) => Promise<void>;
};

export type SettlementResult =
  | { kind: "ok"; order: Order; alreadySettled: boolean }
  | { kind: "not_found" }
  | { kind: "wrong_provider"; expected: PaymentMethod }
  | { kind: "invalid_state"; from: PaymentStatus }
  | { kind: "out_of_stock"; sku: string | null }
  | { kind: "duplicate_event" };

// Thrown to roll the settlement back when a variant lacks stock, so no partial decrements
// survive. Caught right outside the transaction and mapped to a result.
class OutOfStockError extends Error {
  constructor(public sku: string | null) {
    super("out_of_stock");
  }
}

// Thrown when the event insert hits payment_events_provider_event_idx: this exact provider
// event has been applied before.
class DuplicateEventError extends Error {}

// Postgres unique_violation (SQLSTATE 23505). The insert has to be allowed to fail rather than
// be preceded by a SELECT: checking first and inserting second is a race, the constraint is not.
//
// The cause chain is walked deliberately. Drizzle wraps driver errors in a DrizzleQueryError
// whose own `code` is undefined and hangs the pg error off `cause`, so reading `.code` on the
// caught value alone returns nothing and the guard silently never fires — which is exactly how
// this was found: the integration test below replayed an event, the index rejected it in
// Postgres, and the "duplicate" result never came back because the wrapper hid the code.
function isUniqueViolation(e: unknown): boolean {
  for (let cur = e, depth = 0; cur != null && depth < 5; depth++) {
    if (typeof cur === "object" && (cur as { code?: string }).code === "23505") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

// THE critical transaction (planeación §2.5, §5.4; auditoría §6.2). Everything that moves an
// order's payment status goes through here, whoever triggered it — a staff member approving a
// Yape constancia today, a gateway webhook tomorrow. It is deliberately provider-agnostic:
// what is specific to how the money arrived lives behind PaymentProvider.onSettled, which runs
// inside this same transaction.
//
// Four things happen atomically, and the atomicity is the feature:
//
//   1. The order row is locked FOR UPDATE, so two concurrent settlements of the same order
//      serialise. The loser wakes up, sees the status is already what it was asked to set, and
//      returns without doing the work twice.
//   2. On the way to `pagado`, every line's stock is decremented with a guarded conditional
//      UPDATE (stock >= qty). An oversell can never commit: the whole thing rolls back and the
//      caller is told which SKU was short.
//   3. A payment_events row is inserted. IN THIS TRANSACTION, never after it — see the table
//      comment in lib/db. Splitting them is what lets a retried webhook settle twice.
//   4. The provider's own bookkeeping runs (the manual provider closes the constancias).
//
// On duplicate deliveries, and why both guards exist: the status check in (1) catches the
// ordinary replay, where the order is already in the target state. It cannot catch the case
// where the order legitimately moved back to a state the stale event can act on again — a
// constancia moves the order to en_verificacion, staff reject it, and a re-delivery of the
// original event finds `rechazado`, from which en_verificacion is perfectly legal. That one
// would bounce the order back into the verification queue on an event from last week. The
// unique index on (provider, event_id) is what refuses it.
export async function settlePaymentTx(input: SettlementInput): Promise<SettlementResult> {
  const { orderId, provider, to, actor, event, beforeSettle } = input;
  try {
    return await db.transaction(async (tx): Promise<SettlementResult> => {
      const locked = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .for("update")
        .limit(1);
      const order = locked[0];
      if (!order) return { kind: "not_found" };

      // A settlement may only come from the provider that owns the order. Without this, a
      // webhook from a gateway the customer never used could close out a Yape order.
      if (order.paymentMethod !== provider) {
        return { kind: "wrong_provider", expected: order.paymentMethod };
      }

      // Idempotent no-op: already where we were asked to put it.
      if (order.paymentStatus === to) return { kind: "ok", order, alreadySettled: true };

      if (!canTransitionPayment(order.paymentStatus, to)) {
        return { kind: "invalid_state", from: order.paymentStatus };
      }

      const from = order.paymentStatus;
      const now = new Date();

      // The event goes in before any side effect, so a replayed delivery costs one failed
      // insert rather than a round of provider writes and stock updates to roll back.
      try {
        await tx.insert(paymentEvents).values({
          orderId,
          provider,
          eventId: event.eventId,
          type: event.type,
          fromStatus: from,
          toStatus: to,
          actorId: actorProfileId(actor),
          amount: event.amount ?? null,
          currency: event.currency ?? null,
          payload: event.payload ?? null,
        });
      } catch (e) {
        if (isUniqueViolation(e)) throw new DuplicateEventError();
        throw e;
      }

      if (beforeSettle) await beforeSettle(tx, order);

      // Stock moves on exactly one transition: into `pagado`. A refund does NOT restore it
      // here — putting returned goods back on the shelf is a decision about their condition,
      // which is the returns flow's call, not this transaction's.
      if (to === "pagado") {
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
              and(
                eq(productVariants.id, item.variantId),
                gte(productVariants.stock, item.quantity),
              ),
            )
            .returning({ id: productVariants.id });
          if (!decremented[0]) throw new OutOfStockError(item.sku);
        }
      }

      // `pagado` and `rechazado` are the two outcomes a person signs off on.
      const isDecision = to === "pagado" || to === "rechazado";

      // Fulfillment starts only when the money is in, and the track is implied by the delivery
      // method: a delivery order enters preparation, a recojo order waits at the pickup point.
      const fulfillmentStatus =
        to === "pagado"
          ? order.deliveryMethod === "delivery"
            ? ("en_preparacion" as const)
            : ("recojo_pendiente" as const)
          : order.fulfillmentStatus;

      const updated = await tx
        .update(orders)
        .set({
          paymentStatus: to,
          fulfillmentStatus,
          // The money-audit columns, written ONLY on a staff decision. A customer attaching a
          // constancia and an expiry job are not approvals, and stamping them here would put a
          // buyer's id in the column the business reads as "who released this order".
          // payment_events is the full history now; these two carry the latest decision.
          ...(isDecision && actor.kind === "staff"
            ? { approvedBy: actor.profileId, approvedAt: now }
            : {}),
        })
        .where(eq(orders.id, orderId))
        .returning();

      const settled = updated[0]!;
      await providerFor(provider).onSettled(tx, settled, { from, to, actor, at: now });

      return { kind: "ok", order: settled, alreadySettled: false };
    });
  } catch (e) {
    if (e instanceof OutOfStockError) return { kind: "out_of_stock", sku: e.sku };
    if (e instanceof DuplicateEventError) return { kind: "duplicate_event" };
    throw e;
  }
}
