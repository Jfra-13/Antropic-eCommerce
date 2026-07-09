import { db, settings } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function getSetting(key: string): Promise<unknown> {
  const rows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  return rows[0]?.value;
}
