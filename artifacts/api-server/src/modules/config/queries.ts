import {
  db,
  settings,
  pickupPoints,
  orders,
  type PickupPoint,
  type InsertPickupPoint,
} from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";

// --- Settings (key-value) ---

export async function getSetting(key: string): Promise<unknown> {
  const rows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  return rows[0]?.value;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

// --- Pickup points ---

export async function listPickupPoints(activeOnly: boolean): Promise<PickupPoint[]> {
  return db
    .select()
    .from(pickupPoints)
    .where(activeOnly ? eq(pickupPoints.active, true) : undefined)
    .orderBy(desc(pickupPoints.createdAt));
}

export async function insertPickupPoint(values: InsertPickupPoint): Promise<PickupPoint> {
  const rows = await db.insert(pickupPoints).values(values).returning();
  return rows[0]!;
}

export async function updatePickupPointRow(
  id: string,
  patch: Partial<InsertPickupPoint>,
): Promise<PickupPoint | undefined> {
  const rows = await db
    .update(pickupPoints)
    .set(patch)
    .where(eq(pickupPoints.id, id))
    .returning();
  return rows[0];
}

export async function getPickupPointById(id: string): Promise<PickupPoint | undefined> {
  const rows = await db.select().from(pickupPoints).where(eq(pickupPoints.id, id)).limit(1);
  return rows[0];
}

// True if any order references this pickup point — deletion would violate the FK.
export async function pickupPointReferenced(id: string): Promise<boolean> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(eq(orders.pickupPointId, id));
  return (rows[0]?.n ?? 0) > 0;
}

export async function deletePickupPointRow(id: string): Promise<boolean> {
  const rows = await db.delete(pickupPoints).where(eq(pickupPoints.id, id)).returning({ id: pickupPoints.id });
  return rows.length > 0;
}
