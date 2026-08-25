import type { Brand } from "./types.ts";

// ============================================================================
//  THE ONLY FILE A CLONE HAS TO EDIT TO CHANGE WHO THE STORE IS.
// ============================================================================
//
// This codebase is forked per brand (separate repo, separate database — see
// docs/AUDITORIA.md §10). Anything brand-specific left inline in a component becomes a
// find-replace hunt in every clone, and a hunt that is repeated is a hunt that is eventually
// done badly. So the rule is: brand identity is data, and it lives here.
//
// What belongs here vs. in the database:
//
//   HERE       Identity fixed for the life of a deployment, and needed either at build time
//              (the `<title>`, the favicon, the manifest — the HTML shell ships before the
//              API is ever called) or in a place the admin panel cannot reach (email
//              templates, the order reference prefix).
//
//   settings   Identity the business must be able to correct without a deploy: razón social,
//              RUC, domicilio fiscal, contact channels, legal texts, banners, hero, FAQ.
//              Those are edited in the backoffice; see modules/config/service.ts. Legal
//              identity in particular MUST stay there — a company that cannot fix its own
//              fiscal address without a developer will ship an incorrect Hoja de Reclamación.
//
// Changing the values below is a full rebrand except for the two things a text file cannot
// carry: the image assets in each artifact's `public/` folder, and the HSL colour tokens in
// each artifact's `src/index.css`. docs/CLONACION.md walks the whole procedure in order.

export const brand: Brand = {
  name: "Antropic",
  shortName: "A",
  tagline: "Moda que te hace brillar.",
  deliveryZone: "La Molina",
  orderReferencePrefix: "ANT",

  // No domain published yet. Set it to the real origin (no trailing slash) before launch:
  // until then the storefront is deliberately not indexable. See types.ts for what depends
  // on it, and docs/SEO.md §1 for the one-line change and how to verify it.
  siteUrl: null,

  storefront: {
    title: "ANTROPIC Store",
    description: "Tienda de moda ANTROPIC.",
    lang: "es",
    favicon: "/favicon.png",
    appleTouchIcon: "/apple-touch-icon.png",
    ogImage: "/opengraph.jpg",
    themeColor: "#EA4C75",
    backgroundColor: "#FFFFFF",
  },

  admin: {
    title: "ANTROPIC · Backoffice",
    description: "Panel de administración.",
    lang: "es",
    favicon: "/favicon.png",
    appleTouchIcon: "/apple-touch-icon.png",
    // The backoffice is noindex and never shared as a link; an OG image would be dead weight.
    ogImage: null,
    themeColor: "#0F172A",
    backgroundColor: "#F1F5F9",
  },

  email: {
    headerColor: "#EA4C75",
    signOff: "Gracias por confiar en nosotros. Si tienes dudas, responde este correo.",
  },
};
