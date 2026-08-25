import { absoluteUrl, brand } from "@workspace/brand";
import { SITE_URL } from "./seo";
import { priceToNumber, productPath, productStock, type Product } from "./product";

// JSON-LD builders. Structured data is the one part of SEO that is a contract rather than a
// suggestion: schema.org defines the field names and Google validates them, so these shapes
// are not free-form and should be changed against the spec, not by taste.
//
// Every URL here is absolute because schema.org requires it, which is also why nothing in
// this file is emitted when no origin is configured (see useSeo).

/** ISO 4217 for the Peruvian sol. Prices are stored and displayed gross — audit §2.4. */
const CURRENCY = "PEN";

export function organizationJsonLd(): object {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: brand.name,
    slogan: brand.tagline,
    url: SITE_URL,
    logo: absoluteUrl(SITE_URL, brand.storefront.appleTouchIcon),
  };
}

/**
 * Declares the site search endpoint so a search result can offer a search box for the
 * store. `search?q=` must stay in step with the real route in App.tsx.
 */
export function webSiteJsonLd(): object {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: brand.storefront.title,
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbJsonLd(trail: readonly { name: string; path: string }[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: step.name,
      item: absoluteUrl(SITE_URL, step.path),
    })),
  };
}

export function productJsonLd(product: Product): object {
  const url = absoluteUrl(SITE_URL, productPath(product.slug));
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.details || undefined,
    image: product.images,
    sku: product.id,
    category: product.category,
    brand: { "@type": "Brand", name: brand.name },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: CURRENCY,
      price: priceToNumber(product.price).toFixed(2),
      // Real stock, not a hardcoded InStock. Advertising availability a shop cannot honour
      // is how a listing earns a manual action, and it is a consumer-protection problem
      // before it is an SEO one.
      availability:
        productStock(product) > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  };
}
