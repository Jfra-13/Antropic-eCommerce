import { pgEnum } from "drizzle-orm/pg-core";

// User roles. Authorization lives in Express middleware (see api-server), not RLS.
export const roleEnum = pgEnum("role", ["customer", "employee", "admin"]);

// Order payment lifecycle. The manual Yape/Plin flow drives only the first four:
//   pendiente_pago -> en_verificacion -> pagado | rechazado
//
// The last three exist for payment methods this store does not have yet, and are deliberately
// declared before there is code that produces them (auditoría §6.2):
//   - `autorizado`: a gateway that authorises and captures in two steps parks the order here.
//   - `expirado`:   an abandoned order that was never paid. Reachable today via the expiry job.
//   - `reembolsado`: money returned. Refunds are not implemented; the state is reserved so the
//                    enum does not have to change once they are.
//
// Adding an enum value costs one migration today and two divergent databases after the fork
// (docs/CLONACION.md), which is the whole reason they land now rather than when they are used.
// The authoritative list of which transitions are legal is api-server's lib/order-state.ts —
// this enum only says which names exist.
export const paymentStatusEnum = pgEnum("payment_status", [
  "pendiente_pago",
  "en_verificacion",
  "pagado",
  "rechazado",
  "autorizado",
  "expirado",
  "reembolsado",
]);

// How an order is paid. One value today: the manual Yape/Plin constancia reviewed by a human.
// The column exists so that a second method can be added without any code having to infer,
// from the shape of an order, which flow owns it. See api-server modules/payments/providers.
export const paymentMethodEnum = pgEnum("payment_method", ["manual_yape"]);

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

// --- Notifications (auditoría §8.3) -----------------------------------------
// How a notification reaches its recipient. One value today: transactional email through
// Resend. The column exists so a second channel (WhatsApp is the obvious one for a Peruvian
// store) can be added without every query having to infer the channel from the message shape.
export const notificationChannelEnum = pgEnum("notification_channel", ["email"]);

// Delivery lifecycle of one outbox row.
//   pendiente -> enviado    the provider accepted it
//   pendiente -> fallido    every retry was used up, or the failure is not worth retrying
// `fallido` is not the end of the story: the backoffice can requeue a row, which puts it back
// to `pendiente`. That matters because the most common cause of a batch of failures is a
// configuration problem, and once it is fixed those messages should still go out.
export const notificationStatusEnum = pgEnum("notification_status", [
  "pendiente",
  "enviado",
  "fallido",
]);
