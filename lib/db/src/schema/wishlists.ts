import { pgTable, uuid, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { profiles } from "./profiles";
import { products } from "./products";

export const wishlists = pgTable(
  "wishlists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("wishlists_user_product_uq").on(t.userId, t.productId),
    index("wishlists_user_idx").on(t.userId),
  ],
);

export const insertWishlistSchema = createInsertSchema(wishlists);
export type Wishlist = typeof wishlists.$inferSelect;
export type InsertWishlist = typeof wishlists.$inferInsert;
