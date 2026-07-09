import { pgTable, uuid, text, serial, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { orders } from "./orders";
import { profiles } from "./profiles";
import { returnStatusEnum } from "./enums";
import { timestamps } from "./helpers";

// Return request. Customer fills a web form -> ticket created -> notifies employee ->
// conversation continues on WhatsApp.
export const returnTickets = pgTable(
  "return_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketNumber: serial("ticket_number").notNull().unique(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id),
    reason: text("reason"),
    currentSize: text("current_size"),
    desiredSize: text("desired_size"),
    photoPath: text("photo_path"),
    status: returnStatusEnum("status").notNull().default("nueva"),
    ...timestamps,
  },
  (t) => [index("return_tickets_order_idx").on(t.orderId)],
);

export const insertReturnTicketSchema = createInsertSchema(returnTickets);
export type ReturnTicket = typeof returnTickets.$inferSelect;
export type InsertReturnTicket = typeof returnTickets.$inferInsert;
