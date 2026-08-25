import type { Order, ReturnTicket, Complaint, NotificationDelivery } from "@workspace/db";
import type { NotificationDelivery as NotificationDeliveryRecord } from "@workspace/api-zod";
import { logger } from "../../lib/logger";
import { adminNotificationEmail } from "../../lib/notify";
import { enqueueEmail } from "./outbox";
import { referenceCode } from "../orders/mappers";
import { getOrderItems } from "../orders/queries";
import { orderEmailHtml, complaintEmailHtml } from "./templates";
import { complaintCode } from "../complaints/mappers";
import { getBusinessIdentity } from "../config/service";
import {
  getProfileEmail,
  pendingStockAlerts,
  markStockAlertsNotified,
  listDeliveries,
  requeueDelivery,
} from "./queries";

// Every function here is fire-and-forget from the caller's view: wrapped so a notification
// failure can never bubble into a business flow. Callers use `void notifications.notifyX(...)`.
//
// What changed in the observability phase: composing a message and DELIVERING it are now
// separate. These functions decide who gets told what; `enqueueEmail` writes the message to
// the outbox and takes responsibility for getting it out, retries included. The `kind` string
// is what the backoffice groups by, so it names the notification, not the state that triggered
// it — "el correo de pago aprobado no salió" has to be answerable without reading this file.

// Customer-facing heading + body per fulfillment state.
const FULFILLMENT_COPY: Record<string, { heading: string; message: string }> = {
  en_preparacion: {
    heading: "Tu pedido está en preparación",
    message: "Tu pago fue verificado y ya estamos preparando tu pedido con mucho cariño.",
  },
  enviado: {
    heading: "¡Tu pedido va en camino!",
    message: "Tu pedido salió de nuestro local y está en camino a la dirección que nos diste.",
  },
  entregado: {
    heading: "Tu pedido fue entregado",
    message: "Gracias por confiar en nosotros. Esperamos que disfrutes tu compra — ¡vuelve pronto!",
  },
  recojo_pendiente: {
    heading: "Tu pedido está listo para recojo",
    message: "Puedes pasar a recogerlo en el punto que elegiste. Te esperamos.",
  },
  recogido: {
    heading: "Confirmamos el recojo de tu pedido",
    message: "Gracias por confiar en nosotros. Esperamos que disfrutes tu compra — ¡vuelve pronto!",
  },
  cancelado: {
    heading: "Tu pedido fue cancelado",
    message: "Si crees que es un error o quieres coordinar, responde este correo y te ayudamos.",
  },
};

export async function notifyPaymentApproved(order: Order): Promise<void> {
  try {
    const to = await getProfileEmail(order.userId);
    if (!to) return;
    const ref = referenceCode(order.orderNumber);
    const items = await getOrderItems(order.id);
    await enqueueEmail({
      kind: "payment_approved",
      relatedType: "order",
      relatedId: order.id,
      to,
      subject: `Pago confirmado — pedido ${ref}`,
      html: orderEmailHtml({
        heading: "¡Tu pago fue verificado!",
        message: "Confirmamos tu pago y tu pedido ya entró en proceso. Te avisaremos en cada paso.",
        order,
        items,
      }),
    });
  } catch (err) {
    logger.warn({ err, orderId: order.id }, "notifyPaymentApproved failed");
  }
}

export async function notifyOrderStatusChanged(order: Order): Promise<void> {
  try {
    const status = order.fulfillmentStatus;
    if (!status) return;
    const to = await getProfileEmail(order.userId);
    if (!to) return;
    const ref = referenceCode(order.orderNumber);
    const copy = FULFILLMENT_COPY[status] ?? {
      heading: "El estado de tu pedido cambió",
      message: "Entra a tu pedido para ver el detalle.",
    };
    const items = await getOrderItems(order.id);
    await enqueueEmail({
      kind: `fulfillment_${status}`,
      relatedType: "order",
      relatedId: order.id,
      to,
      subject: `${copy.heading} — pedido ${ref}`,
      html: orderEmailHtml({ heading: copy.heading, message: copy.message, order, items }),
    });
  } catch (err) {
    logger.warn({ err, orderId: order.id }, "notifyOrderStatusChanged failed");
  }
}

