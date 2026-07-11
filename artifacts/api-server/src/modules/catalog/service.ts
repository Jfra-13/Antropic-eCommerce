import Papa from "papaparse";
import type {
  AdminProduct as AdminProductDto,
  AdminProductList as AdminProductListDto,
  Category as CategoryDto,
  Occasion as OccasionDto,
  CreateProductInput,
  UpdateProductInput,
  CreateVariantInput,
  UpdateVariantInput,
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateOccasionInput,
  UpdateOccasionInput,
  AttachProductMediaInput,
  ProductImportResult as ProductImportResultDto,
} from "@workspace/api-zod";
import {
  selectCategories,
  selectOccasions,
  insertCategory,
  updateCategoryRow,
  categoryHasProducts,
  deleteCategoryRow,
  insertOccasion,
  updateOccasionRow,
  occasionHasProducts,
  deleteOccasionRow,
  selectProducts,
  selectProductBySlug,
  loadRelations,
  selectAdminProducts,
  loadAdminRelations,
  getAdminProductRow,
  insertProductTx,
  updateProductTx,
  productExists,
  productHasSales,
  deleteProductTx,
  insertVariant,
  updateVariantRow,
  getVariantStock,
  getVariantForAlert,
  insertStockAlert,
  insertProductMedia,
  deleteProductMediaRow,
  importProductGroup,
  type ProductFilters,
  type ImportProductGroup,
} from "./queries";
import { toCategoryDto, toOccasionDto, toProductDto, toAdminProductDto } from "./mappers";
import * as notifications from "../notifications/service";
import { deletePublicMediaObjects } from "../../lib/storage";
import { logger } from "../../lib/logger";

export async function getCategories(includeEmpty = false, includeInactive = false) {
  return (await selectCategories(includeEmpty, includeInactive)).map(toCategoryDto);
}

export async function getOccasions(includeInactive = false) {
  return (await selectOccasions(includeInactive)).map(toOccasionDto);
}

export async function getProducts(filters: ProductFilters) {
  const { rows, total } = await selectProducts(filters);
  const rel = await loadRelations(rows);
  return {
    items: rows.map((row) => toProductDto(row, rel)),
    total,
    page: filters.page,
    limit: filters.limit,
  };
}

export async function getProductBySlug(slug: string) {
  const row = await selectProductBySlug(slug);
  if (!row) return undefined;
  const rel = await loadRelations([row]);
  return toProductDto(row, rel);
}

// --- Admin inventory (planeación §5; requerimientos §6.5) ---

export type AdminCatalogResult =
  | { ok: true; status: number; product: AdminProductDto }
  | { ok: false; status: number; code: string; message: string };

function pgErrorCode(e: unknown): string | undefined {
  return typeof e === "object" && e !== null && "code" in e
    ? (e as { code?: string }).code
    : undefined;
}

// name -> url-safe slug. Accents stripped, non-alphanumerics collapsed to single dashes.
function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function buildAdminProduct(id: string): Promise<AdminProductDto> {
  const row = await getAdminProductRow(id);
  if (!row) throw new Error(`Admin product ${id} vanished after write`);
  const rel = await loadAdminRelations([row]);
  return toAdminProductDto(row, rel);
}

export async function getAdminProducts(
  q: string | undefined,
  page: number,
  limit: number,
): Promise<AdminProductListDto> {
  const { rows, total } = await selectAdminProducts(q, page, limit);
  const rel = await loadAdminRelations(rows);
  return { items: rows.map((r) => toAdminProductDto(r, rel)), total, page, limit };
}

export async function createProduct(input: CreateProductInput): Promise<AdminCatalogResult> {
  try {
    const product = await insertProductTx(
      {
        name: input.name,
        slug: slugify(input.name),
        price: input.price,
        categoryId: input.categoryId,
        description: input.description ?? null,
        fit: input.fit ?? null,
        badge: input.badge ?? null,
        featured: input.featured ?? false,
      },
      input.occasionIds ?? [],
      (input.variants ?? []).map((v) => ({
        size: v.size,
        color: v.color,
        colorHex: v.colorHex ?? null,
        sku: v.sku,
        stock: v.stock ?? 0,
        priceOverride: v.priceOverride ?? null,
      })),
    );
    return { ok: true, status: 201, product: await buildAdminProduct(product.id) };
  } catch (e) {
    if (pgErrorCode(e) === "23505") {
      return { ok: false, status: 409, code: "DUPLICATE", message: "Slug or SKU already exists" };
    }
    if (pgErrorCode(e) === "23503") {
      return { ok: false, status: 400, code: "INVALID_CATEGORY", message: "categoryId does not exist" };
    }
    throw e;
  }
}

