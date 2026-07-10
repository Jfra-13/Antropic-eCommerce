import {
  db,
  products,
  categories,
  occasions,
  productVariants,
  productMedia,
  productOccasions,
  stockAlerts,
  cartItems,
  wishlists,
  orderItems,
  type Category,
  type Occasion,
  type Product,
  type ProductVariant,
  type ProductMedia,
  type InsertProduct,
  type InsertProductVariant,
  type InsertProductMedia,
} from "@workspace/db";
import { and, asc, desc, eq, exists, ilike, inArray, sql } from "drizzle-orm";

export type ProductFilters = {
  page: number;
  limit: number;
  category?: string;
  occasion?: string;
  featured?: boolean;
  q?: string;
};

// Public default hides categories without active products (an orphan tile in the store's
// search/pills is worse than a missing one); the admin passes includeEmpty to see all.
export function selectCategories(includeEmpty: boolean): Promise<Category[]> {
  const conds = [eq(categories.active, true)];
  if (!includeEmpty) {
    conds.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(products)
          .where(and(eq(products.categoryId, categories.id), eq(products.active, true))),
      ),
    );
  }
  return db
    .select()
    .from(categories)
    .where(and(...conds))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

export function selectOccasions(): Promise<Occasion[]> {
  return db
    .select()
    .from(occasions)
    .where(eq(occasions.active, true))
    .orderBy(asc(occasions.sortOrder), asc(occasions.name));
}

// Resolve filter slugs to ids first (arrays only) so the main WHERE stays simple.
async function resolveFilters(f: ProductFilters) {
  const conds = [eq(products.active, true)];
  if (f.featured !== undefined) conds.push(eq(products.featured, f.featured));
  if (f.q) conds.push(ilike(products.name, `%${f.q}%`));

  if (f.category) {
    const cat = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, f.category))
      .limit(1);
    if (!cat[0]) return null; // unknown category → empty result
    conds.push(eq(products.categoryId, cat[0].id));
  }

  if (f.occasion) {
    const rows = await db
      .select({ pid: productOccasions.productId })
      .from(productOccasions)
      .innerJoin(occasions, eq(productOccasions.occasionId, occasions.id))
      .where(eq(occasions.slug, f.occasion));
    const ids = rows.map((r) => r.pid);
    if (ids.length === 0) return null;
    conds.push(inArray(products.id, ids));
  }

  return and(...conds);
}

export async function selectProducts(
  f: ProductFilters,
): Promise<{ rows: Product[]; total: number }> {
  const where = await resolveFilters(f);
  if (where === undefined || where === null) return { rows: [], total: 0 };

  const totalRow = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(where);

  const rows = await db
    .select()
    .from(products)
    .where(where)
    .orderBy(desc(products.featured), asc(products.name))
    .limit(f.limit)
    .offset((f.page - 1) * f.limit);

  return { rows, total: totalRow[0]?.count ?? 0 };
}

export async function selectProductBySlug(slug: string): Promise<Product | undefined> {
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.slug, slug), eq(products.active, true)))
    .limit(1);
  return rows[0];
}

