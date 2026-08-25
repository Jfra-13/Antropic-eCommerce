import { brand } from "./brand.ts";
import type { Brand, BrandDocument } from "./types.ts";

export type { Brand, BrandDocument };
export { brand };

// --- Validation --------------------------------------------------------------
//
// Runs at import, the same way lib/env.ts validates the environment at startup: a clone that
// forgot to fill a field should find out from a failed build, not from a customer looking at
// a page titled "undefined". Every consumer imports this module, and the Vite configs import
// it too, so there is no build that skips the check. All problems are reported at once —
// fixing one field per build is a miserable loop.

function checkDocument(label: string, doc: BrandDocument, problems: string[]): void {
  const nonEmpty: (keyof BrandDocument)[] = [
    "title",
    "description",
    "lang",
    "favicon",
    "appleTouchIcon",
    "themeColor",
    "backgroundColor",
  ];
  for (const key of nonEmpty) {
    if (typeof doc[key] !== "string" || doc[key].trim() === "") {
      problems.push(`${label}.${key} must be a non-empty string`);
    }
  }
  for (const key of ["favicon", "appleTouchIcon"] as const) {
    if (typeof doc[key] === "string" && !doc[key].startsWith("/")) {
      problems.push(`${label}.${key} must be a root-relative path under public/ (start with "/")`);
    }
  }
  if (doc.ogImage !== null && !doc.ogImage.startsWith("/")) {
    problems.push(`${label}.ogImage must be null or a root-relative path under public/`);
  }
  for (const key of ["themeColor", "backgroundColor"] as const) {
    if (!/^#[0-9a-fA-F]{6}$/.test(doc[key])) {
      problems.push(`${label}.${key} must be a 6-digit hex colour, got "${doc[key]}"`);
    }
  }
}

function validate(b: Brand): void {
  const problems: string[] = [];

  for (const key of ["name", "shortName", "tagline", "deliveryZone"] as const) {
    if (typeof b[key] !== "string" || b[key].trim() === "") {
      problems.push(`brand.${key} must be a non-empty string`);
    }
  }
  // Letters and digits only: the prefix ends up in a URL-ish reference the customer retypes
  // into a Yape note, and the backoffice search strips it with a regex.
  if (!/^[A-Z0-9]{2,6}$/.test(b.orderReferencePrefix)) {
    problems.push(
      `brand.orderReferencePrefix must be 2-6 uppercase letters or digits, got "${b.orderReferencePrefix}"`,
    );
  }
  // https only, no trailing slash, no path: every consumer concatenates a root-relative
  // path onto it, so a stray slash produces "//producto/x" and a path segment produces a
  // canonical that points at the wrong place. Rejecting it here beats debugging it in
  // Search Console three weeks after launch.
  if (b.siteUrl !== null) {
    if (!/^https:\/\/[^/\s?#]+$/.test(b.siteUrl)) {
      problems.push(
        `brand.siteUrl must be null or an https origin with no trailing slash or path, got "${b.siteUrl}"`,
      );
    }
  }
  checkDocument("brand.storefront", b.storefront, problems);
  checkDocument("brand.admin", b.admin, problems);
  if (!/^#[0-9a-fA-F]{6}$/.test(b.email.headerColor)) {
    problems.push(`brand.email.headerColor must be a 6-digit hex colour, got "${b.email.headerColor}"`);
  }
  if (b.email.signOff.trim() === "") {
    problems.push("brand.email.signOff must be a non-empty string");
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid brand configuration in lib/brand/src/brand.ts:\n${problems.map((p) => `  - ${p}`).join("\n")}`,
    );
  }
}

validate(brand);

// --- Order reference ---------------------------------------------------------

/**
 * The reference the customer writes in the Yape note, derived from the serial order number
 * and never stored (planeación §5.5).
 */
export function orderReference(orderNumber: number): string {
  return `${brand.orderReferencePrefix}-${orderNumber}`;
}

/**
 * Inverse of `orderReference`, for the backoffice order search: accepts "123", "ANT-123" or
 * "ant123" and returns the order number, or null when the term is not a reference at all.
 *
 * Lives next to the builder on purpose. These two drifted apart is exactly the failure the
 * brand module exists to prevent: a prefix changed in one place and order lookup silently
 * stops finding anything.
 */
export function parseOrderReference(term: string): number | null {
  const stripped = term
    .trim()
    .replace(new RegExp(`^${brand.orderReferencePrefix}-?`, "i"), "");
  if (!/^\d+$/.test(stripped)) return null;
  const n = Number.parseInt(stripped, 10);
  return Number.isSafeInteger(n) ? n : null;
}

// --- Web app manifest --------------------------------------------------------

/**
 * The `manifest.webmanifest` document, built from the brand rather than checked in per
 * artifact so that the name on a phone's home screen cannot drift from the name in the app.
 */
export function webManifest(doc: BrandDocument): string {
  return JSON.stringify(
    {
      name: doc.title,
      short_name: brand.shortName,
      description: doc.description,
      start_url: "/",
      display: "standalone",
      lang: doc.lang,
      theme_color: doc.themeColor,
      background_color: doc.backgroundColor,
      icons: [
        { src: doc.favicon, sizes: "32x32", type: "image/png" },
        { src: doc.appleTouchIcon, sizes: "180x180", type: "image/png" },
      ],
    },
    null,
    2,
  );
}

// --- Public origin and SEO assets --------------------------------------------

/**
 * The origin to build canonical URLs from: the environment override when present, the brand
 * value otherwise, and null when neither is set.
 *
 * The override exists so a staging or preview deployment can declare *itself* canonical
 * instead of pointing search engines at production — the classic way a preview build ends
 * up indexed in place of the real shop.
 */
export function resolveSiteUrl(override?: string | null | undefined): string | null {
  const raw = (override ?? "").trim();
  if (raw !== "") return raw.replace(/\/+$/, "");
  return brand.siteUrl;
}

/** Absolute URL for a root-relative path, or null when no origin is configured. */
export function absoluteUrl(siteUrl: string | null, path: string): string | null {
  if (!siteUrl) return null;
  return `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * `robots.txt`, generated rather than checked in for the same reason as the manifest: the
 * `Sitemap:` line carries the origin, and a checked-in copy would be a second place holding
 * a value that only lib/brand is supposed to know.
 *
 * With no origin configured the whole site is disallowed. That is the conservative side of
 * the trade: a deployment that cannot state its own address should not be indexed under
 * whatever address it happens to answer on. Publishing the domain flips it in one edit.
 */
export function robotsTxt(options: { siteUrl: string | null; disallow: readonly string[] }): string {
  const { siteUrl, disallow } = options;

  // A blanket disallow is a decision about the artifact, not about the environment: the
  // backoffice is never indexable, with or without a domain, and it must not advertise the
  // storefront's sitemap either. Checked before the origin so that configuring a domain
  // cannot accidentally open it up.
  if (disallow.includes("/")) {
    return [
      "# Never indexed. This artifact is not a public site.",
      "User-agent: *",
      "Disallow: /",
      "",
    ].join("\n");
  }

  if (!siteUrl) {
    return [
      "# No public origin configured (brand.siteUrl / VITE_PUBLIC_SITE_URL).",
      "# Nothing is indexable until the domain is published — see docs/SEO.md.",
      "User-agent: *",
      "Disallow: /",
      "",
    ].join("\n");
  }
  return [
    "User-agent: *",
    ...disallow.map((path) => `Disallow: ${path}`),
    "",
    `Sitemap: ${siteUrl}/sitemap.xml`,
    "",
  ].join("\n");
}
