import { paymentProofs, type Order } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { Tx } from "../../../lib/tx";
import type { PaymentProvider, SettlementOutcome } from "./types";

// Manual Yape/Plin: the customer pays outside the platform, uploads the constancia, and a
// person contrasts it against the money actually received before the order is settled
// (auditoría §6.1). This is the only provider with an implementation today.
//
// Note what is NOT here: locking the order, checking the state machine, decrementing stock,
// writing the event. All of that is the same for any payment method and lives in
// settlement.ts. What remains is the one record only this method has — the constancia.
export const manualYapeProvider: PaymentProvider = {
  id: "manual_yape",

  async onSettled(tx: Tx, order: Order, outcome: SettlementOutcome): Promise<void> {
    // Mirror the order's outcome onto the constancias still awaiting review. Only `pendiente`
    // ones: a proof already reviewed keeps the verdict it was given, so the trail of "this
    // one was rejected, the next one was approved" survives.
    const proofStatus =
      outcome.to === "pagado" ? "aprobado" : outcome.to === "rechazado" ? "rechazado" : null;
    // Expiry and refund leave the constancias alone: an expired order never had one reviewed,
    // and a refund does not retroactively make the proof invalid.
    if (!proofStatus) return;

    await tx
      .update(paymentProofs)
      .set({
        status: proofStatus,
        reviewedBy: outcome.actor.kind === "staff" ? outcome.actor.profileId : null,
        reviewedAt: outcome.at,
      })
      .where(and(eq(paymentProofs.orderId, order.id), eq(paymentProofs.status, "pendiente")));
  },
};
