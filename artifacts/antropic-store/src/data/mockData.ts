import corcet_blanco from "../assets/corcet_blanco.png";
import modelo_01 from "../assets/modelo_01.webp";
import modelo_02 from "../assets/modelo_02.webp";

export interface ProductColor {
  name: string;
  hex: string;
}

// Occasion of use — business requirement (Fiesta, Oficina, etc.). Drives the
// navbar mega-menu and the ?occasion= filter on the PLP.
export type Occasion = "Casual" | "Fiesta" | "Oficina" | "Playa" | "Deporte";

// Per-size stock. A size with stock 0 is shown disabled on the PDP (not hidden)
// so "avísame cuando haya stock" can be offered.
export interface Variant {
  size: string;
  stock: number;
}

// Mutually exclusive card badges (guía de estilos §badges):
// - "nuevo": temporal, brand color, inline.
// - "mas-vendido": merit, neutral overlay on the image.
export type ProductBadge = "nuevo" | "mas-vendido";

export interface Product {
  id: string;
  name: string;
  price: string;
  category: string;
  // First entry is the primary shot; [1] is the on-model/hover shot used for
  // the card image swap. ponytail: real photography pending — placeholder
  // assets reused so the swap mechanism is wired to its final shape.
  images: string[];
  colors: ProductColor[];
  variants: Variant[];
  occasion: Occasion[];
  fit: string;
  details: string;
  badge?: ProductBadge;
}

const DEFAULT_DETAILS =
  "Confeccionada con materiales suaves y de alta calidad, esta pieza combina comodidad y estilo para tu día a día. Diseño versátil pensado para acompañarte en cualquier ocasión y realzar tu look con la esencia ANTROPIC.";

export const ALL_SIZES = ["XS", "S", "M", "L", "XL", "Único"];

// Occasions offered as filters / mega-menu entries.
export const ALL_OCCASIONS: Occasion[] = ["Casual", "Fiesta", "Oficina", "Playa", "Deporte"];

const C = {
  rosa: { name: "Rosa", hex: "#F29CBD" },
  coral: { name: "Coral", hex: "#EF7853" },
  dorado: { name: "Dorado", hex: "#FCC261" },
  fucsia: { name: "Fucsia", hex: "#EA4C75" },
  blanco: { name: "Blanco", hex: "#FFFFFF" },
  negro: { name: "Negro", hex: "#2b2b2b" },
  denim: { name: "Denim", hex: "#4a6fa5" },
};

export const ALL_COLORS: ProductColor[] = [
  C.rosa, C.coral, C.dorado, C.fucsia, C.blanco, C.negro, C.denim,
];

// Placeholder hover shot — alternates so the swap is visible in the demo.
const HOVER_SHOTS = [modelo_01, modelo_02];

type BaseInput = {
  id: string;
  name: string;
  price: string;
  category: string;
  sizes: string[];
  colors: ProductColor[];
  stock: number;
  fit: string;
  occasion?: Occasion[];
  badge?: ProductBadge;
  soldOutSizes?: string[];
  details?: string;
};

const base = (p: BaseInput): Product => {
  const per = p.sizes.length > 0 ? Math.max(1, Math.round(p.stock / p.sizes.length)) : 0;
  const variants: Variant[] = p.sizes.map((size) => ({
    size,
    stock: p.soldOutSizes?.includes(size) ? 0 : per,
  }));
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    category: p.category,
    images: [corcet_blanco, HOVER_SHOTS[Number(p.id) % HOVER_SHOTS.length]],
    colors: p.colors,
    variants,
    occasion: p.occasion ?? ["Casual"],
    fit: p.fit,
    details: p.details ?? DEFAULT_DETAILS,
    badge: p.badge,
  };
};

