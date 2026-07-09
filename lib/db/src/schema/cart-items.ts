import { pgTable, uuid, integer, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { carts } from "./carts";
import { productVariants } from "./product-variants";
import { timestamps } from "./helpers";

export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    quantity: integer("quantity").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index("cart_items_cart_idx").on(t.cartId),
    uniqueIndex("cart_items_cart_variant_uq").on(t.cartId, t.variantId),
    check("cart_items_quantity_positive", sql`${t.quantity} > 0`),
  ],
);

export const insertCartItemSchema = createInsertSchema(cartItems);
export type CartItem = typeof cartItems.$inferSelect;
export type InsertCartItem = typeof cartItems.$inferInsert;
