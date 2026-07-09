import type { CartItem as CartItemDto } from "@workspace/api-zod";
import type { CartLine } from "./queries";

export function toCartItemDto(line: CartLine): CartItemDto {
  return {
    variantId: line.variantId,
    productId: line.productId,
    slug: line.slug,
    name: line.name,
    size: line.size,
    color: line.color,
    sku: line.sku,
    stock: line.stock,
    // Variant override wins; otherwise the base product price. Fixed-point string.
    unitPrice: line.priceOverride ?? line.price,
    quantity: line.quantity,
    image: line.image,
  };
}
