import { db, consents, type Consent, type InsertConsent } from "@workspace/db";

// Append-only by design: there is no update or delete here. Withdrawing consent inserts a new
// row with granted=false, because deleting the record would destroy the very evidence the law
// requires the business to be able to produce.
export async function insertConsent(values: InsertConsent): Promise<Consent> {
  const rows = await db.insert(consents).values(values).returning();
  return rows[0]!;
}
