import type { CheckoutQuote as QuoteDto, CheckoutQuoteInput } from "@workspace/api-zod";
import { toCents, fromCents } from "../../lib/money";
import { getCartForCheckout } from "../orders/queries";
import { getShippingCostCents } from "../shipping/service";
import { validateCoupon } from "../coupons/service";

export type QuoteResult =
  | { ok: true; quote: QuoteDto }
  | { ok: false; status: number; code: string; message: string };

// Read-only preview of the same server-side totals order creation will compute. The client
// shows these; it never sends amounts. Coupon is validated but not consumed.
export async function quote(
  userId: string,
  input: CheckoutQuoteInput,
): Promise<QuoteResult> {
  const cart = await getCartForCheckout(userId);
  if (!cart || cart.lines.length === 0) {
    return { ok: false, status: 409, code: "EMPTY_CART", message: "Cart is empty" };
  }

  const items = cart.lines.map((line) => ({
    variantId: line.variantId,
    name: line.productName,
    variantLabel: `${line.size} / ${line.color}`,
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    lineTotal: fromCents(toCents(line.unitPrice) * line.quantity),
  }));

  const subtotalCents = cart.lines.reduce(
    (sum, line) => sum + toCents(line.unitPrice) * line.quantity,
    0,
  );
  const shippingCents = await getShippingCostCents(input.deliveryMethod, subtotalCents);

  let discountCents = 0;
  let couponCode: string | null = null;
  if (input.couponCode) {
    const validation = await validateCoupon(input.couponCode, subtotalCents);
    if (!validation.ok) {
      return { ok: false, status: 422, code: validation.error, message: "Coupon is not valid" };
    }
    discountCents = validation.discountCents;
    couponCode = validation.coupon.code;
  }
  const totalCents = subtotalCents + shippingCents - discountCents;

  return {
    ok: true,
    quote: {
      items,
      subtotal: fromCents(subtotalCents),
      shippingCost: fromCents(shippingCents),
      discountAmount: fromCents(discountCents),
      total: fromCents(totalCents),
      couponCode,
    },
  };
}
