import type { Cart as CartDto } from "@workspace/api-zod";
import {
  getOrCreateCart,
  selectCartLines,
  getVariant,
  getCartItemQuantity,
  upsertCartItem,
  deleteCartItem,
} from "./queries";
import { toCartItemDto } from "./mappers";

// Owner-scoped throughout: every call resolves the cart from userId (jwt.sub), never
// from a client-supplied cart id. Stock is respected but NOT reserved here — decrement
// happens at payment approval (Fase 5).
export type CartResult =
  | { ok: true; cart: CartDto }
  | { ok: false; status: number; code: string; message: string };

async function view(cartId: string): Promise<CartDto> {
  const lines = await selectCartLines(cartId);
  return { items: lines.map(toCartItemDto) };
}

export async function getCart(userId: string): Promise<CartDto> {
  const cart = await getOrCreateCart(userId);
  return view(cart.id);
}

export async function addItem(
  userId: string,
  variantId: string,
  quantity: number,
): Promise<CartResult> {
  const cart = await getOrCreateCart(userId);
  const variant = await getVariant(variantId);
  if (!variant || !variant.active) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Variant not found" };
  }
  if (variant.stock <= 0) {
    return { ok: false, status: 409, code: "OUT_OF_STOCK", message: "Variant is out of stock" };
  }

  const current = (await getCartItemQuantity(cart.id, variantId)) ?? 0;
  const clamped = Math.min(current + quantity, variant.stock);
  await upsertCartItem(cart.id, variantId, clamped);
  return { ok: true, cart: await view(cart.id) };
}

export async function setQuantity(
  userId: string,
  variantId: string,
  quantity: number,
): Promise<CartResult> {
  const cart = await getOrCreateCart(userId);
  const current = await getCartItemQuantity(cart.id, variantId);
  if (current === undefined) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Cart line not found" };
  }
  const variant = await getVariant(variantId);
  if (!variant || variant.stock <= 0) {
    return { ok: false, status: 409, code: "OUT_OF_STOCK", message: "Variant is out of stock" };
  }

  await upsertCartItem(cart.id, variantId, Math.min(quantity, variant.stock));
  return { ok: true, cart: await view(cart.id) };
}

export async function removeItem(userId: string, variantId: string): Promise<CartDto> {
  const cart = await getOrCreateCart(userId);
  await deleteCartItem(cart.id, variantId);
  return view(cart.id);
}

// Guest cart (localStorage) merges into the persisted cart on login: sum quantities,
// clamp to stock. Best-effort — a stale/dead variant in the guest cart is skipped,
// not fatal. ponytail: sequential per-item queries; guest carts are tiny (<~20 lines).
export async function merge(
  userId: string,
  items: { variantId: string; quantity: number }[],
): Promise<CartDto> {
  const cart = await getOrCreateCart(userId);

  for (const { variantId, quantity } of items) {
    const variant = await getVariant(variantId);
    if (!variant || !variant.active || variant.stock <= 0) continue;
    const current = (await getCartItemQuantity(cart.id, variantId)) ?? 0;
    await upsertCartItem(cart.id, variantId, Math.min(current + quantity, variant.stock));
  }

  return view(cart.id);
}
