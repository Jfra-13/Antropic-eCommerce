import { pgTable, uuid, text, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { timestamps } from "./helpers";

export const occasions = pgTable("occasions", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export const insertOccasionSchema = createInsertSchema(occasions);
export type Occasion = typeof occasions.$inferSelect;
export type InsertOccasion = typeof occasions.$inferInsert;
