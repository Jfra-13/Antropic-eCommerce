import { pgTable, uuid, text, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { orders } from "./orders";
import { productVariants } from "./product-variants";
import { timestamps, money } from "./helpers";

// Price/name/variant are SNAPSHOTTED at purchase time. Never JOIN to the live product
// for historical orders — the product changes, the order does not. variantId is kept
// nullable-friendly (SET NULL semantics handled in app) so deleting a variant later
// doesn't destroy order history.
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    variantId: uuid("variant_id").references(() => productVariants.id),
    productName: text("product_name").notNull(),
    variantLabel: text("variant_label"),
    sku: text("sku"),
    unitPrice: money("unit_price").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotal: money("line_total").notNull(),
    ...timestamps,
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

export const insertOrderItemSchema = createInsertSchema(orderItems);
export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = typeof orderItems.$inferInsert;
