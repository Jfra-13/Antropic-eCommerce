import { db, profiles, products, productVariants, stockAlerts } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export async function getProfileEmail(userId: string): Promise<string | undefined> {
  const rows = await db
    .select({ email: profiles.email })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return rows[0]?.email;
}

export type PendingStockAlert = { email: string; productName: string; variantLabel: string };

// Pending "avísame" subscribers for a restocked variant, with product/variant labels for the email.
export async function pendingStockAlerts(variantId: string): Promise<PendingStockAlert[]> {
  const rows = await db
    .select({
      email: stockAlerts.email,
      productName: products.name,
      size: productVariants.size,
      color: productVariants.color,
    })
    .from(stockAlerts)
    .innerJoin(productVariants, eq(stockAlerts.variantId, productVariants.id))
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(and(eq(stockAlerts.variantId, variantId), eq(stockAlerts.status, "pending")));

  return rows.map((r) => ({
    email: r.email,
    productName: r.productName,
    variantLabel: `${r.size} · ${r.color}`,
  }));
}

// Flip a variant's pending alerts to notified so restocks don't re-spam on every stock edit.
export async function markStockAlertsNotified(variantId: string): Promise<void> {
  await db
    .update(stockAlerts)
    .set({ status: "notified", notifiedAt: new Date() })
    .where(and(eq(stockAlerts.variantId, variantId), eq(stockAlerts.status, "pending")));
}
