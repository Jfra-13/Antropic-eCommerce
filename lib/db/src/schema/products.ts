import { pgTable, uuid, text, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { categories } from "./categories";
import { timestamps, money } from "./helpers";

// Base product. Soft delete via `active` (orders reference historical products).
// Occasions are N:N via product_occasions (a garment can suit several occasions).
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    fit: text("fit"),
    price: money("price").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    badge: text("badge"),
    featured: boolean("featured").notNull().default(false),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("products_category_idx").on(t.categoryId)],
);

export const insertProductSchema = createInsertSchema(products);
export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;
