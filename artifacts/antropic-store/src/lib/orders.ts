import type { Order, OrderListItem } from "@workspace/api-client-react";

type PaymentStatus = Order["paymentStatus"];
type FulfillmentStatus = NonNullable<Order["fulfillmentStatus"]>;

// Customer-facing wording. `autorizado` and `reembolsado` have no code producing them yet
// (they exist for a future gateway — see api-server lib/order-state.ts), but the map is
// exhaustive by type so that whoever wires that gateway is forced to decide what the customer
// reads, rather than discovering an empty heading in production.
const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pendiente_pago: "Pendiente de pago",
  en_verificacion: "Verificando tu pago",
  pagado: "Pago confirmado",
  rechazado: "Pago rechazado",
  autorizado: "Pago autorizado",
  expirado: "Pedido vencido",
  reembolsado: "Pago reembolsado",
};

const FULFILLMENT_LABELS: Record<FulfillmentStatus, string> = {
  en_preparacion: "En preparación",
  enviado: "Enviado",
  entregado: "Entregado",
  recojo_pendiente: "Listo para recojo",
  recogido: "Recogido",
  cancelado: "Cancelado",
};

export function paymentStatusLabel(status: PaymentStatus): string {
  return PAYMENT_LABELS[status];
}

export function fulfillmentStatusLabel(status: FulfillmentStatus): string {
  return FULFILLMENT_LABELS[status];
}

// One human status per order: fulfilment once paid, payment state otherwise.
export function orderStatusLabel(order: Pick<OrderListItem, "paymentStatus" | "fulfillmentStatus">): string {
  if (order.paymentStatus === "pagado" && order.fulfillmentStatus) {
    return fulfillmentStatusLabel(order.fulfillmentStatus);
  }
  return paymentStatusLabel(order.paymentStatus);
}
