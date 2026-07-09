import { pgTable, uuid, text, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { categories } from "./categories";
import { occasions } from "./occasions";
import { timestamps, money } from "./helpers";

// Base product. Soft delete via `active` (orders reference historical products).
// ponytail: single occasionId FK. If a product needs multiple occasions (front mock
// models occasion[]), add a product_occasions join table when Phase 2 needs it.
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    price: money("price").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    occasionId: uuid("occasion_id").references(() => occasions.id),
    badge: text("badge"),
    featured: boolean("featured").notNull().default(false),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("products_category_idx").on(t.categoryId),
    index("products_occasion_idx").on(t.occasionId),
  ],
);

export const insertProductSchema = createInsertSchema(products);
export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;
