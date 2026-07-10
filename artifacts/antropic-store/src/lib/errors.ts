import { ApiError } from "@workspace/api-client-react";

// Business error codes the checkout flow can receive, translated for the customer.
const CODE_MESSAGES: Record<string, string> = {
  COUPON_NOT_FOUND: "El cupón no existe.",
  COUPON_INACTIVE: "El cupón no está activo.",
  COUPON_NOT_STARTED: "El cupón aún no está vigente.",
  COUPON_EXPIRED: "El cupón ya expiró.",
  COUPON_MIN_PURCHASE: "Tu compra no llega al monto mínimo del cupón.",
  COUPON_EXHAUSTED: "El cupón alcanzó su límite de usos.",
  OUT_OF_STOCK: "Un producto de tu carrito se quedó sin stock.",
  EMPTY_CART: "Tu carrito está vacío.",
  PICKUP_POINT_REQUIRED: "Elige un punto de recojo.",
  PICKUP_POINT_INVALID: "El punto de recojo ya no está disponible.",
  SHIPPING_ADDRESS_REQUIRED: "Ingresa una dirección de envío.",
  UNAUTHENTICATED: "Inicia sesión para continuar.",
  PROFILE_INCOMPLETE: "Completa tu nombre y teléfono para poder enviarte el pedido.",
  NOT_ELIGIBLE: "Solo puedes solicitar cambios de pedidos ya entregados o recogidos.",
  ALREADY_OPEN: "Ya tienes una solicitud abierta para este pedido.",
  IN_STOCK: "¡Esta variante ya tiene stock! Recarga la página.",
  EMAIL_REQUIRED: "Ingresa tu correo para avisarte.",
};

export function apiErrorCode(e: unknown): string | undefined {
  if (e instanceof ApiError && e.data && typeof e.data === "object" && "code" in e.data) {
    const code = (e.data as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

export function apiErrorMessage(e: unknown): string {
  const code = apiErrorCode(e);
  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code];
  if (e instanceof Error && e.message) return e.message;
  return "Algo salió mal. Inténtalo de nuevo.";
}
