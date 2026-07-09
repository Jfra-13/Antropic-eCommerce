import { pgTable, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { profiles } from "./profiles";
import { timestamps } from "./helpers";

// One persisted cart per user. Guest carts live in localStorage and merge here on login.
export const carts = pgTable("carts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => profiles.id),
  ...timestamps,
});

export const insertCartSchema = createInsertSchema(carts);
export type Cart = typeof carts.$inferSelect;
export type InsertCart = typeof carts.$inferInsert;
