import { pgTable, uuid, text, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { profiles } from "./profiles";
import { consentPurposeEnum } from "./enums";
import { timestamps } from "./helpers";

// Consent ledger — Ley 29733 and D.S. 016-2024-JUS.
//
// The reglamento requires consent to be "previo, informado, expreso y libre", and puts the
// burden of proving it on the business ("responsabilidad proactiva"). Proving it means being
// able to answer, for one person and one purpose: what exactly did they agree to, when, and
// from where. A boolean on the user row cannot answer that, so consent is append-only history.
//
// Design consequences:
//   - One row per purpose. Order processing and marketing can never share a checkbox, so they
//     can never share a record either.
//   - Withdrawal is a new row with granted=false, not an UPDATE. The right to withdraw is
//     meaningless if withdrawing erases the evidence that consent once existed.
//   - policyVersion pins WHICH text was accepted. "They agreed to the privacy policy" is not
//     a defence when the policy has been rewritten since.
//   - ipAddress and userAgent are themselves personal data, collected only because the law
//     asks for demonstrability. They are not for analytics and must not be used as such.
export const consents = pgTable(
  "consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Both nullable: a guest consenting to cookies has neither, and that is a valid record.
    userId: uuid("user_id").references(() => profiles.id),
    email: text("email"),
    purpose: consentPurposeEnum("purpose").notNull(),
    granted: boolean("granted").notNull(),
    policyVersion: text("policy_version").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (t) => [
    // "What is this person's current position on this purpose" = newest row for the pair.
    index("consents_user_purpose_idx").on(t.userId, t.purpose),
    index("consents_email_purpose_idx").on(t.email, t.purpose),
  ],
);

export const insertConsentSchema = createInsertSchema(consents);
export type Consent = typeof consents.$inferSelect;
export type InsertConsent = typeof consents.$inferInsert;
