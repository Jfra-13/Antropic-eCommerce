import { describe, it, expect, beforeEach } from "vitest";
import { db, categories, products } from "@workspace/db";
import { eq } from "drizzle-orm";
import { buildSitemap } from "./service";
import { resetDatabase } from "../../test/db";

// Fase 7b (auditoría §8.1). Against real Postgres because the whole job of this endpoint is
// "say what is in the catalogue right now": a mocked catalogue would only prove that the
// XML template renders, which was never the part at risk.

const ORIGIN = "https://tienda.example";

async function seedProduct(slug: string, active: boolean): Promise<void> {
  const [category] = await db
    .insert(categories)
    .values({ name: `Cat ${slug}`, slug: `cat-${slug}` })
    .returning({ id: categories.id });
  await db
    .insert(products)
    .values({ name: `Producto ${slug}`, slug, price: "50.00", categoryId: category!.id, active });
}

function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
}

describe("sitemap", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("lists active products and every public static route", async () => {
    await seedProduct("vestido-lino", true);
    const xml = await buildSitemap(ORIGIN);
    const found = locs(xml);

    expect(found).toContain(`${ORIGIN}/product/vestido-lino`);
    expect(found).toContain(`${ORIGIN}/`);
    expect(found).toContain(`${ORIGIN}/search`);
    // Legally required to be publicly reachable, so it is deliberately crawlable (§2.1).
    expect(found).toContain(`${ORIGIN}/libro-de-reclamaciones`);
  });

  it("omits inactive products, which answer 404 and would poison the whole document", async () => {
    await seedProduct("descatalogado", false);
    await seedProduct("a-la-venta", true);

    const found = locs(await buildSitemap(ORIGIN));
    expect(found).toContain(`${ORIGIN}/product/a-la-venta`);
    expect(found).not.toContain(`${ORIGIN}/product/descatalogado`);
  });

  it("never lists a private route", async () => {
    // The counterpart of the robots.txt disallow list. A sitemap that advertises the cart
    // contradicts the robots policy, and a crawler resolves that contradiction its own way.
    const found = locs(await buildSitemap(ORIGIN));
    for (const path of ["/cart", "/checkout", "/profile", "/login", "/favorites"]) {
      expect(found).not.toContain(`${ORIGIN}${path}`);
    }
  });

  it("emits a lastmod date per product, which is what tells a crawler to come back", async () => {
    await seedProduct("polo-basico", true);
    const xml = await buildSitemap(ORIGIN);
    const entry = xml.split("<url>").find((block) => block.includes("polo-basico"))!;
    expect(entry).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  });

  it("survives a slug with an ampersand: encoded URL, well-formed document", async () => {
    // Slugs are typed by hand in the backoffice and nothing sanitises them, so "&" is
    // possible. Two separate jobs, both required: percent-encoding keeps the URL pointing at
    // the product (a raw "&" ends the path), and the document must stay well-formed, because
    // a crawler rejects the whole file rather than the one bad entry.
    //
    // Found in a browser, not in a typecheck: the canonical tag rendered as
    // https://tienda.example/product/blusa&rayas, which resolves to nothing.
    await seedProduct("blusa-rayas", true);
    await db.update(products).set({ slug: "blusa&rayas" }).where(eq(products.slug, "blusa-rayas"));

    const xml = await buildSitemap(ORIGIN);
    expect(locs(xml)).toContain(`${ORIGIN}/product/blusa%26rayas`);
    // Every "&" in the document must open a character entity. Checked directly rather than
    // through an optional parser: Node ships no XML parser, and a test that silently skips
    // its only assertion when an import fails is worse than no test.
    expect(xml).not.toMatch(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/);
  });
});
