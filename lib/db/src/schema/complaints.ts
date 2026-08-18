import { pgTable, uuid, text, serial, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { orders } from "./orders";
import { profiles } from "./profiles";
import {
  complaintTypeEnum,
  complaintItemTypeEnum,
  complaintStatusEnum,
  documentTypeEnum,
} from "./enums";
import { timestamps, money } from "./helpers";

// Libro de Reclamaciones Virtual — Ley 29571, reglamentada por D.S. 011-2011-PCM y extendida
// a las plataformas digitales por la Ley 32495. Every column below exists because the Hoja de
// Reclamación is legally required to carry that field; none of it is product design.
//
// Three rules this table enforces, all of them legal rather than technical:
//
//   1. NO DELETES. Records are kept for two years. There is no delete endpoint and there must
//      never be one; `cerrado` is how a file ends, not removal.
//   2. NO ACCOUNT REQUIRED. userId is nullable on purpose. Making a consumer register before
//      they can complain would itself be an obstruction — the form is public.
//   3. PURPOSE LIMITATION. This data exists to handle the complaint. It must never be joined
//      into marketing lists or the CRM; consent for one is not consent for the other.
//
// The provider's own identity (razón social, RUC, domicilio) is NOT stored per row: it lives
// in the `business_identity` setting and is stamped onto the Hoja when it is rendered, so a
// change of address does not require rewriting history.
export const complaints = pgTable(
  "complaints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Correlativo único exigido por el reglamento. A serial gives a gap-free, ever-increasing
    // sequence; the human-facing code (LR-000001) is derived from it, never stored.
    complaintNumber: serial("complaint_number").notNull().unique(),

    // --- Identificación del consumidor ---
    consumerName: text("consumer_name").notNull(),
    consumerDocumentType: documentTypeEnum("consumer_document_type").notNull(),
    consumerDocumentNumber: text("consumer_document_number").notNull(),
    consumerEmail: text("consumer_email").notNull(),
    consumerPhone: text("consumer_phone"),
    consumerAddress: text("consumer_address"),
    // A minor cannot file on their own behalf; the parent or guardian is named instead.
    isMinor: boolean("is_minor").notNull().default(false),
    guardianName: text("guardian_name"),

    // --- Identificación del bien contratado ---
    itemType: complaintItemTypeEnum("item_type").notNull(),
    itemDescription: text("item_description").notNull(),
    itemAmount: money("item_amount"),
    // Optional link to an order. Nullable because a queja about how someone was treated may
    // have no order behind it at all.
    orderId: uuid("order_id").references(() => orders.id),
    // Set when the person filing happens to be logged in. Never required.
    userId: uuid("user_id").references(() => profiles.id),

    // --- Detalle de la reclamación ---
    type: complaintTypeEnum("type").notNull(),
    detail: text("detail").notNull(),
    // "Pedido del consumidor": what they are asking the business to do about it.
    request: text("request").notNull(),

    // --- Acciones adoptadas por el proveedor ---
    status: complaintStatusEnum("status").notNull().default("pendiente"),
    response: text("response"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    respondedBy: uuid("responded_by").references(() => profiles.id),
    // Legal deadline: 30 calendar days from filing. Stored rather than recomputed so the
    // backoffice can sort and filter by "what is about to go overdue" in one query, and so a
    // later change to the limit cannot silently rewrite the deadline of an existing file.
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),

    ...timestamps,
  },
  (t) => [
    // The backoffice board is "open complaints, soonest deadline first".
    index("complaints_status_due_idx").on(t.status, t.dueAt),
    // Consumers are told to quote their correlativo when following up.
    index("complaints_number_idx").on(t.complaintNumber),
  ],
);

export const insertComplaintSchema = createInsertSchema(complaints);
export type Complaint = typeof complaints.$inferSelect;
export type InsertComplaint = typeof complaints.$inferInsert;
