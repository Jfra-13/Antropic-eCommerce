import { db, wishlists, products, type Product } from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";

// Product ids the user has wishlisted, newest first.
export async function selectWishlistProductIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ productId: wishlists.productId })
    .from(wishlists)
    .where(eq(wishlists.userId, userId))
    .orderBy(desc(wishlists.createdAt));
  return rows.map((r) => r.productId);
}

// Only active products are returned — a wishlisted product that was soft-deleted
// simply drops out of the list.
export async function selectActiveProductsByIds(ids: string[]): Promise<Product[]> {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(products)
    .where(and(inArray(products.id, ids), eq(products.active, true)));
}

export async function isActiveProduct(productId: string): Promise<boolean> {
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.active, true)))
    .limit(1);
  return rows.length > 0;
}

export async function insertWishlist(userId: string, productId: string): Promise<void> {
  await db.insert(wishlists).values({ userId, productId }).onConflictDoNothing();
}

export async function deleteWishlist(userId: string, productId: string): Promise<void> {
  await db
    .delete(wishlists)
    .where(and(eq(wishlists.userId, userId), eq(wishlists.productId, productId)));
}
