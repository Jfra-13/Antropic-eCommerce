import { pgEnum } from "drizzle-orm/pg-core";

// User roles. Authorization lives in Express middleware (see api-server), not RLS.
export const roleEnum = pgEnum("role", ["customer", "employee", "admin"]);

// Order payment lifecycle: pendiente_pago -> en_verificacion -> pagado | rechazado
export const paymentStatusEnum = pgEnum("payment_status", [
  "pendiente_pago",
  "en_verificacion",
  "pagado",
  "rechazado",
]);

// Order fulfillment lifecycle (set once payment is approved).
// delivery: en_preparacion -> enviado -> entregado
// recojo:   recojo_pendiente -> recogido
export const fulfillmentStatusEnum = pgEnum("fulfillment_status", [
  "en_preparacion",
  "enviado",
  "entregado",
  "recojo_pendiente",
  "recogido",
  "cancelado",
]);

export const deliveryMethodEnum = pgEnum("delivery_method", ["delivery", "recojo"]);

export const couponTypeEnum = pgEnum("coupon_type", ["percent", "fixed"]);

export const paymentProofStatusEnum = pgEnum("payment_proof_status", [
  "pendiente",
  "aprobado",
  "rechazado",
]);

export const returnStatusEnum = pgEnum("return_status", [
  "nueva",
  "en_proceso",
  "resuelta",
  "cerrada",
]);

export const stockAlertStatusEnum = pgEnum("stock_alert_status", ["pending", "notified"]);

export const mediaKindEnum = pgEnum("media_kind", ["image", "video"]);
