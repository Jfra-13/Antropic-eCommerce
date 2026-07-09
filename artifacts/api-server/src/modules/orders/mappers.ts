import type {
  Order as OrderDto,
  OrderItem as OrderItemDto,
  OrderListItem as OrderListItemDto,
} from "@workspace/api-zod";
import type { Order, OrderItem, PaymentProof } from "@workspace/db";

// Yape match key, derived from the serial order number (planeación §5.5). Not stored.
export function referenceCode(orderNumber: number): string {
  return `ANT-${orderNumber}`;
}

export function toOrderItemDto(item: OrderItem): OrderItemDto {
  return {
    variantId: item.variantId,
    productName: item.productName,
    variantLabel: item.variantLabel,
    sku: item.sku,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    lineTotal: item.lineTotal,
  };
}

export function toOrderDto(
  order: Order,
  items: OrderItem[],
  paymentProofStatus: PaymentProof["status"] | null,
): OrderDto {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    referenceCode: referenceCode(order.orderNumber),
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    deliveryMethod: order.deliveryMethod,
    pickupPointId: order.pickupPointId,
    shippingAddress: order.shippingAddress,
    subtotal: order.subtotal,
    shippingCost: order.shippingCost,
    discountAmount: order.discountAmount,
    total: order.total,
    couponCode: order.couponCode,
    paymentProofStatus,
    createdAt: order.createdAt,
    items: items.map(toOrderItemDto),
  };
}

export function toOrderListItemDto(order: Order): OrderListItemDto {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    referenceCode: referenceCode(order.orderNumber),
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    deliveryMethod: order.deliveryMethod,
    total: order.total,
    createdAt: order.createdAt,
  };
}
