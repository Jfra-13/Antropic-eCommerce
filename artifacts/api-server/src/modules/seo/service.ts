import { eq, sql } from "drizzle-orm";
import { db, products } from "@workspace/db";
import { absoluteUrl, resolveSiteUrl } from "@workspace/brand";
import { env } from "../../lib/env";

// The sitemap is generated from the catalogue on request, not built into the frontend.
// docs/SEO.md §3 has the reasoning and the edge rewrite that puts it on the storefront
// origin, which is where a crawler expects to find it.

/**
 * The origin every URL in the document is built from: the deployment's `STORE_URL` when
 * set, the brand's own `siteUrl` otherwise.
 *
 * Same rule as the storefront's `resolveSiteUrl(VITE_PUBLIC_SITE_URL)`, on purpose. Two
 * places deciding what the site's address is would eventually disagree, and the sitemap
 * disagreeing with the canonical tags is precisely the conflict that makes a search engine
 * distrust both.
 */
export function siteUrl(): string | null {
  return resolveSiteUrl(env.STORE_URL);
}

/**
 * Routes worth crawling, with the priority hints a crawler treats as a hint and nothing
 * more. Private routes are absent for the same reason they are disallowed in robots.txt.
 *
 * `/libro-de-reclamaciones` is listed deliberately: it is legally required to be publicly
 * reachable, so making it findable is part of complying, not an SEO nicety.
 */
const STATIC_ROUTES: readonly { path: string; changefreq: string; priority: string }[] = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/search", changefreq: "daily", priority: "0.9" },
  { path: "/faq", changefreq: "monthly", priority: "0.5" },
  { path: "/devoluciones", changefreq: "monthly", priority: "0.5" },
  { path: "/recojo", changefreq: "monthly", priority: "0.5" },
  { path: "/libro-de-reclamaciones", changefreq: "yearly", priority: "0.5" },
  { path: "/privacidad", changefreq: "yearly", priority: "0.3" },
  { path: "/terminos", changefreq: "yearly", priority: "0.3" },
  { path: "/cookies", changefreq: "yearly", priority: "0.3" },
];

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function urlEntry(loc: string, lastmod: string | null, changefreq: string, priority: string): string {
  return [
    "  <url>",
    `    <loc>${escapeXml(loc)}</loc>`,
    ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []),
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    "  </url>",
  ].join("\n");
}

/**
 * Builds the sitemap document for a given origin.
 *
 * The origin is a parameter rather than something this function reads for itself: the
 * environment module is parsed once at import and cannot be reconfigured mid-process, so a
 * test that set STORE_URL would be testing nothing (the trap that produced a green,
 * meaningless test case in phase 7 — audit §11.7). Resolving it at the router keeps the
 * environment read at the edge and leaves this function honest about its inputs.
 *
 * Inactive products are excluded rather than listed: `active` is this catalogue's soft
 * delete, and submitting a URL that answers 404 teaches a crawler to trust the document
 * less — including the entries that are still good.
 */
export async function buildSitemap(origin: string): Promise<string> {
  const rows = await db
    .select({ slug: products.slug, updatedAt: products.updatedAt })
    .from(products)
    .where(eq(products.active, true))
    .orderBy(sql`${products.updatedAt} desc nulls last`);

  const entries = [
    ...STATIC_ROUTES.map((route) =>
      urlEntry(absoluteUrl(origin, route.path)!, null, route.changefreq, route.priority),
    ),
    ...rows.map((row) =>
      urlEntry(
        // Percent-encoded, then XML-escaped below: two different encodings for two
        // different consumers. A slug is typed by hand in the backoffice, so "&" and
        // spaces are possible, and a raw one produces a URL that resolves to nothing.
        absoluteUrl(origin, `/product/${encodeURIComponent(row.slug)}`)!,
        // W3C date, which is what the sitemap protocol asks for. A product edited today
        // tells a crawler to come back for it ahead of one untouched since launch.
        row.updatedAt ? new Date(row.updatedAt).toISOString().slice(0, 10) : null,
        "weekly",
        "0.8",
      ),
    ),
  ];

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    "</urlset>",
    "",
  ].join("\n");
}
