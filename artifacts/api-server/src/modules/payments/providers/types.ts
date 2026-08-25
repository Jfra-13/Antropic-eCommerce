import type { Order } from "@workspace/db";
import type { Tx } from "../../../lib/tx";
import type { SettlementActor } from "../settlement";

type PaymentStatus = Order["paymentStatus"];
type PaymentMethod = Order["paymentMethod"];

export type SettlementOutcome = {
  from: PaymentStatus;
  to: PaymentStatus;
  actor: SettlementActor;
  at: Date;
};

// The seam between "how this store takes money" and "what taking money does to an order"
// (auditoría §6.2). Everything that is true of every payment method — the state machine, the
// locked order row, the guarded stock decrement, the event row — lives in settlement.ts. What
// is left here is only what the core genuinely cannot know.
//
// The interface is small on purpose. It would be easy to write `authorize`, `capture`, `void`
// and `refund` now by copying a gateway's SDK, and every one of them would be a guess about a
// provider that has not been chosen: this store has no gateway, and the audit's scope decision
// (§0.2) is that it will not get one this cycle. Methods get added when there is a second
// implementation to prove they are the right shape. What matters today is that the manual
// constancia flow is *an* implementation reached through a registry keyed by
// `orders.payment_method`, rather than the only path, wired straight into the transaction.
export interface PaymentProvider {
  readonly id: PaymentMethod;

  // Provider-owned bookkeeping, run INSIDE the settlement transaction so it commits or rolls
  // back with the status change. The manual provider closes the constancias here; a gateway
  // would record its capture id. It must not touch orders.payment_status or stock — those
  // belong to the core, and doing both in two places is how they drift apart.
  onSettled(tx: Tx, order: Order, outcome: SettlementOutcome): Promise<void>;
}
