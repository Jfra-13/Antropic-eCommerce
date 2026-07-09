import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// Key-value config: delivery tariff, Yape number/QR path, banners, etc.
// jsonb value keeps it flexible — adding a setting needs no schema change.
// ponytail: KV over typed columns; promote to columns only if a setting needs querying.
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const insertSettingSchema = createInsertSchema(settings);
export type Setting = typeof settings.$inferSelect;
export type InsertSetting = typeof settings.$inferInsert;