export async function updateProduct(
  id: string,
  input: UpdateProductInput,
): Promise<AdminCatalogResult> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch["name"] = input.name;
  if (input.price !== undefined) patch["price"] = input.price;
  if (input.categoryId !== undefined) patch["categoryId"] = input.categoryId;
  if (input.description !== undefined) patch["description"] = input.description;
  if (input.fit !== undefined) patch["fit"] = input.fit;
  if (input.badge !== undefined) patch["badge"] = input.badge;
  if (input.featured !== undefined) patch["featured"] = input.featured;
  if (input.active !== undefined) patch["active"] = input.active;

  try {
    const product = await updateProductTx(id, patch, input.occasionIds);
    if (!product) {
      return { ok: false, status: 404, code: "NOT_FOUND", message: "Product not found" };
    }
    return { ok: true, status: 200, product: await buildAdminProduct(product.id) };
  } catch (e) {
    if (pgErrorCode(e) === "23503") {
      return { ok: false, status: 400, code: "INVALID_CATEGORY", message: "categoryId does not exist" };
    }
    throw e;
  }
}

export async function addVariant(
  productId: string,
  input: CreateVariantInput,
): Promise<AdminCatalogResult> {
  if (!(await productExists(productId))) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Product not found" };
  }
  try {
    await insertVariant({
      productId,
      size: input.size,
      color: input.color,
      colorHex: input.colorHex ?? null,
      sku: input.sku,
      stock: input.stock ?? 0,
      priceOverride: input.priceOverride ?? null,
    });
    return { ok: true, status: 200, product: await buildAdminProduct(productId) };
  } catch (e) {
    if (pgErrorCode(e) === "23505") {
      return {
        ok: false,
        status: 409,
        code: "DUPLICATE",
        message: "SKU or size/color combination already exists",
      };
    }
    throw e;
  }
}

export type DeleteProductResult =
  | { ok: true }
  | { ok: false; status: number; code: string; message: string };

// Hard-delete is reserved for products that never sold; sold products keep their row
// (order history and reports reference it) and must be deactivated instead.
export async function deleteProduct(id: string): Promise<DeleteProductResult> {
  if (!(await productExists(id))) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Product not found" };
  }
  if (await productHasSales(id)) {
    return {
      ok: false,
      status: 409,
      code: "REFERENCED",
      message: "Product has sales; deactivate it instead of deleting",
    };
  }
  const { deleted, mediaPaths } = await deleteProductTx(id);
  if (!deleted) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Product not found" };
  }
  // Best-effort Storage cleanup AFTER the commit — an orphan object is cheaper than a
  // rolled-back delete over a Storage hiccup.
  if (mediaPaths.length > 0) {
    deletePublicMediaObjects(mediaPaths).catch((err) => {
      logger.warn({ err, productId: id, mediaPaths }, "product media cleanup failed");
    });
  }
  return { ok: true };
}

export type StockAlertResult =
  | { ok: true }
  | { ok: false; status: number; code: string; message: string };

export async function subscribeStockAlert(
  variantId: string,
  email: string,
  userId: string | null,
): Promise<StockAlertResult> {
  const variant = await getVariantForAlert(variantId);
  if (!variant) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Variant not found" };
  }
  if (variant.stock > 0) {
    return { ok: false, status: 409, code: "IN_STOCK", message: "Variant currently has stock" };
  }
  await insertStockAlert(variantId, email, userId);
  return { ok: true };
}

// --- Category / occasion management (round 4) ---

export type CategoryResult =
  | { ok: true; status: number; category: CategoryDto }
  | { ok: false; status: number; code: string; message: string };

export type OccasionResult =
  | { ok: true; status: number; occasion: OccasionDto }
  | { ok: false; status: number; code: string; message: string };

export type DeleteTermResult =
  | { ok: true }
  | { ok: false; status: number; code: string; message: string };

export async function createCategory(input: CreateCategoryInput): Promise<CategoryResult> {
  try {
    const row = await insertCategory({
      name: input.name,
      slug: input.slug ?? slugify(input.name),
      active: input.active ?? true,
      sortOrder: input.sortOrder ?? 0,
    });
    return { ok: true, status: 201, category: toCategoryDto(row) };
  } catch (e) {
    if (pgErrorCode(e) === "23505") {
      return { ok: false, status: 409, code: "DUPLICATE", message: "Category slug already exists" };
    }
    throw e;
  }
}

export async function updateCategory(
  id: string,
  input: UpdateCategoryInput,
): Promise<CategoryResult> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch["name"] = input.name;
  if (input.slug !== undefined) patch["slug"] = input.slug;
  if (input.active !== undefined) patch["active"] = input.active;
  if (input.sortOrder !== undefined) patch["sortOrder"] = input.sortOrder;

  try {
    const row =
      Object.keys(patch).length === 0
        ? (await selectCategories(true, true)).find((c) => c.id === id)
        : await updateCategoryRow(id, patch);
    if (!row) return { ok: false, status: 404, code: "NOT_FOUND", message: "Category not found" };
    return { ok: true, status: 200, category: toCategoryDto(row) };
  } catch (e) {
    if (pgErrorCode(e) === "23505") {
      return { ok: false, status: 409, code: "DUPLICATE", message: "Category slug already exists" };
    }
    throw e;
  }
}

