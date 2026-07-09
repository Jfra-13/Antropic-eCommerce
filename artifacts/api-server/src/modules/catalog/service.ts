import {
  selectCategories,
  selectOccasions,
  selectProducts,
  selectProductBySlug,
  loadRelations,
  type ProductFilters,
} from "./queries";
import { toCategoryDto, toOccasionDto, toProductDto } from "./mappers";

export async function getCategories() {
  return (await selectCategories()).map(toCategoryDto);
}

export async function getOccasions() {
  return (await selectOccasions()).map(toOccasionDto);
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
