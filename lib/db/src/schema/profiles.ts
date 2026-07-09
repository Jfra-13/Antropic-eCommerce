import { pgTable, uuid, text, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { roleEnum } from "./enums";
import { timestamps } from "./helpers";

// Extends Supabase auth.users. id equals auth.users.id but there is NO cross-schema
// FK: drizzle push only manages `public`. The profile row is bootstrapped lazily by
// the api-server auth middleware on first authenticated request.
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  phone: text("phone"),
  role: roleEnum("role").notNull().default("customer"),
  sizePreference: text("size_preference"),
  shippingAddress: text("shipping_address"),
  blocked: boolean("blocked").notNull().default(false),
  ...timestamps,
});

export const insertProfileSchema = createInsertSchema(profiles);
export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = typeof profiles.$inferInsert;