// Customer-facing confirmation that their constancia arrived and is being reviewed.
export async function notifyProofReceived(order: Order): Promise<void> {
  try {
    const to = await getProfileEmail(order.userId);
    if (!to) return;
    const ref = referenceCode(order.orderNumber);
    const items = await getOrderItems(order.id);
    await enqueueEmail({
      kind: "proof_received",
      relatedType: "order",
      relatedId: order.id,
      to,
      subject: `Recibimos tu constancia — pedido ${ref}`,
      html: orderEmailHtml({
        heading: "Recibimos tu constancia de pago",
        message:
          "Tu pago está en verificación. Te confirmaremos por este medio apenas nuestro equipo lo revise — normalmente toma unas horas.",
        order,
        items,
      }),
    });
  } catch (err) {
    logger.warn({ err, orderId: order.id }, "notifyProofReceived failed");
  }
}

export async function notifyAdminNewProof(order: Order): Promise<void> {
  try {
    const to = adminNotificationEmail();
    if (!to) return;
    const ref = referenceCode(order.orderNumber);
    await enqueueEmail({
      kind: "admin_new_proof",
      relatedType: "order",
      relatedId: order.id,
      to,
      subject: `Nueva constancia por verificar — ${ref}`,
      html: `<p>El pedido <strong>${ref}</strong> (S/ ${order.total}) subió una constancia de pago pendiente de verificación.</p>`,
    });
  } catch (err) {
    logger.warn({ err, orderId: order.id }, "notifyAdminNewProof failed");
  }
}

export async function notifyAdminNewReturn(ticket: ReturnTicket): Promise<void> {
  try {
    const to = adminNotificationEmail();
    if (!to) return;
    await enqueueEmail({
      kind: "admin_new_return",
      relatedType: "return",
      relatedId: ticket.id,
      to,
      subject: `Nueva solicitud de devolución #${ticket.ticketNumber}`,
      html: `<p>Se creó la solicitud de devolución <strong>#${ticket.ticketNumber}</strong>.</p>
             <p>Motivo: ${ticket.reason ?? "—"}</p>`,
    });
  } catch (err) {
    logger.warn({ err, ticketId: ticket.id }, "notifyAdminNewReturn failed");
  }
}

// Restock notification: emails every pending "avísame" subscriber for the variant, then marks
// them notified so a later stock edit doesn't re-send. No-op when there are no subscribers.
export async function notifyStockAvailable(variantId: string): Promise<void> {
  try {
    const alerts = await pendingStockAlerts(variantId);
    if (alerts.length === 0) return;
    await Promise.all(
      alerts.map((a) =>
        enqueueEmail({
          kind: "stock_available",
          relatedType: "variant",
          relatedId: variantId,
          to: a.email,
          subject: `¡${a.productName} está disponible de nuevo!`,
          html: `<p>La variante que esperabas (<strong>${a.variantLabel}</strong>) de <strong>${a.productName}</strong> volvió a tener stock.</p>
                 <p>Apúrate antes de que se agote otra vez.</p>`,
        }),
      ),
    );
    await markStockAlertsNotified(variantId);
  } catch (err) {
    logger.warn({ err, variantId }, "notifyStockAvailable failed");
  }
}

// --- Libro de Reclamaciones ---------------------------------------------------

// Sends the consumer their Hoja de Reclamación. The reglamento requires them to be left with a
// constancia of the filing, so this is the legally meaningful half of the flow — but it stays
// best-effort like every other notification: the complaint is already recorded, and a mail
// outage must never be able to undo that.
export async function notifyComplaintFiled(complaint: Complaint): Promise<void> {
  try {
    const business = await getBusinessIdentity();
    const code = complaintCode(complaint.complaintNumber);
    await enqueueEmail({
      kind: "complaint_filed",
      relatedType: "complaint",
      relatedId: complaint.id,
      to: complaint.consumerEmail,
      subject: `Registramos tu ${complaint.type} — ${code}`,
      html: complaintEmailHtml({
        heading: "Recibimos tu registro en el Libro de Reclamaciones",
        message:
          "Este correo es tu constancia. Guarda el código para cualquier seguimiento; te responderemos dentro del plazo legal.",
        code,
        complaint,
        business,
      }),
    });
  } catch (err) {
    logger.warn({ err, complaintId: complaint.id }, "notifyComplaintFiled failed");
  }
}

