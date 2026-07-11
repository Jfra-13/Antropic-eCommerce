import type { Order, ReturnTicket } from "@workspace/db";
import { logger } from "../../lib/logger";
import { sendEmail, adminNotificationEmail } from "../../lib/notify";
import { referenceCode } from "../orders/mappers";
import { getOrderItems } from "../orders/queries";
import { orderEmailHtml } from "./templates";
import { getProfileEmail, pendingStockAlerts, markStockAlertsNotified } from "./queries";

// Every function here is fire-and-forget from the caller's view: wrapped so a notification
// failure can never bubble into a business flow. Callers use `void notifications.notifyX(...)`.

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
    await sendEmail({
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
    await sendEmail({
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
    await sendEmail({
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
