import type { Order } from "@workspace/db";
import type { PaymentProvider } from "./types";
import { manualYapeProvider } from "./manual";

export type { PaymentProvider, SettlementOutcome } from "./types";

type PaymentMethod = Order["paymentMethod"];

// Registry keyed by the payment_method enum. The Record type is what makes this a seam rather
// than a lookup: adding a value to the enum in lib/db without registering a provider for it
// fails to compile here, so a payment method can never reach production with nothing behind it.
const PROVIDERS: Record<PaymentMethod, PaymentProvider> = {
  manual_yape: manualYapeProvider,
};

export function providerFor(method: PaymentMethod): PaymentProvider {
  return PROVIDERS[method];
}
