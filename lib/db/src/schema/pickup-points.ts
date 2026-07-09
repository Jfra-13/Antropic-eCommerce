import { pgTable, uuid, text, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { timestamps } from "./helpers";

// Pickup points in La Molina (recojo, no shipping cost).
export const pickupPoints = pgTable("pickup_points", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const insertPickupPointSchema = createInsertSchema(pickupPoints);
export type PickupPoint = typeof pickupPoints.$inferSelect;
export type InsertPickupPoint = typeof pickupPoints.$inferInsert;