// Alerts the backoffice. A complaint nobody sees is a fine waiting to happen: the clock on the
// 30-day legal deadline starts whether or not anyone opened the panel.
export async function notifyAdminNewComplaint(complaint: Complaint): Promise<void> {
  try {
    const to = adminNotificationEmail();
    if (!to) return;
    const business = await getBusinessIdentity();
    const code = complaintCode(complaint.complaintNumber);
    await enqueueEmail({
      kind: "admin_new_complaint",
      relatedType: "complaint",
      relatedId: complaint.id,
      to,
      subject: `Nuevo ${complaint.type} en el Libro de Reclamaciones — ${code}`,
      html: complaintEmailHtml({
        heading: `Nuevo ${complaint.type} registrado`,
        message: "Tienes 30 días calendario desde la fecha de registro para responder.",
        code,
        complaint,
        business,
      }),
    });
  } catch (err) {
    logger.warn({ err, complaintId: complaint.id }, "notifyAdminNewComplaint failed");
  }
}

// Sends the provider's answer to the consumer. The response text is part of the legal record,
// so the mail reproduces the whole Hoja with the "acciones adoptadas" section filled in rather
// than just quoting the reply on its own.
export async function notifyComplaintAnswered(complaint: Complaint): Promise<void> {
  try {
    const business = await getBusinessIdentity();
    const code = complaintCode(complaint.complaintNumber);
    await enqueueEmail({
      kind: "complaint_answered",
      relatedType: "complaint",
      relatedId: complaint.id,
      to: complaint.consumerEmail,
      subject: `Respuesta a tu ${complaint.type} — ${code}`,
      html: complaintEmailHtml({
        heading: "Respondimos tu registro en el Libro de Reclamaciones",
        message: "Esta es la respuesta de nuestra parte. Si no resuelve tu caso, puedes responder este correo.",
        code,
        complaint,
        business,
      }),
    });
  } catch (err) {
    logger.warn({ err, complaintId: complaint.id }, "notifyComplaintAnswered failed");
  }
}

// --- Backoffice view of the outbox (auditoría §8.3) --------------------------

// Read side of the outbox. `bodyHtml` is dropped here rather than in the router: the rendered
// message contains the customer's name, address and order contents, and no screen in the panel
// needs it to answer "did this go out". Keeping the projection next to the mapping means a
// future field is opted IN, not accidentally exposed by a `select *`.
function toDeliveryRecord(row: NotificationDelivery): NotificationDeliveryRecord {
  return {
    id: row.id,
    channel: row.channel,
    kind: row.kind,
    recipient: row.recipient,
    subject: row.subject,
    relatedType: row.relatedType,
    relatedId: row.relatedId,
    status: row.status,
    attempts: row.attempts,
    lastError: row.lastError,
    nextAttemptAt: row.nextAttemptAt,
    sentAt: row.sentAt,
    createdAt: row.createdAt,
  };
}

export async function listDeliveryRecords(filter: {
  status?: "pendiente" | "enviado" | "fallido";
  relatedType?: string;
  relatedId?: string;
  limit?: number;
}): Promise<NotificationDeliveryRecord[]> {
  const rows = await listDeliveries({ ...filter, limit: filter.limit ?? 50 });
  return rows.map(toDeliveryRecord);
}

export async function requeueDeliveryRecord(
  id: string,
): Promise<NotificationDeliveryRecord | undefined> {
  const row = await requeueDelivery(id);
  return row ? toDeliveryRecord(row) : undefined;
}
