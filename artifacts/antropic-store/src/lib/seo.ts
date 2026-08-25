import { useEffect } from "react";
import { absoluteUrl, brand, resolveSiteUrl } from "@workspace/brand";

// Per-route document metadata for a client-rendered SPA.
//
// What this buys and what it does not: search engines execute JavaScript, so Google reads
// what this writes and the 12 routes stop sharing one title. Link-preview crawlers
// (WhatsApp, Instagram, Facebook) do NOT execute JavaScript — they read the HTML shell and
// will keep showing the site-level preview for every URL. Fixing that needs pre-rendered
// HTML, which the audit ruled out of scope (§0.2). Nothing here pretends otherwise.
//
// Why no library: react-helmet-async brings a provider, a context and a server-rendering
// story this SPA has no use for. The whole job is "write tags into <head> on route change",
// and owning those 80 lines means the cleanup rules below are explicit instead of implied.

/**
 * The origin canonical URLs are built from, or null when no domain is published.
 *
 * `VITE_PUBLIC_SITE_URL` (per environment) wins over `brand.siteUrl` (per brand) so a
 * staging deployment declares itself canonical instead of pointing crawlers at production.
 */
export const SITE_URL: string | null = resolveSiteUrl(
  (import.meta.env as Record<string, string | undefined>).VITE_PUBLIC_SITE_URL,
);

/** Marks every tag this module owns, so a route change can clear the previous route's. */
const MANAGED = "data-seo";

export type SeoInput = {
  /** Page title without the brand suffix. Omitted on the home page, which is the brand. */
  title?: string;
  description?: string;
  /**
   * Root-relative path for the canonical URL. Omit it on pages that must not be indexed;
   * a canonical on a noindex page sends a crawler two contradictory instructions.
   */
  path?: string;
  /** Root-relative or absolute preview image. Falls back to the brand's. */
  image?: string;
  /** Private or session-only pages: cart, checkout, account, order detail, 404. */
  noindex?: boolean;
  /** JSON-LD documents to publish for this route. */
  jsonLd?: readonly object[];
};

function pageTitle(title: string | undefined): string {
  // The brand suffix is what makes a browser tab and a search result identifiable when the
  // page title alone is a garment name. The separator is the convention, not a decoration.
  return title ? `${title} · ${brand.storefront.title}` : brand.storefront.title;
}

/**
 * Trims free text down to a length a search result will actually show. Google renders about
 * 155–160 characters; a longer description is not penalised, it is simply cut mid-sentence,
 * which reads as sloppy in the one place a customer decides whether to click.
 */
export function metaDescription(text: string | null | undefined, fallback: string): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (clean === "") return fallback;
  if (clean.length <= 155) return clean;
  const cut = clean.slice(0, 155);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 100 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:]$/, "")}…`;
}

function upsertMeta(key: "name" | "property", value: string, content: string): void {
  const selector = `meta[${key}="${value}"]`;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(key, value);
    el.setAttribute(MANAGED, "");
    document.head.appendChild(el);
  }
  // Existing tags injected by the brand plugin are updated in place rather than duplicated:
  // two <meta name="description"> in one document is undefined behaviour for a crawler.
  el.setAttribute("content", content);
}

function upsertCanonical(href: string | null): void {
  const existing = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!href) {
    existing?.remove();
    return;
  }
  const el = existing ?? document.createElement("link");
  el.setAttribute("rel", "canonical");
  el.setAttribute(MANAGED, "");
  el.setAttribute("href", href);
  if (!existing) document.head.appendChild(el);
}

function writeJsonLd(documents: readonly object[]): void {
  for (const el of document.head.querySelectorAll(`script[${MANAGED}-jsonld]`)) el.remove();
  for (const doc of documents) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute(`${MANAGED}-jsonld`, "");
    script.textContent = JSON.stringify(doc);
    document.head.appendChild(script);
  }
}

/**
 * Writes this route's metadata into `<head>`.
 *
 * Every call writes the **full** set, falling back to the brand defaults, rather than only
 * the fields it was given. A partial write would leave the previous route's description
 * sitting under the new route's title, which is worse than no per-route metadata at all
 * because it looks correct.
 */
export function useSeo(input: SeoInput): void {
  const { title, description, path, image, noindex, jsonLd } = input;
  const serializedJsonLd = JSON.stringify(jsonLd ?? []);

  useEffect(() => {
    const resolvedDescription = description ?? brand.storefront.description;
    const canonical = path && !noindex ? absoluteUrl(SITE_URL, path) : null;
    // With no published origin nothing on this deployment should be indexed — the same call
    // robots.txt makes. A crawler that ignores robots.txt still reads this meta.
    const indexable = !noindex && SITE_URL !== null;
    const preview = image ?? brand.storefront.ogImage;
    const previewUrl = preview
      ? (preview.startsWith("http") ? preview : absoluteUrl(SITE_URL, preview)) ?? preview
      : null;

    document.title = pageTitle(title);
    upsertMeta("name", "description", resolvedDescription);
    upsertMeta("name", "robots", indexable ? "index, follow" : "noindex, nofollow");
    upsertMeta("property", "og:title", pageTitle(title));
    upsertMeta("property", "og:description", resolvedDescription);
    upsertMeta("property", "og:type", path === "/" ? "website" : "article");
    upsertMeta("property", "og:site_name", brand.storefront.title);
    upsertMeta("name", "twitter:title", pageTitle(title));
    upsertMeta("name", "twitter:description", resolvedDescription);
    if (canonical) upsertMeta("property", "og:url", canonical);
    if (previewUrl) {
      upsertMeta("property", "og:image", previewUrl);
      upsertMeta("name", "twitter:image", previewUrl);
    }
    upsertCanonical(canonical);
    // JSON-LD is skipped without an origin: its `url` and `@id` fields are absolute by
    // specification, and structured data pointing at a guessed origin is worse than none.
    writeJsonLd(SITE_URL ? (JSON.parse(serializedJsonLd) as object[]) : []);
  }, [title, description, path, image, noindex, serializedJsonLd]);
}
