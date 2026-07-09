// Seeds the catalog (categories, occasions, products, size×color variants, media,
// product↔occasion links) from the storefront's original mock data, so Phase 2 can
// validate the DB → API → front pipeline against real rows.
//
// Idempotent: wipes catalog tables in FK-safe order, then re-inserts. Media stores
// placeholder keys ("corcet_blanco", "modelo_01/02") that the storefront maps to
// bundled assets until real photography lands in Supabase Storage.
//
// Run: pnpm --filter @workspace/scripts run seed
import {
  db,
  pool,
  categories,
  occasions,
  products,
  productVariants,
  productMedia,
  productOccasions,
} from "@workspace/db";

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const DEFAULT_DETAILS =
  "Confeccionada con materiales suaves y de alta calidad, esta pieza combina comodidad y estilo para tu día a día. Diseño versátil pensado para acompañarte en cualquier ocasión y realzar tu look con la esencia ANTROPIC.";

const CATEGORY_NAMES = [
  "Tops",
  "Shorts",
  "Denim",
  "Active",
  "Accesorios",
  "Swim",
  "Sale",
  "Novedades",
];

const OCCASION_NAMES = ["Casual", "Fiesta", "Oficina", "Playa", "Deporte"];

type SeedProduct = {
  name: string;
  price: string; // "S/ 29.99"
  category: string;
  sizes: string[];
  colors: string[];
  stock: number;
  fit: string;
  occasion?: string[];
  badge?: "nuevo" | "mas-vendido";
  soldOutSizes?: string[];
};

const SEED_PRODUCTS: SeedProduct[] = [
  { name: "Top Margarita Rosa", price: "S/ 29.99", category: "Tops", sizes: ["XS", "S", "M", "L"], colors: ["Rosa", "Blanco", "Fucsia"], stock: 12, fit: "Fit", badge: "nuevo" },
  { name: "Shorts Denim Clásico", price: "S/ 39.99", category: "Shorts", sizes: ["S", "M", "L", "XL"], colors: ["Denim", "Negro"], stock: 8, fit: "Regular", badge: "mas-vendido" },
  { name: "Vestido Floral Verano", price: "S/ 49.99", category: "Swim", sizes: ["XS", "S", "M"], colors: ["Rosa", "Coral"], stock: 5, fit: "Regular", occasion: ["Fiesta", "Playa"], soldOutSizes: ["XS"] },
  { name: "Top Deportivo Coral", price: "S/ 24.99", category: "Active", sizes: ["S", "M", "L"], colors: ["Coral", "Negro", "Fucsia"], stock: 20, fit: "Fit", occasion: ["Deporte"] },
  { name: "Camiseta Básica Sol", price: "S/ 19.99", category: "Tops", sizes: ["XS", "S", "M", "L", "XL"], colors: ["Blanco", "Dorado", "Negro"], stock: 30, fit: "Regular", badge: "mas-vendido" },
  { name: "Chaqueta Denim Ligera", price: "S/ 59.99", category: "Denim", sizes: ["S", "M", "L"], colors: ["Denim"], stock: 6, fit: "Oversize", occasion: ["Casual", "Oficina"] },
  { name: "Top Floral 50% Off", price: "S/ 14.99", category: "Sale", sizes: ["XS", "S", "M"], colors: ["Rosa", "Coral"], stock: 4, fit: "Fit" },
  { name: "Shorts Coral Oferta", price: "S/ 19.99", category: "Sale", sizes: ["S", "M", "L"], colors: ["Coral", "Denim"], stock: 7, fit: "Regular" },
  { name: "Camiseta Nueva Temporada", price: "S/ 25.99", category: "Novedades", sizes: ["S", "M", "L", "XL"], colors: ["Blanco", "Rosa"], stock: 15, fit: "Oversize", badge: "nuevo" },
  { name: "Falda Plisada Verano", price: "S/ 34.99", category: "Novedades", sizes: ["XS", "S", "M", "L"], colors: ["Dorado", "Rosa"], stock: 9, fit: "Regular", occasion: ["Oficina", "Fiesta"], badge: "nuevo" },
  { name: "Blusa Satinada Perla", price: "S/ 44.99", category: "Tops", sizes: ["S", "M", "L"], colors: ["Blanco", "Rosa"], stock: 11, fit: "Slim", occasion: ["Oficina", "Fiesta"] },
  { name: "Jeans Mom Fit", price: "S/ 69.99", category: "Denim", sizes: ["S", "M", "L", "XL"], colors: ["Denim", "Negro"], stock: 10, fit: "Oversize", badge: "mas-vendido" },
  { name: "Bikini Tropical", price: "S/ 39.99", category: "Swim", sizes: ["XS", "S", "M", "L"], colors: ["Coral", "Fucsia"], stock: 6, fit: "Fit", occasion: ["Playa"] },
  { name: "Legging Power Active", price: "S/ 34.99", category: "Active", sizes: ["XS", "S", "M", "L"], colors: ["Negro", "Fucsia"], stock: 18, fit: "Fit", occasion: ["Deporte"] },
  { name: "Bolso Tejido Playa", price: "S/ 29.99", category: "Accesorios", sizes: ["Único"], colors: ["Dorado", "Coral"], stock: 14, fit: "Regular", occasion: ["Playa", "Casual"] },
  { name: "Collar Flor Dorado", price: "S/ 15.99", category: "Accesorios", sizes: ["Único"], colors: ["Dorado"], stock: 25, fit: "Regular", occasion: ["Fiesta", "Casual"] },
  { name: "Top Crop Oversize", price: "S/ 27.99", category: "Tops", sizes: ["S", "M", "L"], colors: ["Negro", "Blanco", "Coral"], stock: 13, fit: "Oversize" },
  { name: "Short Cargo Rosa", price: "S/ 32.99", category: "Shorts", sizes: ["XS", "S", "M", "L"], colors: ["Rosa", "Negro"], stock: 9, fit: "Regular", soldOutSizes: ["L"] },
  { name: "Vestido Verano Coral", price: "S/ 54.99", category: "Novedades", sizes: ["S", "M", "L"], colors: ["Coral", "Dorado"], stock: 7, fit: "Regular", occasion: ["Fiesta", "Oficina"], badge: "nuevo" },
  { name: "Sudadera Suave Nube", price: "S/ 49.99", category: "Sale", sizes: ["S", "M", "L", "XL"], colors: ["Rosa", "Blanco"], stock: 5, fit: "Oversize" },
];

