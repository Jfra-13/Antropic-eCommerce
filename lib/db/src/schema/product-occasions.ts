import { pgTable, uuid, primaryKey, index } from "drizzle-orm/pg-core";
import { products } from "./products";
import { occasions } from "./occasions";

// N:N products <-> occasions. A garment can be worn for several occasions
// (the storefront mega-menu and ?occasion= filter both expect multiple).
export const productOccasions = pgTable(
  "product_occasions",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    occasionId: uuid("occasion_id")
      .notNull()
      .references(() => occasions.id),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.occasionId] }),
    index("product_occasions_occasion_idx").on(t.occasionId),
  ],
);

export type ProductOccasion = typeof productOccasions.$inferSelect;
export type InsertProductOccasion = typeof productOccasions.$inferInsert;
