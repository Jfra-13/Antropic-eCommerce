import type {
  CheckoutQuote as QuoteDto,
  CheckoutQuoteInput,
  GuestCheckoutQuoteInput,
} from "@workspace/api-zod";
import { toCents, fromCents } from "../../lib/money";
import { getCartForCheckout, getLinesForItems, type CheckoutLine } from "../orders/queries";
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
  return quoteLines(cart?.lines ?? [], input);
}

// The same preview for a cart that lives in the guest's browser. The body names variants and
// quantities; prices still come from the catalogue.
export async function guestQuote(input: GuestCheckoutQuoteInput): Promise<QuoteResult> {
  const { lines, missing } = await getLinesForItems(input.items);
  if (missing) {
    return {
      ok: false,
      status: 409,
      code: "OUT_OF_STOCK",
      message: `Variant ${missing} is no longer available`,
    };
  }
  return quoteLines(lines, input);
}

async function quoteLines(
  lines: CheckoutLine[],
  input: Pick<CheckoutQuoteInput, "deliveryMethod" | "couponCode">,
): Promise<QuoteResult> {
  if (lines.length === 0) {
    return { ok: false, status: 409, code: "EMPTY_CART", message: "Cart is empty" };
  }

  const items = lines.map((line) => ({
    variantId: line.variantId,
    name: line.productName,
    variantLabel: `${line.size} / ${line.color}`,
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    lineTotal: fromCents(toCents(line.unitPrice) * line.quantity),
  }));

  const subtotalCents = lines.reduce(
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
