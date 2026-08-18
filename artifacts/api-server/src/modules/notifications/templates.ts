import type { Order, OrderItem, Complaint } from "@workspace/db";
import type { BusinessIdentity } from "@workspace/api-zod";
import { referenceCode } from "../orders/mappers";
import { env } from "../../lib/env";

// Branded transactional email layout. Inline styles only — email clients ignore
// stylesheets. Money values are the order's fixed-point strings, never re-computed here.

const BRAND_COLOR = "#EA4C75";
const STORE_NAME = "Antropic";

// Public storefront URL for the "ver mi pedido" link; unset (dev) drops the button.
function storeBaseUrl(): string | undefined {
  return env.STORE_URL;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function itemsRows(items: OrderItem[]): string {
  return items
    .map(
      (i) => `
        <tr>
          <td style="padding:6px 0;color:#333;font-size:14px;">
            ${i.quantity}&times; ${escapeHtml(i.productName)}${
              i.variantLabel ? ` <span style="color:#888;font-size:12px;">(${escapeHtml(i.variantLabel)})</span>` : ""
            }
          </td>
          <td style="padding:6px 0;color:#333;font-size:14px;text-align:right;">S/ ${i.lineTotal}</td>
        </tr>`,
    )
    .join("");
}

function totalsRows(order: Order): string {
  const row = (label: string, value: string, bold = false) => `
    <tr>
      <td style="padding:4px 0;color:${bold ? "#111" : "#666"};font-size:${bold ? "16px" : "13px"};${bold ? "font-weight:bold;" : ""}">${label}</td>
      <td style="padding:4px 0;color:${bold ? "#111" : "#666"};font-size:${bold ? "16px" : "13px"};text-align:right;${bold ? "font-weight:bold;" : ""}">${value}</td>
    </tr>`;
  const discount =
    order.discountAmount !== "0.00" && order.discountAmount !== "0"
      ? row(`Descuento${order.couponCode ? ` (${escapeHtml(order.couponCode)})` : ""}`, `-S/ ${order.discountAmount}`)
      : "";
  const shipping = row("Envío", order.shippingCost === "0.00" ? "Gratis" : `S/ ${order.shippingCost}`);
  return row("Subtotal", `S/ ${order.subtotal}`) + discount + shipping + row("Total", `S/ ${order.total}`, true);
}

export type OrderEmailInput = {
  heading: string;
  message: string;
  order: Order;
  items: OrderItem[];
};

// Full branded order email: header, status message, item summary, totals, CTA link.
export function orderEmailHtml({ heading, message, order, items }: OrderEmailInput): string {
  const ref = referenceCode(order.orderNumber);
  const base = storeBaseUrl();
  const cta = base
    ? `<tr><td style="padding:24px 0 0;text-align:center;">
         <a href="${base}/orders/${order.id}"
            style="display:inline-block;background:${BRAND_COLOR};color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 28px;">
           Ver mi pedido
         </a>
       </td></tr>`
    : "";

  return `
  <div style="background:#f6f6f6;padding:24px 8px;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-collapse:collapse;">
      <tr>
        <td style="background:${BRAND_COLOR};padding:20px 28px;">
          <span style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;">${STORE_NAME}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:28px;">
          <h1 style="margin:0 0 8px;color:#111;font-size:20px;">${escapeHtml(heading)}</h1>
          <p style="margin:0 0 4px;color:#555;font-size:14px;line-height:1.5;">${escapeHtml(message)}</p>
          <p style="margin:0 0 20px;color:#888;font-size:13px;">
            Pedido <strong style="color:#333;">${ref}</strong>
          </p>
          <table role="presentation" width="100%" style="border-collapse:collapse;border-top:1px solid #eee;">
            ${itemsRows(items)}
          </table>
          <table role="presentation" width="100%" style="border-collapse:collapse;border-top:1px solid #eee;margin-top:8px;padding-top:8px;">
            ${totalsRows(order)}
            ${cta}
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 28px;border-top:1px solid #eee;">
          <p style="margin:0;color:#aaa;font-size:12px;">
            ${STORE_NAME} · Gracias por confiar en nosotros. Si tienes dudas, responde este correo.
          </p>
        </td>
      </tr>
    </table>
  </div>`;
}

// --- Libro de Reclamaciones ---------------------------------------------------

const DOCUMENT_LABELS: Record<string, string> = {
  dni: "DNI",
  ce: "Carné de extranjería",
  pasaporte: "Pasaporte",
  ruc: "RUC",
};

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Lima",
  }).format(d);
}

function row(label: string, value: string | null | undefined): string {
  if (!value) return "";
  return `<tr>
    <td style="padding:6px 0;color:#888;font-size:12px;width:42%;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:6px 0;color:#333;font-size:13px;vertical-align:top;">${escapeHtml(value)}</td>
  </tr>`;
}