// Batch-load related rows for a set of product ids. Keeps N+1 out of the mappers.
export async function loadRelations(rows: Product[]) {
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) {
    return {
      categoriesById: new Map<string, Category>(),
      variantsByProduct: new Map<string, ProductVariant[]>(),
      mediaByProduct: new Map<string, ProductMedia[]>(),
      occasionsByProduct: new Map<string, Occasion[]>(),
    };
  }

  const catIds = [...new Set(rows.map((r) => r.categoryId))];
  const cats = await db.select().from(categories).where(inArray(categories.id, catIds));

  const variants = await db
    .select()
    .from(productVariants)
    .where(and(inArray(productVariants.productId, ids), eq(productVariants.active, true)))
    .orderBy(asc(productVariants.size), asc(productVariants.color));

  const media = await db
    .select()
    .from(productMedia)
    .where(inArray(productMedia.productId, ids))
    .orderBy(asc(productMedia.sortOrder));

  const occ = await db
    .select({ pid: productOccasions.productId, occasion: occasions })
    .from(productOccasions)
    .innerJoin(occasions, eq(productOccasions.occasionId, occasions.id))
    .where(and(inArray(productOccasions.productId, ids), eq(occasions.active, true)))
    .orderBy(asc(occasions.sortOrder), asc(occasions.name));

  const categoriesById = new Map(cats.map((c) => [c.id, c]));
  const variantsByProduct = groupBy(variants, (v) => v.productId);
  const mediaByProduct = groupBy(media, (m) => m.productId);
  const occasionsByProduct = groupBy(
    occ.map((o) => ({ pid: o.pid, ...o.occasion })),
    (o) => o.pid,
  );

  return { categoriesById, variantsByProduct, mediaByProduct, occasionsByProduct };
}

export type ProductRelations = Awaited<ReturnType<typeof loadRelations>>;

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

// --- Admin inventory (writes + inactive-inclusive reads) ---

// Admin list: ALL products (active + inactive), optional name search.
export async function selectAdminProducts(
  q: string | undefined,
  page: number,
  limit: number,
): Promise<{ rows: Product[]; total: number }> {
  const where = q ? ilike(products.name, `%${q}%`) : undefined;

  const totalRow = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(where);

  const rows = await db
    .select()
    .from(products)
    .where(where)
    .orderBy(asc(products.name))
    .limit(limit)
    .offset((page - 1) * limit);

  return { rows, total: totalRow[0]?.count ?? 0 };
}

export type AdminProductRelations = {
  categoriesById: Map<string, Category>;
  variantsByProduct: Map<string, ProductVariant[]>;
  occasionsByProduct: Map<string, Occasion[]>;
  mediaByProduct: Map<string, ProductMedia[]>;
};

// Like loadRelations but WITHOUT the active filters — admins see inactive variants and all
// assigned occasions and media.
export async function loadAdminRelations(rows: Product[]): Promise<AdminProductRelations> {
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) {
    return {
      categoriesById: new Map(),
      variantsByProduct: new Map(),
      occasionsByProduct: new Map(),
      mediaByProduct: new Map(),
    };
  }

  const catIds = [...new Set(rows.map((r) => r.categoryId))];
  const cats = await db.select().from(categories).where(inArray(categories.id, catIds));

  const variants = await db
    .select()
    .from(productVariants)
    .where(inArray(productVariants.productId, ids))
    .orderBy(asc(productVariants.size), asc(productVariants.color));

  const media = await db
    .select()
    .from(productMedia)
    .where(inArray(productMedia.productId, ids))
    .orderBy(asc(productMedia.sortOrder));

  const occ = await db
    .select({ pid: productOccasions.productId, occasion: occasions })
    .from(productOccasions)
    .innerJoin(occasions, eq(productOccasions.occasionId, occasions.id))
    .where(inArray(productOccasions.productId, ids))
    .orderBy(asc(occasions.sortOrder), asc(occasions.name));

  const occasionsByProduct = new Map<string, Occasion[]>();
  for (const o of occ) {
    const bucket = occasionsByProduct.get(o.pid);
    if (bucket) bucket.push(o.occasion);
    else occasionsByProduct.set(o.pid, [o.occasion]);
  }

  return {
    categoriesById: new Map(cats.map((c) => [c.id, c])),
    variantsByProduct: groupBy(variants, (v) => v.productId),
    occasionsByProduct,
    mediaByProduct: groupBy(media, (m) => m.productId),
  };
}

export async function getAdminProductRow(id: string): Promise<Product | undefined> {
  const rows = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return rows[0];
}