// Categories with products keep their row (products.category_id is NOT NULL); offer
// deactivation instead — same policy as sold products.
export async function deleteCategory(id: string): Promise<DeleteTermResult> {
  if (await categoryHasProducts(id)) {
    return {
      ok: false,
      status: 409,
      code: "REFERENCED",
      message: "Category has products; deactivate it instead of deleting",
    };
  }
  const deleted = await deleteCategoryRow(id);
  if (!deleted) return { ok: false, status: 404, code: "NOT_FOUND", message: "Category not found" };
  return { ok: true };
}

export async function createOccasion(input: CreateOccasionInput): Promise<OccasionResult> {
  try {
    const row = await insertOccasion({
      name: input.name,
      slug: input.slug ?? slugify(input.name),
      active: input.active ?? true,
      sortOrder: input.sortOrder ?? 0,
    });
    return { ok: true, status: 201, occasion: toOccasionDto(row) };
  } catch (e) {
    if (pgErrorCode(e) === "23505") {
      return { ok: false, status: 409, code: "DUPLICATE", message: "Occasion slug already exists" };
    }
    throw e;
  }
}

export async function updateOccasion(
  id: string,
  input: UpdateOccasionInput,
): Promise<OccasionResult> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch["name"] = input.name;
  if (input.slug !== undefined) patch["slug"] = input.slug;
  if (input.active !== undefined) patch["active"] = input.active;
  if (input.sortOrder !== undefined) patch["sortOrder"] = input.sortOrder;

  try {
    const row =
      Object.keys(patch).length === 0
        ? (await selectOccasions(true)).find((o) => o.id === id)
        : await updateOccasionRow(id, patch);
    if (!row) return { ok: false, status: 404, code: "NOT_FOUND", message: "Occasion not found" };
    return { ok: true, status: 200, occasion: toOccasionDto(row) };
  } catch (e) {
    if (pgErrorCode(e) === "23505") {
      return { ok: false, status: 409, code: "DUPLICATE", message: "Occasion slug already exists" };
    }
    throw e;
  }
}

export async function deleteOccasion(id: string): Promise<DeleteTermResult> {
  if (await occasionHasProducts(id)) {
    return {
      ok: false,
      status: 409,
      code: "REFERENCED",
      message: "Occasion is assigned to products; deactivate it instead of deleting",
    };
  }
  const deleted = await deleteOccasionRow(id);
  if (!deleted) return { ok: false, status: 404, code: "NOT_FOUND", message: "Occasion not found" };
  return { ok: true };
}

// --- Product media (photos + lookbook videos; requerimientos §6.5) ---

export async function attachMedia(
  productId: string,
  input: AttachProductMediaInput,
): Promise<AdminCatalogResult> {
  if (!(await productExists(productId))) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Product not found" };
  }
  await insertProductMedia({
    productId,
    kind: input.kind ?? "image",
    storagePath: input.path,
  });
  return { ok: true, status: 200, product: await buildAdminProduct(productId) };
}

export async function removeMedia(mediaId: string): Promise<AdminCatalogResult> {
  const productId = await deleteProductMediaRow(mediaId);
  if (!productId) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Media not found" };
  }
  return { ok: true, status: 200, product: await buildAdminProduct(productId) };
}

// --- CSV import (planeación §4.6; requerimientos §6.5) ---

type ImportRow = {
  nombre: string;
  categoria: string;
  ocasion: string;
  precio: string;
  talla: string;
  color: string;
  sku: string;
  stock: number;
  descripcion: string;
};

// Validate one raw CSV row. Returns the typed row or a human message naming the first problem.
function validateRow(raw: Record<string, string>): { ok: true; row: ImportRow } | { ok: false; message: string } {
  const get = (k: string) => (raw[k] ?? "").trim();
  const nombre = get("nombre");
  const categoria = get("categoria");
  const precio = get("precio");
  const talla = get("talla");
  const color = get("color");
  const sku = get("sku");
  const stockStr = get("stock");

  if (!nombre) return { ok: false, message: "nombre vacío" };
  if (!categoria) return { ok: false, message: "categoria vacía" };
  if (!/^\d+(\.\d{1,2})?$/.test(precio)) return { ok: false, message: "precio inválido" };
  if (!talla) return { ok: false, message: "talla vacía" };
  if (!color) return { ok: false, message: "color vacío" };
  if (!sku) return { ok: false, message: "sku vacío" };
  const stock = Number(stockStr);
  if (!Number.isInteger(stock) || stock < 0) return { ok: false, message: "stock inválido" };

  return {
    ok: true,
    row: {
      nombre,
      categoria,
      ocasion: get("ocasion"),
      precio,
      talla,
      color,
      sku,
      stock,
      descripcion: get("descripcion"),
    },
  };
}

