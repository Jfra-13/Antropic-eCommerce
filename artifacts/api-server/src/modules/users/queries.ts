import { db, orders, profiles, type Profile, type InsertProfile } from "@workspace/db";
import { and, desc, eq, ilike, isNull, notInArray, or, sql, type SQL } from "drizzle-orm";

type Role = Profile["role"];

export async function listProfiles(
  role: Role | undefined,
  q: string | undefined,
  page: number,
  limit: number,
): Promise<{ rows: Profile[]; total: number }> {
  // Guest profiles are contact records behind guest orders, not accounts: nobody can log in as
  // one, so they have no place in a list staff use to manage access. Their orders are found
  // from the orders board.
  const conds: SQL[] = [eq(profiles.isGuest, false)];
  if (role) conds.push(eq(profiles.role, role));
  if (q) {
    const like = `%${q}%`;
    conds.push(or(ilike(profiles.email, like), ilike(profiles.fullName, like))!);
  }
  const where = and(...conds);
  const offset = (page - 1) * limit;

  const rows = await db
    .select()
    .from(profiles)
    .where(where)
    .orderBy(desc(profiles.createdAt))
    .limit(limit)
    .offset(offset);

  const counted = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(profiles)
    .where(where);

  return { rows, total: counted[0]?.count ?? 0 };
}

export async function insertProfile(values: InsertProfile): Promise<Profile> {
  const rows = await db.insert(profiles).values(values).returning();
  return rows[0]!;
}

export async function getProfileById(id: string): Promise<Profile | undefined> {
  const rows = await db.select().from(profiles).where(eq(profiles.id, id)).limit(1);
  return rows[0];
}

// Staff read a customer's contact from the snapshot on each order, so a corrected name or phone
// is copied onto the orders still in progress, in the same transaction. Delivered and picked-up
// orders keep what they had: that is the record returns and complaints are judged against.
export async function updateProfileRow(
  id: string,
  patch: Partial<InsertProfile>,
): Promise<Profile | undefined> {
  return db.transaction(async (tx) => {
    const rows = await tx.update(profiles).set(patch).where(eq(profiles.id, id)).returning();
    const contact: { contactName?: string | null; contactPhone?: string | null } = {};
    if (patch.fullName !== undefined) contact.contactName = patch.fullName;
    if (patch.phone !== undefined) contact.contactPhone = patch.phone;
    if (rows[0] && Object.keys(contact).length > 0) {
      await tx
        .update(orders)
        .set(contact)
        .where(
          and(
            eq(orders.userId, id),
            // fulfillment_status is null until payment is approved; NOT IN alone would skip it.
            or(
              isNull(orders.fulfillmentStatus),
              notInArray(orders.fulfillmentStatus, ["entregado", "recogido"]),
            ),
          ),
        );
    }
    return rows[0];
  });
}
