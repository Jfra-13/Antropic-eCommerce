import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { products } from "./products";
import { timestamps, money } from "./helpers";

// Talla x Color combination. Stock lives here. DB CHECK is the last line of defense
// against oversell — app checks too, but the constraint is non-negotiable.
export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    size: text("size").notNull(),
    color: text("color").notNull(),
    sku: text("sku").notNull().unique(),
    stock: integer("stock").notNull().default(0),
    priceOverride: money("price_override"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("variants_product_idx").on(t.productId),
    uniqueIndex("variants_product_size_color_uq").on(t.productId, t.size, t.color),
    check("variants_stock_non_negative", sql`${t.stock} >= 0`),
  ],
);

export const insertProductVariantSchema = createInsertSchema(productVariants);
export type ProductVariant = typeof productVariants.$inferSelect;
export type InsertProductVariant = typeof productVariants.$inferInsert;