export type ComplaintEmailInput = {
  heading: string;
  message: string;
  code: string;
  complaint: Complaint;
  business: BusinessIdentity;
};

// The Hoja de Reclamación itself. This is not a courtesy notification: the reglamento requires
// the consumer to be left with a constancia of what they filed, so the email reproduces every
// field of the form plus the provider's identity and the legal deadline. Anything dropped here
// is a field missing from the legal record.
export function complaintEmailHtml({
  heading,
  message,
  code,
  complaint,
  business,
}: ComplaintEmailInput): string {
  const kind = complaint.type === "reclamo" ? "Reclamo" : "Queja";
  const kindNote =
    complaint.type === "reclamo"
      ? "Disconformidad relacionada con el producto o servicio."
      : "Malestar respecto de la atención recibida.";

  const provider = [
    row("Razón social", business.legalName),
    row("Nombre comercial", business.tradeName),
    row("RUC", business.ruc),
    row("Domicilio fiscal", business.fiscalAddress),
  ].join("");

  return `
  <div style="background:#f6f6f6;padding:24px 8px;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border-collapse:collapse;">
      <tr>
        <td style="background:${BRAND_COLOR};padding:20px 28px;">
          <span style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;">${STORE_NAME}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:28px;">
          <h1 style="margin:0 0 8px;color:#111;font-size:20px;">${escapeHtml(heading)}</h1>
          <p style="margin:0 0 16px;color:#555;font-size:14px;line-height:1.5;">${escapeHtml(message)}</p>
          <p style="margin:0 0 20px;padding:12px;background:#faf7f8;color:#333;font-size:14px;">
            Hoja de Reclamación <strong>${escapeHtml(code)}</strong><br>
            <span style="color:#888;font-size:12px;">Fecha de registro: ${formatDate(complaint.createdAt)}</span>
          </p>

          <h2 style="margin:20px 0 4px;color:#111;font-size:14px;">1. Identificación del proveedor</h2>
          <table role="presentation" width="100%" style="border-collapse:collapse;border-top:1px solid #eee;">
            ${provider || row("Proveedor", STORE_NAME)}
          </table>

          <h2 style="margin:20px 0 4px;color:#111;font-size:14px;">2. Identificación del consumidor</h2>
          <table role="presentation" width="100%" style="border-collapse:collapse;border-top:1px solid #eee;">
            ${row("Nombre", complaint.consumerName)}
            ${row(DOCUMENT_LABELS[complaint.consumerDocumentType] ?? "Documento", complaint.consumerDocumentNumber)}
            ${row("Correo", complaint.consumerEmail)}
            ${row("Teléfono", complaint.consumerPhone)}
            ${row("Domicilio", complaint.consumerAddress)}
            ${complaint.isMinor ? row("Padre, madre o tutor", complaint.guardianName) : ""}
          </table>

          <h2 style="margin:20px 0 4px;color:#111;font-size:14px;">3. Identificación del bien contratado</h2>
          <table role="presentation" width="100%" style="border-collapse:collapse;border-top:1px solid #eee;">
            ${row("Tipo", complaint.itemType === "producto" ? "Producto" : "Servicio")}
            ${row("Descripción", complaint.itemDescription)}
            ${row("Monto reclamado", complaint.itemAmount ? `S/ ${complaint.itemAmount}` : null)}
          </table>

          <h2 style="margin:20px 0 4px;color:#111;font-size:14px;">4. Detalle de la reclamación</h2>
          <table role="presentation" width="100%" style="border-collapse:collapse;border-top:1px solid #eee;">
            ${row("Tipo", `${kind} — ${kindNote}`)}
            ${row("Detalle", complaint.detail)}
            ${row("Pedido del consumidor", complaint.request)}
          </table>

          ${
            complaint.response
              ? `<h2 style="margin:20px 0 4px;color:#111;font-size:14px;">5. Acciones adoptadas por el proveedor</h2>
                 <table role="presentation" width="100%" style="border-collapse:collapse;border-top:1px solid #eee;">
                   ${row("Respuesta", complaint.response)}
                 </table>`
              : `<p style="margin:20px 0 0;color:#888;font-size:12px;line-height:1.6;">
                   El proveedor debe dar respuesta a más tardar el
                   <strong style="color:#333;">${formatDate(complaint.dueAt)}</strong>
                   (30 días calendario, D.S. 011-2011-PCM).
                 </p>`
          }
        </td>
      </tr>
      <tr>
        <td style="padding:16px 28px;border-top:1px solid #eee;">
          <p style="margin:0;color:#aaa;font-size:12px;line-height:1.6;">
            Conserva este correo como constancia de tu registro.
            La presentación de un reclamo no impide acudir a otras vías de solución de controversias
            ni constituye requisito previo para denunciar ante INDECOPI.
          </p>
        </td>
      </tr>
    </table>
  </div>`;
}
