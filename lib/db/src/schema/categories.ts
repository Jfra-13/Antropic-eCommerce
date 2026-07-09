import { pgTable, uuid, text, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { timestamps } from "./helpers";

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export const insertCategorySchema = createInsertSchema(categories);
export type Category = typeof categories.$inferSelect;
export type InsertCategory = typeof categories.$inferInsert;
