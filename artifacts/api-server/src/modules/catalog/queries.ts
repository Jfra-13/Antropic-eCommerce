import {
  db,
  products,
  categories,
  occasions,
  productVariants,
  productMedia,
  productOccasions,
  type Category,
  type Occasion,
  type Product,
  type ProductVariant,
  type ProductMedia,
  type InsertProduct,
  type InsertProductVariant,
} from "@workspace/db";
import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import type { Tx } from "../../lib/tx";

export type ProductFilters = {
  page: number;
  limit: number;
  category?: string;
  occasion?: string;
  featured?: boolean;
  q?: string;
};

export function selectCategories(): Promise<Category[]> {
  return db
    .select()
    .from(categories)
    .where(eq(categories.active, true))
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
};

// Like loadRelations but WITHOUT the active filters — admins see inactive variants and all
// assigned occasions, and there is no need to load media here (managed in a later slice).
export async function loadAdminRelations(rows: Product[]): Promise<AdminProductRelations> {
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) {
    return {
      categoriesById: new Map(),
      variantsByProduct: new Map(),
      occasionsByProduct: new Map(),
    };
  }

  const catIds = [...new Set(rows.map((r) => r.categoryId))];
  const cats = await db.select().from(categories).where(inArray(categories.id, catIds));

  const variants = await db
    .select()
    .from(productVariants)
    .where(inArray(productVariants.productId, ids))
    .orderBy(asc(productVariants.size), asc(productVariants.color));

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
  patch: Partial<Pick<InsertProductVariant, "size" | "color" | "sku" | "stock" | "priceOverride" | "active">>,
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