// Create a product with its occasions and initial variants in one transaction.
export async function insertProductTx(
  values: InsertProduct,
  occasionIds: string[],
  variants: Omit<InsertProductVariant, "productId">[],
): Promise<Product> {
  return db.transaction(async (tx) => {
    const inserted = await tx.insert(products).values(values).returning();
    const product = inserted[0];
    if (!product) throw new Error("Product insert returned no row");

    if (occasionIds.length > 0) {
      await tx
        .insert(productOccasions)
        .values(occasionIds.map((occasionId) => ({ productId: product.id, occasionId })));
    }
    if (variants.length > 0) {
      await tx
        .insert(productVariants)
        .values(variants.map((v) => ({ ...v, productId: product.id })));
    }
    return product;
  });
}

// Update product fields; when occasionIds is provided, replace the occasion set. Slug is
// intentionally immutable (storefront URLs depend on it). Returns undefined if not found.
export async function updateProductTx(
  id: string,
  patch: Partial<Pick<InsertProduct, "name" | "price" | "categoryId" | "description" | "fit" | "badge" | "featured" | "active">>,
  occasionIds: string[] | undefined,
): Promise<Product | undefined> {
  return db.transaction(async (tx) => {
    let product: Product | undefined;
    if (Object.keys(patch).length > 0) {
      const updated = await tx.update(products).set(patch).where(eq(products.id, id)).returning();
      product = updated[0];
    } else {
      product = (await tx.select().from(products).where(eq(products.id, id)).limit(1))[0];
    }
    if (!product) return undefined;

    if (occasionIds) {
      await tx.delete(productOccasions).where(eq(productOccasions.productId, id));
      if (occasionIds.length > 0) {
        await tx
          .insert(productOccasions)
          .values(occasionIds.map((occasionId) => ({ productId: id, occasionId })));
      }
    }
    return product;
  });
}

// Current stock of a variant (to detect an out-of-stock -> in-stock transition).
export async function getVariantStock(id: string): Promise<number | undefined> {
  const rows = await db
    .select({ stock: productVariants.stock })
    .from(productVariants)
    .where(eq(productVariants.id, id))
    .limit(1);
  return rows[0]?.stock;
}

export async function productExists(id: string): Promise<boolean> {
  const rows = await db.select({ id: products.id }).from(products).where(eq(products.id, id)).limit(1);
  return rows.length > 0;
}

export async function insertVariant(values: InsertProductVariant): Promise<void> {
  await db.insert(productVariants).values(values);
}

export type ImportProductGroup = {
  product: {
    name: string;
    slug: string;
    price: string;
    categoryId: string;
    description: string | null;
  };
  variants: { size: string; color: string; sku: string; stock: number }[];
  occasionId: string | null;
};

// Upsert one product (by slug) and its variants (by SKU) in a transaction. Called once per
// product group during CSV import — a failure rolls back just that group (the caller records
// the group's rows as errors and continues with the rest).
export async function importProductGroup(group: ImportProductGroup): Promise<void> {
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(products)
      .values(group.product)
      .onConflictDoUpdate({
        target: products.slug,
        set: {
          name: group.product.name,
          price: group.product.price,
          categoryId: group.product.categoryId,
          description: group.product.description,
        },
      })
      .returning({ id: products.id });
    const productId = inserted[0]!.id;

    for (const v of group.variants) {
      await tx
        .insert(productVariants)
        .values({ productId, size: v.size, color: v.color, sku: v.sku, stock: v.stock })
        .onConflictDoUpdate({ target: productVariants.sku, set: { stock: v.stock } });
    }

    if (group.occasionId) {
      await tx
        .insert(productOccasions)
        .values({ productId, occasionId: group.occasionId })
        .onConflictDoNothing();
    }
  });
}

