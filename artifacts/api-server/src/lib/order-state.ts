import type { Order } from "@workspace/db";

type PaymentStatus = Order["paymentStatus"];
type FulfillmentStatus = NonNullable<Order["fulfillmentStatus"]>;

// Order payment state machine (planeación §5.1, auditoría §6.2). This map — not the enum in
// lib/db, which only lists the names — is the authority on which moves are legal.
//
// The manual Yape/Plin flow, which is the only one with code behind it today:
//   pendiente_pago -> en_verificacion -> pagado | rechazado, and rechazado back to
//   en_verificacion when the customer uploads a new constancia.
//
// The rest of the graph is declared ahead of the code that will drive it, so that adding a
// payment gateway is not also a schema change on two databases after the fork:
//   - `autorizado` is where a gateway that authorises first and captures later parks an order.
//     Its exits mirror what actually happens to an authorisation: captured (pagado), declined
//     or voided (rechazado), or left to lapse (expirado — card authorisations do expire).
//   - `expirado` closes an order nobody is going to pay. Terminal: reviving one would mean
//     re-checking stock and price at a moment nobody is watching, so a late payer is handled
//     by staff placing a new order rather than by a state change.
//   - `reembolsado` is the only exit from `pagado`, and refunds have no implementation yet.
//
// Two prohibitions are load-bearing and must survive any future edit:
//
//   1. NOTHING reaches `pagado` without passing through a state a human or a verified gateway
//      put it in. There is no edge from `pendiente_pago` to `pagado`. That single missing edge
//      is what stops an order being marked paid because someone said so.
//
//   2. `en_verificacion` HAS NO EXIT TO `expirado`. An order sitting in verification has a
//      constancia attached, which means the customer may well have sent real money. Expiring
//      it automatically would discard the evidence of a claim nobody reviewed. Orders in
//      verification are closed by a person approving or rejecting them, never by a timer.
const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pendiente_pago: ["en_verificacion", "autorizado", "expirado"],
  en_verificacion: ["pagado", "rechazado"],
  autorizado: ["pagado", "rechazado", "expirado"],
  // A rejected order is waiting on the customer exactly like an unpaid one, so it can be
  // retried with a new constancia or left to expire.
  rechazado: ["en_verificacion", "expirado"],
  pagado: ["reembolsado"],
  expirado: [],
  reembolsado: [],
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
