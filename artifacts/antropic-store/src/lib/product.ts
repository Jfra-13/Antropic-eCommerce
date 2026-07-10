import type { Product as ProductDto } from "@workspace/api-client-react";
import { supabase } from "./supabase";
import corcet_blanco from "../assets/corcet_blanco.png";
import modelo_01 from "../assets/modelo_01.webp";
import modelo_02 from "../assets/modelo_02.webp";

// Physical garment swatch colors (name -> hex). These are PRODUCT colors, not brand
// identity — never fold them into a brand-palette swap. The API returns color names;
// the front owns the hex rendering until the catalog carries its own swatch data.
const COLOR_HEX: Record<string, string> = {
  Rosa: "#F29CBD",
  Coral: "#EF7853",
  Dorado: "#FCC261",
  Fucsia: "#EA4C75",
  Blanco: "#FFFFFF",
  Negro: "#2b2b2b",
  Denim: "#4a6fa5",
};

export function colorHex(name: string): string {
  return COLOR_HEX[name] ?? "#cccccc";
}

// Legacy seed rows store bundled-asset keys instead of Storage paths; anything else is a
// real object path in the public bucket and resolves to its public URL.
const BUNDLED_ASSETS: Record<string, string> = { corcet_blanco, modelo_01, modelo_02 };
const MEDIA_BUCKET = "public-media";

export function mediaUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path; // already a resolved URL
  const bundled = BUNDLED_ASSETS[path];
  if (bundled) return bundled;
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

export interface ProductColor {
  name: string;
  hex: string;
}

// Per-size stock, aggregated across colors. A size with stock 0 is shown disabled
// on the PDP (not hidden) so "avísame cuando haya stock" can be offered.
export interface Variant {
  size: string;
  stock: number;
}

// Exact size×color combination — what the cart and checkout operate on.
export interface VariantOption {
  id: string;
  size: string;
  color: string;
  stock: number;
}

export type ProductBadge = "nuevo" | "mas-vendido";

// Front-facing view model. Shaped for the UI; built from the API DTO via toProduct.
export interface Product {
  id: string;
  slug: string;
  name: string;
  price: string; // formatted, e.g. "S/ 29.99"
  category: string; // category name
  images: string[];
  colors: ProductColor[];
  variants: Variant[];
  variantOptions: VariantOption[];
  occasion: string[]; // occasion names
  fit: string;
  details: string;
  badge?: ProductBadge;
}

export const ALL_SIZES = ["XS", "S", "M", "L", "XL", "Único"];

export function formatPrice(value: number): string {
  return `S/ ${value.toFixed(2)}`;
}

export function priceToNumber(price: string): number {
  return parseFloat(price.replace(/[^0-9.]/g, "")) || 0;
}

export function productSizes(p: Product): string[] {
  return p.variants.map((v) => v.size);
}

export function productStock(p: Product): number {
  return p.variants.reduce((n, v) => n + v.stock, 0);
}

export function isSizeAvailable(p: Product, size: string): boolean {
  return (p.variants.find((v) => v.size === size)?.stock ?? 0) > 0;
}

// The exact variant for a size×color pick, if the combination exists.
export function findVariant(
  p: Product,
  size: string,
  color: string,
): VariantOption | undefined {
  return p.variantOptions.find((v) => v.size === size && v.color === color);
}

export function primaryImage(p: Product): string {
  return p.images[0];
}

// API DTO -> front Product. Aggregates size×color variants into per-size stock and
// distinct color swatches, and resolves media paths to displayable URLs.
export function toProduct(dto: ProductDto): Product {
  const sizeOrder: string[] = [];
  const stockBySize = new Map<string, number>();
  for (const v of dto.variants) {
    if (!stockBySize.has(v.size)) sizeOrder.push(v.size);
    stockBySize.set(v.size, (stockBySize.get(v.size) ?? 0) + v.stock);
  }
  sizeOrder.sort((a, b) => ALL_SIZES.indexOf(a) - ALL_SIZES.indexOf(b));
  const variants: Variant[] = sizeOrder.map((size) => ({
    size,
    stock: stockBySize.get(size) ?? 0,
  }));

  const seenColor = new Set<string>();
  const colors: ProductColor[] = [];
  for (const v of dto.variants) {
    if (seenColor.has(v.color)) continue;
    seenColor.add(v.color);
    colors.push({ name: v.color, hex: colorHex(v.color) });
  }

  const images =
    dto.images.length > 0 ? dto.images.map((i) => mediaUrl(i.path)) : [corcet_blanco];

  return {
    id: dto.id,
    slug: dto.slug,
    name: dto.name,
    price: formatPrice(priceToNumber(dto.price)),
    category: dto.category.name,
    images,
    colors,
    variants,
    variantOptions: dto.variants.map((v) => ({
      id: v.id,
      size: v.size,
      color: v.color,
      stock: v.stock,
    })),
    occasion: dto.occasions.map((o) => o.name),
    fit: dto.fit ?? "",
    details: dto.description ?? "",
    badge: (dto.badge as ProductBadge | null) ?? undefined,
  };
}
