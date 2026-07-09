import type { Order } from "@workspace/db";

type PaymentStatus = Order["paymentStatus"];
type FulfillmentStatus = NonNullable<Order["fulfillmentStatus"]>;

// Order payment state machine (planeación §5.1). The customer flow only drives the first
// hop (pendiente_pago -> en_verificacion, when a proof is attached). Approval/rejection
// (en_verificacion -> pagado | rechazado) lands in the backoffice (fase 5). A rejected
// order may re-enter verification when a new proof is uploaded.
const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pendiente_pago: ["en_verificacion"],
  en_verificacion: ["pagado", "rechazado"],
  rechazado: ["en_verificacion"],
  pagado: [],
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

// Order fulfillment state machine (planeación §5.1). Set once payment is approved: a delivery
// order starts at `en_preparacion`, a recojo order at `recojo_pendiente`. The from-state
// implies the track (delivery vs recojo), so the map alone keeps a delivery order out of the
// recojo states and vice versa. entregado/recogido/cancelado are terminal.
const FULFILLMENT_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  en_preparacion: ["enviado", "cancelado"],
  enviado: ["entregado"],
  entregado: [],
  recojo_pendiente: ["recogido", "cancelado"],
  recogido: [],
  cancelado: [],
};

export function canTransitionFulfillment(from: FulfillmentStatus, to: FulfillmentStatus): boolean {
  return FULFILLMENT_TRANSITIONS[from].includes(to);
}
