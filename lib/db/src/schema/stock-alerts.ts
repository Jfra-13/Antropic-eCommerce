import { pgTable, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { productVariants } from "./product-variants";
import { profiles } from "./profiles";
import { stockAlertStatusEnum } from "./enums";

// "Avísame cuando haya stock". When a variant is restocked, notify subscribers once
// and flip status to notified (don't re-spam on every stock update).
export const stockAlerts = pgTable(
  "stock_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    email: text("email").notNull(),
    userId: uuid("user_id").references(() => profiles.id),
    status: stockAlertStatusEnum("status").notNull().default("pending"),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("stock_alerts_variant_email_uq").on(t.variantId, t.email),
    index("stock_alerts_variant_idx").on(t.variantId),
  ],
);

export const insertStockAlertSchema = createInsertSchema(stockAlerts);
export type StockAlert = typeof stockAlerts.$inferSelect;
export type InsertStockAlert = typeof stockAlerts.$inferInsert;
