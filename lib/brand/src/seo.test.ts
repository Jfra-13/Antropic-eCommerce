import { describe, expect, it } from "vitest";
import { absoluteUrl, resolveSiteUrl, robotsTxt } from "./index.ts";
import { brand } from "./brand.ts";

// The public origin decides three things at once — canonical tags, the sitemap and whether
// the site is crawlable at all — so the rules for resolving it are worth pinning down. Every
// bug this suite guards against is silent: nothing crashes when a canonical points at the
// wrong host, it just quietly ranks the wrong deployment.

describe("resolveSiteUrl", () => {
  it("prefers the environment override so a preview declares itself canonical", () => {
    expect(resolveSiteUrl("https://staging.example")).toBe("https://staging.example");
  });

  it("strips a trailing slash, which would otherwise produce '//producto/x'", () => {
    expect(resolveSiteUrl("https://staging.example/")).toBe("https://staging.example");
  });

  it("falls back to the brand value when the override is absent or blank", () => {
    expect(resolveSiteUrl(undefined)).toBe(brand.siteUrl);
    expect(resolveSiteUrl("   ")).toBe(brand.siteUrl);
  });
});

describe("absoluteUrl", () => {
  it("returns null without an origin, so callers cannot emit a relative canonical", () => {
    expect(absoluteUrl(null, "/faq")).toBeNull();
  });

  it("joins exactly one slash", () => {
    expect(absoluteUrl("https://t.example", "/faq")).toBe("https://t.example/faq");
    expect(absoluteUrl("https://t.example", "faq")).toBe("https://t.example/faq");
  });
});

describe("robotsTxt", () => {
  it("disallows everything when no origin is configured", () => {
    // A deployment that cannot state its own address must not be indexed under whichever
    // one it happens to answer on. This is the conservative half of the trade and the
    // reason a forgotten brand.siteUrl cannot silently leak a staging copy into Google.
    const txt = robotsTxt({ siteUrl: null, disallow: ["/cart"] });
    expect(txt).toContain("Disallow: /");
    expect(txt).not.toContain("Sitemap:");
  });

  it("lists the disallowed paths and points at the sitemap once an origin exists", () => {
    const txt = robotsTxt({ siteUrl: "https://t.example", disallow: ["/cart", "/checkout"] });
    expect(txt).toContain("Disallow: /cart");
    expect(txt).toContain("Disallow: /checkout");
    expect(txt).toContain("Sitemap: https://t.example/sitemap.xml");
    // The blanket disallow must NOT survive into the configured case: one stray line here
    // would delist the entire shop, and robots.txt is not something anyone reads twice.
    expect(txt.split("\n")).not.toContain("Disallow: /");
  });

  it("keeps a blanket disallow blanket, and silent about the sitemap", () => {
    // The backoffice. Publishing a domain must not open it up, and it must not point at the
    // storefront's sitemap: a robots.txt that says "do not index me, and here is a list of
    // pages" is a contradiction served to a crawler.
    const txt = robotsTxt({ siteUrl: "https://t.example", disallow: ["/"] });
    expect(txt.split("\n")).toContain("Disallow: /");
    expect(txt).not.toContain("Sitemap:");
  });

  it("never emits the Libro de Reclamaciones as disallowed in the storefront policy", () => {
    // Ley 29571 requires it to be publicly reachable; being findable is part of complying.
    const txt = robotsTxt({
      siteUrl: "https://t.example",
      disallow: ["/cart", "/checkout", "/profile", "/orders/", "/favorites", "/login"],
    });
    expect(txt).not.toContain("/libro-de-reclamaciones");
  });
});
