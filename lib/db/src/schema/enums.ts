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

// --- Libro de Reclamaciones (D.S. 011-2011-PCM) -----------------------------
// The law draws a hard line between the two, and INDECOPI checks that the form does too:
// a `reclamo` disputes the product or service itself, a `queja` is about how the customer
// was treated. They are not interchangeable and are reported separately.
export const complaintTypeEnum = pgEnum("complaint_type", ["reclamo", "queja"]);

// What was bought. The Hoja de Reclamación must state which of the two it was.
export const complaintItemTypeEnum = pgEnum("complaint_item_type", ["producto", "servicio"]);

// Handling workflow. `resuelto` means the business answered; `cerrado` means the file is
// finished. Neither ever deletes the record — see the retention note on the table.
export const complaintStatusEnum = pgEnum("complaint_status", [
  "pendiente",
  "en_proceso",
  "resuelto",
  "cerrado",
]);

// Identity document of the consumer filing the complaint.
export const documentTypeEnum = pgEnum("document_type", ["dni", "ce", "pasaporte", "ruc"]);

// --- Consent (Ley 29733 + D.S. 016-2024-JUS) --------------------------------
// Consent must be granular: agreeing to have an order processed is NOT agreement to receive
// marketing, and the two can never share a checkbox. Each purpose is recorded on its own.
export const consentPurposeEnum = pgEnum("consent_purpose", [
  "pedido",
  "marketing",
  "cookies_analytics",
  "cookies_marketing",
]);
