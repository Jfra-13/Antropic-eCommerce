import type {
  Category as DbCategory,
  Occasion as DbOccasion,
  Product as DbProduct,
} from "@workspace/db";
import type {
  Category as CategoryDto,
  Occasion as OccasionDto,
  Product as ProductDto,
  AdminProduct as AdminProductDto,
} from "@workspace/api-zod";
import type { ProductRelations, AdminProductRelations } from "./queries";

export function toCategoryDto(c: DbCategory): CategoryDto {
  return { id: c.id, slug: c.slug, name: c.name, sortOrder: c.sortOrder };
}

export function toOccasionDto(o: DbOccasion): OccasionDto {
  return { id: o.id, slug: o.slug, name: o.name, sortOrder: o.sortOrder };
}

export function toProductDto(row: DbProduct, rel: ProductRelations): ProductDto {
  const category = rel.categoriesById.get(row.categoryId);
  if (!category) {
    // categoryId is a NOT NULL FK — a missing row means broken data, not a 404.
    throw new Error(`Product ${row.id} references missing category ${row.categoryId}`);
  }

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    fit: row.fit,
    price: row.price,
    badge: row.badge,
    featured: row.featured,
    category: toCategoryDto(category),
    occasions: (rel.occasionsByProduct.get(row.id) ?? []).map(toOccasionDto),
    images: (rel.mediaByProduct.get(row.id) ?? []).map((m) => ({
      kind: m.kind,
      path: m.storagePath,
      sortOrder: m.sortOrder,
    })),
    variants: (rel.variantsByProduct.get(row.id) ?? []).map((v) => ({
      id: v.id,
      size: v.size,
      color: v.color,
      colorHex: v.colorHex,
      sku: v.sku,
      stock: v.stock,
    })),
  };
}

export function toAdminProductDto(row: DbProduct, rel: AdminProductRelations): AdminProductDto {
  const category = rel.categoriesById.get(row.categoryId);
  if (!category) {
    throw new Error(`Product ${row.id} references missing category ${row.categoryId}`);
  }
  const variants = rel.variantsByProduct.get(row.id) ?? [];

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    fit: row.fit,
    price: row.price,
    badge: row.badge,
    featured: row.featured,
    active: row.active,
    categoryId: row.categoryId,
    categoryName: category.name,
    occasions: (rel.occasionsByProduct.get(row.id) ?? []).map(toOccasionDto),
    stockTotal: variants.reduce((sum, v) => sum + v.stock, 0),
    variants: variants.map((v) => ({
      id: v.id,
      size: v.size,
      color: v.color,
      colorHex: v.colorHex,
      sku: v.sku,
      stock: v.stock,
      priceOverride: v.priceOverride,
      active: v.active,
    })),
    media: (rel.mediaByProduct.get(row.id) ?? []).map((m) => ({
      id: m.id,
      kind: m.kind,
      path: m.storagePath,
      sortOrder: m.sortOrder,
    })),
  };
}
