import type { Order, ReturnTicket } from "@workspace/db";
import { logger } from "../../lib/logger";
import { sendEmail, adminNotificationEmail } from "../../lib/notify";
import { referenceCode } from "../orders/mappers";
import { getProfileEmail, pendingStockAlerts, markStockAlertsNotified } from "./queries";

// Every function here is fire-and-forget from the caller's view: wrapped so a notification
// failure can never bubble into a business flow. Callers use `void notifications.notifyX(...)`.

// Human-readable message per fulfillment state (customer-facing).
const FULFILLMENT_MESSAGE: Record<string, string> = {
  en_preparacion: "Estamos preparando tu pedido.",
  enviado: "Tu pedido fue enviado.",
  entregado: "Tu pedido fue entregado. ¡Gracias por tu compra!",
  recojo_pendiente: "Tu pedido está listo para recojo.",
  recogido: "Confirmamos el recojo de tu pedido. ¡Gracias!",
  cancelado: "Tu pedido fue cancelado.",
};

export async function notifyPaymentApproved(order: Order): Promise<void> {
  try {
    const to = await getProfileEmail(order.userId);
    if (!to) return;
    const ref = referenceCode(order.orderNumber);
    await sendEmail({
      to,
      subject: `Pago confirmado — pedido ${ref}`,
      html: `<p>¡Tu pago fue verificado! Confirmamos tu pedido <strong>${ref}</strong> por S/ ${order.total}.</p>
             <p>Te avisaremos cuando cambie de estado.</p>`,
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
    const message = FULFILLMENT_MESSAGE[status] ?? "El estado de tu pedido cambió.";
    await sendEmail({
      to,
      subject: `Actualización de tu pedido ${ref}`,
      html: `<p>${message}</p><p>Pedido <strong>${ref}</strong>.</p>`,
    });
  } catch (err) {
    logger.warn({ err, orderId: order.id }, "notifyOrderStatusChanged failed");
  }
}

export async function notifyAdminNewProof(order: Order): Promise<void> {
  try {
    const to = adminNotificationEmail();
    if (!to) return;
    const ref = referenceCode(order.orderNumber);
    await sendEmail({
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
    await sendEmail({
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
        sendEmail({
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