// Update a variant; returns the owning productId (to rebuild the product DTO) or undefined.
export async function updateVariantRow(
  id: string,
  patch: Partial<Pick<InsertProductVariant, "size" | "color" | "colorHex" | "sku" | "stock" | "priceOverride" | "active">>,
): Promise<string | undefined> {
  if (Object.keys(patch).length === 0) {
    const rows = await db
      .select({ productId: productVariants.productId })
      .from(productVariants)
      .where(eq(productVariants.id, id))
      .limit(1);
    return rows[0]?.productId;
  }
  const updated = await db
    .update(productVariants)
    .set(patch)
    .where(eq(productVariants.id, id))
    .returning({ productId: productVariants.productId });
  return updated[0]?.productId;
}

// --- Product media (photos + lookbook videos) ---

// Append a media item; sortOrder = max(existing) + 1 so it lands last in the gallery.
export async function insertProductMedia(
  values: Omit<InsertProductMedia, "sortOrder">,
): Promise<void> {
  const maxRow = await db
    .select({ max: sql<number | null>`max(${productMedia.sortOrder})` })
    .from(productMedia)
    .where(eq(productMedia.productId, values.productId));
  const nextSort = (maxRow[0]?.max ?? -1) + 1;
  await db.insert(productMedia).values({ ...values, sortOrder: nextSort });
}

// Delete a media item; returns the owning productId (to rebuild the DTO) or undefined.
export async function deleteProductMediaRow(id: string): Promise<string | undefined> {
  const deleted = await db
    .delete(productMedia)
    .where(eq(productMedia.id, id))
    .returning({ productId: productMedia.productId });
  return deleted[0]?.productId;
}

// --- Product deletion (round 3) ---

// True when any of the product's variants appears in order_items — order history and
// reports must never lose their product rows, so such products are deactivated instead.
export async function productHasSales(productId: string): Promise<boolean> {
  const rows = await db
    .select({ one: sql`1` })
    .from(orderItems)
    .innerJoin(productVariants, eq(orderItems.variantId, productVariants.id))
    .where(eq(productVariants.productId, productId))
    .limit(1);
  return rows.length > 0;
}

export type DeleteProductRow = { deleted: boolean; mediaPaths: string[] };

// Hard-delete a never-sold product and every dependent row. Returns the media storage
// paths so the caller can best-effort clean the bucket AFTER the commit (a Storage
// failure must not roll back the DB delete).
export async function deleteProductTx(productId: string): Promise<DeleteProductRow> {
  return db.transaction(async (tx) => {
    const media = await tx
      .select({ path: productMedia.storagePath })
      .from(productMedia)
      .where(eq(productMedia.productId, productId));

    const variantIds = (
      await tx
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(eq(productVariants.productId, productId))
    ).map((v) => v.id);

    if (variantIds.length > 0) {
      await tx.delete(stockAlerts).where(inArray(stockAlerts.variantId, variantIds));
      await tx.delete(cartItems).where(inArray(cartItems.variantId, variantIds));
    }
    await tx.delete(wishlists).where(eq(wishlists.productId, productId));
    await tx.delete(productOccasions).where(eq(productOccasions.productId, productId));
    await tx.delete(productMedia).where(eq(productMedia.productId, productId));
    await tx.delete(productVariants).where(eq(productVariants.productId, productId));
    const deleted = await tx
      .delete(products)
      .where(eq(products.id, productId))
      .returning({ id: products.id });

    return { deleted: deleted.length > 0, mediaPaths: media.map((m) => m.path) };
  });
}

// --- Stock alerts ("avísame cuando haya stock") ---

export async function getVariantForAlert(
  id: string,
): Promise<{ stock: number } | undefined> {
  const rows = await db
    .select({ stock: productVariants.stock })
    .from(productVariants)
    .where(eq(productVariants.id, id))
    .limit(1);
  return rows[0];
}

// Idempotent by the (variantId, email) unique index — resubscribing is a silent no-op.
export async function insertStockAlert(
  variantId: string,
  email: string,
  userId: string | null,
): Promise<void> {
  await db
    .insert(stockAlerts)
    .values({ variantId, email, userId })
    .onConflictDoNothing();
}
