export interface ProductColor {
  name: string;
  hex: string;
}

export interface Product {
  id: string;
  name: string;
  price: string;
  category: string;
  image: string;
  sizes: string[];
  colors: ProductColor[];
  stock: number;
  rating: number;
  likes: number;
  fit: string;
  details: string;
}
import corcet_blanco from "../assets/corcet_blanco.png";
const COMMON_IMAGE = corcet_blanco;

const DEFAULT_DETAILS =
  "Confeccionada con materiales suaves y de alta calidad, esta pieza combina comodidad y estilo para tu día a día. Diseño versátil pensado para acompañarte en cualquier ocasión y realzar tu look con la esencia ANTROPIC.";

export const ALL_SIZES = ["XS", "S", "M", "L", "XL", "Único"];

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

const base = (p: Omit<Product, "image" | "details"> & { details?: string }): Product => ({
  image: COMMON_IMAGE,
  details: p.details ?? DEFAULT_DETAILS,
  ...p,
});

export const PRODUCTS: Product[] = [
  base({ id: "1", name: "Top Margarita Rosa", price: "S/ 29.99", category: "Tops", sizes: ["XS", "S", "M", "L"], colors: [C.rosa, C.blanco, C.fucsia], stock: 12, rating: 4.5, likes: 128, fit: "Fit" }),
  base({ id: "2", name: "Shorts Denim Clásico", price: "S/ 39.99", category: "Shorts", sizes: ["S", "M", "L", "XL"], colors: [C.denim, C.negro], stock: 8, rating: 4.2, likes: 89, fit: "Regular" }),
  base({ id: "3", name: "Vestido Floral Verano", price: "S/ 49.99", category: "Swim", sizes: ["XS", "S", "M"], colors: [C.rosa, C.coral], stock: 5, rating: 4.8, likes: 210, fit: "Regular" }),
  base({ id: "4", name: "Top Deportivo Coral", price: "S/ 24.99", category: "Active", sizes: ["S", "M", "L"], colors: [C.coral, C.negro, C.fucsia], stock: 20, rating: 4.3, likes: 76, fit: "Fit" }),
  base({ id: "5", name: "Camiseta Básica Sol", price: "S/ 19.99", category: "Tops", sizes: ["XS", "S", "M", "L", "XL"], colors: [C.blanco, C.dorado, C.negro], stock: 30, rating: 4.1, likes: 54, fit: "Regular" }),
  base({ id: "6", name: "Chaqueta Denim Ligera", price: "S/ 59.99", category: "Denim", sizes: ["S", "M", "L"], colors: [C.denim], stock: 6, rating: 4.6, likes: 143, fit: "Oversize" }),
  base({ id: "7", name: "Top Floral 50% Off", price: "S/ 14.99", category: "Sale", sizes: ["XS", "S", "M"], colors: [C.rosa, C.coral], stock: 4, rating: 4.0, likes: 65, fit: "Fit" }),
  base({ id: "8", name: "Shorts Coral Oferta", price: "S/ 19.99", category: "Sale", sizes: ["S", "M", "L"], colors: [C.coral, C.denim], stock: 7, rating: 3.9, likes: 41, fit: "Regular" }),
  base({ id: "9", name: "Camiseta Nueva Temporada", price: "S/ 25.99", category: "Novedades", sizes: ["S", "M", "L", "XL"], colors: [C.blanco, C.rosa], stock: 15, rating: 4.7, likes: 98, fit: "Oversize" }),
  base({ id: "10", name: "Falda Plisada Verano", price: "S/ 34.99", category: "Novedades", sizes: ["XS", "S", "M", "L"], colors: [C.dorado, C.rosa], stock: 9, rating: 4.4, likes: 112, fit: "Regular" }),
  base({ id: "11", name: "Blusa Satinada Perla", price: "S/ 44.99", category: "Tops", sizes: ["S", "M", "L"], colors: [C.blanco, C.rosa], stock: 11, rating: 4.5, likes: 87, fit: "Slim" }),
  base({ id: "12", name: "Jeans Mom Fit", price: "S/ 69.99", category: "Denim", sizes: ["S", "M", "L", "XL"], colors: [C.denim, C.negro], stock: 10, rating: 4.6, likes: 156, fit: "Oversize" }),
  base({ id: "13", name: "Bikini Tropical", price: "S/ 39.99", category: "Swim", sizes: ["XS", "S", "M", "L"], colors: [C.coral, C.fucsia], stock: 6, rating: 4.7, likes: 189, fit: "Fit" }),
  base({ id: "14", name: "Legging Power Active", price: "S/ 34.99", category: "Active", sizes: ["XS", "S", "M", "L"], colors: [C.negro, C.fucsia], stock: 18, rating: 4.5, likes: 134, fit: "Fit" }),
  base({ id: "15", name: "Bolso Tejido Playa", price: "S/ 29.99", category: "Accesorios", sizes: ["Único"], colors: [C.dorado, C.coral], stock: 14, rating: 4.2, likes: 47, fit: "Regular" }),
  base({ id: "16", name: "Collar Flor Dorado", price: "S/ 15.99", category: "Accesorios", sizes: ["Único"], colors: [C.dorado], stock: 25, rating: 4.3, likes: 33, fit: "Regular" }),
  base({ id: "17", name: "Top Crop Oversize", price: "S/ 27.99", category: "Tops", sizes: ["S", "M", "L"], colors: [C.negro, C.blanco, C.coral], stock: 13, rating: 4.1, likes: 61, fit: "Oversize" }),
  base({ id: "18", name: "Short Cargo Rosa", price: "S/ 32.99", category: "Shorts", sizes: ["XS", "S", "M", "L"], colors: [C.rosa, C.negro], stock: 9, rating: 4.0, likes: 52, fit: "Regular" }),
  base({ id: "19", name: "Vestido Verano Coral", price: "S/ 54.99", category: "Novedades", sizes: ["S", "M", "L"], colors: [C.coral, C.dorado], stock: 7, rating: 4.8, likes: 175, fit: "Regular" }),
  base({ id: "20", name: "Sudadera Suave Nube", price: "S/ 49.99", category: "Sale", sizes: ["S", "M", "L", "XL"], colors: [C.rosa, C.blanco], stock: 5, rating: 4.4, likes: 93, fit: "Oversize" }),
];

export const CATEGORIES = ["Tops", "Shorts", "Denim", "Active", "Accesorios", "Swim", "Sale", "Novedades"];

export function categoryImage(_category: string): string {
  return COMMON_IMAGE;
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
