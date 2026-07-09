import { pgTable, uuid, text, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { products } from "./products";
import { mediaKindEnum } from "./enums";
import { timestamps } from "./helpers";

// Photos + lookbook videos. DB stores only the Supabase Storage path (public bucket
// for catalog); the file lives in Storage.
export const productMedia = pgTable(
  "product_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    kind: mediaKindEnum("kind").notNull().default("image"),
    storagePath: text("storage_path").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("media_product_idx").on(t.productId)],
);

export const insertProductMediaSchema = createInsertSchema(productMedia);
export type ProductMedia = typeof productMedia.$inferSelect;
export type InsertProductMedia = typeof productMedia.$inferInsert;