export const PRODUCTS: Product[] = [
  base({ id: "1", name: "Top Margarita Rosa", price: "S/ 29.99", category: "Tops", sizes: ["XS", "S", "M", "L"], colors: [C.rosa, C.blanco, C.fucsia], stock: 12, fit: "Fit", badge: "nuevo" }),
  base({ id: "2", name: "Shorts Denim Clásico", price: "S/ 39.99", category: "Shorts", sizes: ["S", "M", "L", "XL"], colors: [C.denim, C.negro], stock: 8, fit: "Regular", badge: "mas-vendido" }),
  base({ id: "3", name: "Vestido Floral Verano", price: "S/ 49.99", category: "Swim", sizes: ["XS", "S", "M"], colors: [C.rosa, C.coral], stock: 5, fit: "Regular", occasion: ["Fiesta", "Playa"], soldOutSizes: ["XS"] }),
  base({ id: "4", name: "Top Deportivo Coral", price: "S/ 24.99", category: "Active", sizes: ["S", "M", "L"], colors: [C.coral, C.negro, C.fucsia], stock: 20, fit: "Fit", occasion: ["Deporte"] }),
  base({ id: "5", name: "Camiseta Básica Sol", price: "S/ 19.99", category: "Tops", sizes: ["XS", "S", "M", "L", "XL"], colors: [C.blanco, C.dorado, C.negro], stock: 30, fit: "Regular", badge: "mas-vendido" }),
  base({ id: "6", name: "Chaqueta Denim Ligera", price: "S/ 59.99", category: "Denim", sizes: ["S", "M", "L"], colors: [C.denim], stock: 6, fit: "Oversize", occasion: ["Casual", "Oficina"] }),
  base({ id: "7", name: "Top Floral 50% Off", price: "S/ 14.99", category: "Sale", sizes: ["XS", "S", "M"], colors: [C.rosa, C.coral], stock: 4, fit: "Fit" }),
  base({ id: "8", name: "Shorts Coral Oferta", price: "S/ 19.99", category: "Sale", sizes: ["S", "M", "L"], colors: [C.coral, C.denim], stock: 7, fit: "Regular" }),
  base({ id: "9", name: "Camiseta Nueva Temporada", price: "S/ 25.99", category: "Novedades", sizes: ["S", "M", "L", "XL"], colors: [C.blanco, C.rosa], stock: 15, fit: "Oversize", badge: "nuevo" }),
  base({ id: "10", name: "Falda Plisada Verano", price: "S/ 34.99", category: "Novedades", sizes: ["XS", "S", "M", "L"], colors: [C.dorado, C.rosa], stock: 9, fit: "Regular", occasion: ["Oficina", "Fiesta"], badge: "nuevo" }),
  base({ id: "11", name: "Blusa Satinada Perla", price: "S/ 44.99", category: "Tops", sizes: ["S", "M", "L"], colors: [C.blanco, C.rosa], stock: 11, fit: "Slim", occasion: ["Oficina", "Fiesta"] }),
  base({ id: "12", name: "Jeans Mom Fit", price: "S/ 69.99", category: "Denim", sizes: ["S", "M", "L", "XL"], colors: [C.denim, C.negro], stock: 10, fit: "Oversize", badge: "mas-vendido" }),
  base({ id: "13", name: "Bikini Tropical", price: "S/ 39.99", category: "Swim", sizes: ["XS", "S", "M", "L"], colors: [C.coral, C.fucsia], stock: 6, fit: "Fit", occasion: ["Playa"] }),
  base({ id: "14", name: "Legging Power Active", price: "S/ 34.99", category: "Active", sizes: ["XS", "S", "M", "L"], colors: [C.negro, C.fucsia], stock: 18, fit: "Fit", occasion: ["Deporte"] }),
  base({ id: "15", name: "Bolso Tejido Playa", price: "S/ 29.99", category: "Accesorios", sizes: ["Único"], colors: [C.dorado, C.coral], stock: 14, fit: "Regular", occasion: ["Playa", "Casual"] }),
  base({ id: "16", name: "Collar Flor Dorado", price: "S/ 15.99", category: "Accesorios", sizes: ["Único"], colors: [C.dorado], stock: 25, fit: "Regular", occasion: ["Fiesta", "Casual"] }),
  base({ id: "17", name: "Top Crop Oversize", price: "S/ 27.99", category: "Tops", sizes: ["S", "M", "L"], colors: [C.negro, C.blanco, C.coral], stock: 13, fit: "Oversize" }),
  base({ id: "18", name: "Short Cargo Rosa", price: "S/ 32.99", category: "Shorts", sizes: ["XS", "S", "M", "L"], colors: [C.rosa, C.negro], stock: 9, fit: "Regular", soldOutSizes: ["L"] }),
  base({ id: "19", name: "Vestido Verano Coral", price: "S/ 54.99", category: "Novedades", sizes: ["S", "M", "L"], colors: [C.coral, C.dorado], stock: 7, fit: "Regular", occasion: ["Fiesta", "Oficina"], badge: "nuevo" }),
  base({ id: "20", name: "Sudadera Suave Nube", price: "S/ 49.99", category: "Sale", sizes: ["S", "M", "L", "XL"], colors: [C.rosa, C.blanco], stock: 5, fit: "Oversize" }),
];

export const CATEGORIES = ["Tops", "Shorts", "Denim", "Active", "Accesorios", "Swim", "Sale", "Novedades"];

// --- Derived accessors (variants are the source of truth for stock/sizes) ---

export function productSizes(p: Product): string[] {
  return p.variants.map((v) => v.size);
}

export function productStock(p: Product): number {
  return p.variants.reduce((n, v) => n + v.stock, 0);
}

export function isSizeAvailable(p: Product, size: string): boolean {
  return (p.variants.find((v) => v.size === size)?.stock ?? 0) > 0;
}

export function primaryImage(p: Product): string {
  return p.images[0];
}

export function priceToNumber(price: string): number {
  return parseFloat(price.replace(/[^0-9.]/g, "")) || 0;
}

export function formatPrice(value: number): string {
  return `S/ ${value.toFixed(2)}`;
}

export const MOCK_USER = {
  name: "María García",
  email: "maria@example.com"
};
