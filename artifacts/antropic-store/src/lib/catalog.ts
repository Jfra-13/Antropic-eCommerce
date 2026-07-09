import { useMemo } from "react";
import {
  useListProducts,
  useGetProduct,
  useListCategories,
  useListOccasions,
  type ListProductsParams,
} from "@workspace/api-client-react";
import { toProduct, type Product } from "./product";

// The storefront filters/sorts a small catalog client-side, so it pulls the full
// list once (limit 100) and reuses it across pages via React Query's cache.
export function useProducts(params?: ListProductsParams) {
  const query = useListProducts({ limit: 100, ...params });
  const products = useMemo<Product[]>(
    () => (query.data?.items ?? []).map(toProduct),
    [query.data],
  );
  return { ...query, products };
}

export function useProduct(slug: string) {
  const query = useGetProduct(slug);
  const product = useMemo(
    () => (query.data ? toProduct(query.data) : undefined),
    [query.data],
  );
  return { ...query, product };
}

export function useCategories() {
  const query = useListCategories();
  return { ...query, categories: query.data ?? [] };
}

export function useOccasions() {
  const query = useListOccasions();
  return { ...query, occasions: query.data ?? [] };
}
