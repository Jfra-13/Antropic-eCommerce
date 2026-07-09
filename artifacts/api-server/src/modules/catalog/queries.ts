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
} from "@workspace/db";
import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";

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