// Case-insensitive lookup by both name and slug.
function nameSlugMap(items: { id: string; name: string; slug: string }[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const it of items) {
    map.set(it.name.toLowerCase(), it.id);
    map.set(it.slug.toLowerCase(), it.id);
  }
  return map;
}

export async function importProducts(
  csv: string,
  dryRun: boolean,
): Promise<{ ok: true; result: ProductImportResultDto } | { ok: false; message: string }> {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return { ok: false, message: `CSV inválido: ${parsed.errors[0]!.message}` };
  }

  const [cats, occs] = await Promise.all([selectCategories(true), selectOccasions()]);
  const catMap = nameSlugMap(cats);
  const occMap = nameSlugMap(occs);

  const errors: { row: number; message: string }[] = [];
  type ResolvedRow = ImportRow & { rowNum: number; categoryId: string; occasionId: string | null };
  const validRows: ResolvedRow[] = [];

  parsed.data.forEach((raw, i) => {
    const rowNum = i + 2; // header is row 1
    const v = validateRow(raw);
    if (!v.ok) {
      errors.push({ row: rowNum, message: v.message });
      return;
    }
    const categoryId = catMap.get(v.row.categoria.toLowerCase());
    if (!categoryId) {
      errors.push({ row: rowNum, message: `categoría desconocida: ${v.row.categoria}` });
      return;
    }
    let occasionId: string | null = null;
    if (v.row.ocasion) {
      const oid = occMap.get(v.row.ocasion.toLowerCase());
      if (!oid) {
        errors.push({ row: rowNum, message: `ocasión desconocida: ${v.row.ocasion}` });
        return;
      }
      occasionId = oid;
    }
    validRows.push({ ...v.row, rowNum, categoryId, occasionId });
  });

  const total = parsed.data.length;
  if (dryRun) {
    return { ok: true, result: { total, valid: validRows.length, imported: 0, errors } };
  }

  // Group by product slug; first row of a group supplies the product-level fields.
  const groups = new Map<string, ResolvedRow[]>();
  for (const r of validRows) {
    const slug = slugify(r.nombre);
    const bucket = groups.get(slug);
    if (bucket) bucket.push(r);
    else groups.set(slug, [r]);
  }

  let imported = 0;
  for (const [slug, rows] of groups) {
    const head = rows[0]!;
    const group: ImportProductGroup = {
      product: {
        name: head.nombre,
        slug,
        price: head.precio,
        categoryId: head.categoryId,
        description: head.descripcion || null,
      },
      variants: rows.map((r) => ({ size: r.talla, color: r.color, sku: r.sku, stock: r.stock })),
      occasionId: head.occasionId,
    };
    try {
      await importProductGroup(group);
      imported += rows.length;
    } catch (e) {
      const message =
        pgErrorCode(e) === "23505"
          ? "SKU o combinación talla/color duplicada"
          : "error al importar la fila";
      for (const r of rows) errors.push({ row: r.rowNum, message });
    }
  }

  return { ok: true, result: { total, valid: validRows.length, imported, errors } };
}

export async function updateVariant(
  id: string,
  input: UpdateVariantInput,
): Promise<AdminCatalogResult> {
  const patch: Record<string, unknown> = {};
  if (input.size !== undefined) patch["size"] = input.size;
  if (input.color !== undefined) patch["color"] = input.color;
  if (input.colorHex !== undefined) patch["colorHex"] = input.colorHex;
  if (input.sku !== undefined) patch["sku"] = input.sku;
  if (input.stock !== undefined) patch["stock"] = input.stock;
  if (input.priceOverride !== undefined) patch["priceOverride"] = input.priceOverride;
  if (input.active !== undefined) patch["active"] = input.active;

  // Detect an out-of-stock -> in-stock transition to fire "avísame" alerts after the update.
  const restocked =
    input.stock !== undefined && input.stock > 0 && (await getVariantStock(id)) === 0;

  try {
    const productId = await updateVariantRow(id, patch);
    if (!productId) {
      return { ok: false, status: 404, code: "NOT_FOUND", message: "Variant not found" };
    }
    // Best-effort: notify subscribers waiting for this variant to come back in stock.
    if (restocked) void notifications.notifyStockAvailable(id);
    return { ok: true, status: 200, product: await buildAdminProduct(productId) };
  } catch (e) {
    if (pgErrorCode(e) === "23505") {
      return {
        ok: false,
        status: 409,
        code: "DUPLICATE",
        message: "SKU or size/color combination already exists",
      };
    }
    throw e;
  }
}
