import {
  db,
  carts,
  cartItems,
  productVariants,
  products,
  productMedia,
  type Cart,
} from "@workspace/db";
import { and, asc, eq, inArray } from "drizzle-orm";

// One cart per user (carts.user_id is UNIQUE). Bootstrapped lazily on first access,
// mirroring the profile bootstrap in lib/auth.ts.
export async function getOrCreateCart(userId: string): Promise<Cart> {
  const existing = await db.select().from(carts).where(eq(carts.userId, userId)).limit(1);
  if (existing[0]) return existing[0];

  const inserted = await db
    .insert(carts)
    .values({ userId })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];

  // Lost the insert race with a concurrent request — read the winner's row.
  const again = await db.select().from(carts).where(eq(carts.userId, userId)).limit(1);
  if (!again[0]) throw new Error(`Cart for user ${userId} vanished after conflict`);
  return again[0];
}

export type CartLine = {
  variantId: string;
  quantity: number;
  size: string;
  color: string;
  sku: string;
  stock: number;
  priceOverride: string | null;
  productId: string;
  slug: string;
  name: string;
  price: string;
  image: string | null;
};

export async function selectCartLines(cartId: string): Promise<CartLine[]> {
  const rows = await db
    .select({
      variantId: cartItems.variantId,
      quantity: cartItems.quantity,
      size: productVariants.size,
      color: productVariants.color,
      sku: productVariants.sku,
      stock: productVariants.stock,
      priceOverride: productVariants.priceOverride,
      productId: products.id,
      slug: products.slug,
      name: products.name,
      price: products.price,
    })
    .from(cartItems)
    .innerJoin(productVariants, eq(cartItems.variantId, productVariants.id))
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(eq(cartItems.cartId, cartId))
    .orderBy(asc(cartItems.createdAt));

  const imageByProduct = await firstImageByProduct(rows.map((r) => r.productId));
  return rows.map((r) => ({ ...r, image: imageByProduct.get(r.productId) ?? null }));
}

// First media path per product (lowest sortOrder), for the cart line thumbnail.
async function firstImageByProduct(productIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return new Map();

  const media = await db
    .select({ productId: productMedia.productId, path: productMedia.storagePath })
    .from(productMedia)
    .where(inArray(productMedia.productId, ids))
    .orderBy(asc(productMedia.sortOrder));

  const map = new Map<string, string>();
  for (const m of media) if (!map.has(m.productId)) map.set(m.productId, m.path);
  return map;
}

export type VariantStock = { id: string; stock: number; active: boolean };

export async function getVariant(variantId: string): Promise<VariantStock | undefined> {
  const rows = await db
    .select({
      id: productVariants.id,
      stock: productVariants.stock,
      active: productVariants.active,
    })
    .from(productVariants)
    .where(eq(productVariants.id, variantId))
    .limit(1);
  return rows[0];
}

export async function getCartItemQuantity(
  cartId: string,
  variantId: string,
): Promise<number | undefined> {
  const rows = await db
    .select({ quantity: cartItems.quantity })
    .from(cartItems)
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)))
    .limit(1);
  return rows[0]?.quantity;
}

// Set the absolute quantity for a line (insert or overwrite via the unique index).
export async function upsertCartItem(
  cartId: string,
  variantId: string,
  quantity: number,
): Promise<void> {
  await db
    .insert(cartItems)
    .values({ cartId, variantId, quantity })
    .onConflictDoUpdate({
      target: [cartItems.cartId, cartItems.variantId],
      set: { quantity, updatedAt: new Date() },
    });
}

export async function deleteCartItem(cartId: string, variantId: string): Promise<void> {
  await db
    .delete(cartItems)
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)));
}