async function main() {
  // Wipe in FK-safe order (children before parents).
  await db.delete(productOccasions);
  await db.delete(productMedia);
  await db.delete(productVariants);
  await db.delete(products);
  await db.delete(occasions);
  await db.delete(categories);

  const catRows = await db
    .insert(categories)
    .values(CATEGORY_NAMES.map((name, i) => ({ name, slug: slugify(name), sortOrder: i })))
    .returning();
  const catBySlug = new Map(catRows.map((c) => [c.slug, c]));

  const occRows = await db
    .insert(occasions)
    .values(OCCASION_NAMES.map((name, i) => ({ name, slug: slugify(name), sortOrder: i })))
    .returning();
  const occBySlug = new Map(occRows.map((o) => [o.slug, o]));

  for (const [index, p] of SEED_PRODUCTS.entries()) {
    const slug = slugify(p.name);
    const category = catBySlug.get(slugify(p.category));
    if (!category) throw new Error(`Unknown category "${p.category}" for "${p.name}"`);

    const [product] = await db
      .insert(products)
      .values({
        name: p.name,
        slug,
        description: DEFAULT_DETAILS,
        fit: p.fit,
        price: p.price.replace(/[^0-9.]/g, ""),
        categoryId: category.id,
        badge: p.badge ?? null,
        featured: p.badge === "mas-vendido",
      })
      .returning();

    // Distribute stock evenly per size, mirroring the old mock's per-size split;
    // every color of a size gets that stock (0 if the size is sold out).
    const per = p.sizes.length > 0 ? Math.max(1, Math.round(p.stock / p.sizes.length)) : 0;
    const variantValues = p.sizes.flatMap((size) =>
      p.colors.map((color) => ({
        productId: product.id,
        size,
        color,
        sku: `${slug}-${slugify(size)}-${slugify(color)}`.toUpperCase(),
        stock: p.soldOutSizes?.includes(size) ? 0 : per,
      })),
    );
    if (variantValues.length > 0) await db.insert(productVariants).values(variantValues);

    // Primary + hover placeholder shots (front maps keys → bundled assets).
    const hover = index % 2 === 0 ? "modelo_01" : "modelo_02";
    await db.insert(productMedia).values([
      { productId: product.id, kind: "image", storagePath: "corcet_blanco", sortOrder: 0 },
      { productId: product.id, kind: "image", storagePath: hover, sortOrder: 1 },
    ]);

    const occ = (p.occasion ?? ["Casual"])
      .map((o) => occBySlug.get(slugify(o)))
      .filter((o): o is NonNullable<typeof o> => o !== undefined);
    if (occ.length > 0) {
      await db
        .insert(productOccasions)
        .values(occ.map((o) => ({ productId: product.id, occasionId: o.id })));
    }
  }

  console.log(
    `Seeded ${catRows.length} categories, ${occRows.length} occasions, ${SEED_PRODUCTS.length} products.`,
  );
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
