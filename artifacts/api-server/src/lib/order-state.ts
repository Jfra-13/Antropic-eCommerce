import type { Order } from "@workspace/db";

type PaymentStatus = Order["paymentStatus"];

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
