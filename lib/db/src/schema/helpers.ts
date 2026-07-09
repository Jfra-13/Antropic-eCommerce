import { numeric, timestamp } from "drizzle-orm/pg-core";

// Reusable created_at / updated_at pair. updated_at auto-bumps on UPDATE.
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
};

// Money column: fixed-point (10,2). pg numeric maps to string in JS on purpose —
// never do money math in float. Services parse to decimal.
export const money = (name: string) => numeric(name, { precision: 10, scale: 2 });
