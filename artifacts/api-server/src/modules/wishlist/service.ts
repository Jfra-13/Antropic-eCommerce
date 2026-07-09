import type { Wishlist as WishlistDto } from "@workspace/api-zod";
import { loadRelations } from "../catalog/queries";
import { toProductDto } from "../catalog/mappers";
import {
  selectWishlistProductIds,
  selectActiveProductsByIds,
  isActiveProduct,
  insertWishlist,
  deleteWishlist,
} from "./queries";

export type WishlistResult =
  | { ok: true; wishlist: WishlistDto }
  | { ok: false; status: number; code: string; message: string };

async function view(userId: string): Promise<WishlistDto> {
  const ids = await selectWishlistProductIds(userId);
  const rows = await selectActiveProductsByIds(ids);
  const rel = await loadRelations(rows);
  // Preserve the wishlist order (newest first); the products query is unordered.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const items = ids
    .map((id) => byId.get(id))
    .filter((row): row is NonNullable<typeof row> => row !== undefined)
    .map((row) => toProductDto(row, rel));
  return { items };
}

export async function getWishlist(userId: string): Promise<WishlistDto> {
  return view(userId);
}

export async function addItem(userId: string, productId: string): Promise<WishlistResult> {
  if (!(await isActiveProduct(productId))) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Product not found" };
  }
  await insertWishlist(userId, productId); // idempotent (unique user+product)
  return { ok: true, wishlist: await view(userId) };
}

export async function removeItem(userId: string, productId: string): Promise<WishlistDto> {
  await deleteWishlist(userId, productId);
  return view(userId);
}
