import { db, profiles, type Profile, type InsertProfile } from "@workspace/db";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

type Role = Profile["role"];

export async function listProfiles(
  role: Role | undefined,
  q: string | undefined,
  page: number,
  limit: number,
): Promise<{ rows: Profile[]; total: number }> {
  const conds: SQL[] = [];
  if (role) conds.push(eq(profiles.role, role));
  if (q) {
    const like = `%${q}%`;
    conds.push(or(ilike(profiles.email, like), ilike(profiles.fullName, like))!);
  }
  const where = conds.length ? and(...conds) : undefined;
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

export async function updateProfileRow(
  id: string,
  patch: Partial<InsertProfile>,
): Promise<Profile | undefined> {
  const rows = await db.update(profiles).set(patch).where(eq(profiles.id, id)).returning();
  return rows[0];
}
