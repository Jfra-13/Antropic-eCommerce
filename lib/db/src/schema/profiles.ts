import { pgTable, uuid, text, boolean, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { roleEnum } from "./enums";
import { timestamps } from "./helpers";

// Extends Supabase auth.users. id equals auth.users.id but there is NO cross-schema
// FK: drizzle push only manages `public`. The profile row is bootstrapped lazily by
// the api-server auth middleware on first authenticated request.
//
// The missing FK is also what makes guest checkout cheap (auditoría §1.4): a guest profile is
// a row here with NO Supabase account behind it, so `orders.user_id` stays NOT NULL and every
// `innerJoin(profiles, …)` over orders keeps returning guest orders without being touched.
export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey(),
    email: text("email").notNull(),
    fullName: text("full_name"),
    phone: text("phone"),
    role: roleEnum("role").notNull().default("customer"),
    sizePreference: text("size_preference"),
    shippingAddress: text("shipping_address"),
    blocked: boolean("blocked").notNull().default(false),
    // True for the contact record behind a guest order: nobody can log in as this profile.
    // One per guest order, never reused across orders — see modules/orders/guest.ts for why
    // reusing it by email would let a stranger overwrite someone else's contact details.
    isGuest: boolean("is_guest").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    // Claiming guest orders on login looks guest profiles up by email. Partial, because
    // account profiles are never looked up this way.
    index("profiles_guest_email_idx")
      .on(sql`lower(${t.email})`)
      .where(sql`${t.isGuest}`),
  ],
);

export const insertProfileSchema = createInsertSchema(profiles);
export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = typeof profiles.$inferInsert;
