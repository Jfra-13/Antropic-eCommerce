import type { Plugin } from "vite";
import { brand, webManifest } from "./index.ts";
import type { BrandDocument } from "./types.ts";

// The HTML shell is the one place brand identity has to exist *before* any JavaScript runs:
// the tab title, the favicon, the link preview a customer sees in WhatsApp. A static
// index.html would therefore be a second home for the brand name, and the two would drift.
//
// This plugin injects the whole head from lib/brand instead, so each artifact's index.html
// carries structure only. It also emits manifest.webmanifest, which no artifact ships as a
// checked-in file for the same reason.

const MANIFEST_FILE = "manifest.webmanifest";

export function brandHtmlPlugin(doc: BrandDocument): Plugin {
  const manifest = webManifest(doc);

  return {
    name: "brand-html",

    transformIndexHtml: {
      // `pre` so the injected tags land before Vite's own asset injection, keeping the
      // charset/viewport meta first in the document as browsers expect.
      order: "pre",
      handler(html: string) {
        return {
          html: html.replace(/<html\s+lang="[^"]*"/, `<html lang="${doc.lang}"`),
          tags: [
            { tag: "title", children: doc.title, injectTo: "head" as const },
            meta("description", doc.description),
            meta("theme-color", doc.themeColor),
            og("og:title", doc.title),
            og("og:description", doc.description),
            og("og:type", "website"),
            ...(doc.ogImage ? [og("og:image", doc.ogImage)] : []),
            meta("twitter:card", doc.ogImage ? "summary_large_image" : "summary"),
            meta("twitter:title", doc.title),
            meta("twitter:description", doc.description),
            {
              tag: "link",
              attrs: { rel: "icon", type: "image/png", sizes: "32x32", href: doc.favicon },
              injectTo: "head" as const,
            },
            {
              tag: "link",
              attrs: { rel: "apple-touch-icon", sizes: "180x180", href: doc.appleTouchIcon },
              injectTo: "head" as const,
            },
            {
              tag: "link",
              attrs: { rel: "manifest", href: `/${MANIFEST_FILE}` },
              injectTo: "head" as const,
            },
          ],
        };
      },
    },

    // Dev has no build output to emit into, so the manifest is served from memory.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || new URL(req.url, "http://localhost").pathname !== `/${MANIFEST_FILE}`) {
          return next();
        }
        res.setHeader("Content-Type", "application/manifest+json");
        res.end(manifest);
      });
    },

    generateBundle() {
      this.emitFile({ type: "asset", fileName: MANIFEST_FILE, source: manifest });
    },
  };
}

function meta(name: string, content: string) {
  return { tag: "meta", attrs: { name, content }, injectTo: "head" as const };
}

function og(property: string, content: string) {
  return { tag: "meta", attrs: { property, content }, injectTo: "head" as const };
}

/** Re-exported so a Vite config needs one import to reach both the values and the plugin. */
export { brand };
