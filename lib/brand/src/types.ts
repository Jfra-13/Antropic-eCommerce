// Shape of the brand identity. Kept apart from the values themselves so that a clone edits
// exactly one file (`brand.ts`) and the compiler tells it when a field is missing.

/** Everything the HTML shell needs before React has booted. */
export type BrandDocument = {
  /** `<title>` and the Open Graph / Twitter title. */
  title: string;
  /** `<meta name="description">` and the Open Graph / Twitter description. */
  description: string;
  /** `<html lang>`. */
  lang: string;
  /** Path under `public/`, served at the site root. */
  favicon: string;
  /** Path under `public/`. Also the PWA icon. */
  appleTouchIcon: string;
  /**
   * Path under `public/` for the Open Graph preview image, or null when the brand has none.
   * Null omits the `og:image` tag rather than pointing at a 404 — a broken preview image
   * renders worse in WhatsApp than no image at all.
   */
  ogImage: string | null;
  /** Address bar tint on mobile and `theme_color` in the web app manifest. */
  themeColor: string;
  /** Background the OS paints while a PWA launches, before the first frame. */
  backgroundColor: string;
};

export type Brand = {
  /** Display name in the UI chrome: navbar wordmark, footer, copyright line. */
  name: string;
  /** One or two characters for the collapsed admin sidebar and the manifest `short_name`. */
  shortName: string;
  /** Sits under the wordmark in the storefront footer. */
  tagline: string;
  /**
   * Where the store delivers, as the customer reads it in checkout copy
   * ("Dirección de envío (La Molina)"). The shipping *tariff* is business configuration and
   * lives in `settings`; this is only the label, and it is deployment-scoped because a second
   * brand will almost certainly cover a different district.
   */
  deliveryZone: string;
  /**
   * Prefix of the human-readable order reference the customer writes in the Yape note
   * (`ANT-000123`). Both sides of the round trip read it from here: `orderReference()`
   * builds it and `parseOrderReference()` — used by the backoffice order search — strips it.
   *
   * MUST NOT change once a deployment has taken its first order — every reference already
   * printed on a receipt, sitting in a Yape history or quoted in a complaint would stop
   * resolving. It is safe to choose freely for a new brand, before go-live, and only then.
   */
  orderReferencePrefix: string;
  storefront: BrandDocument;
  admin: BrandDocument;
  email: {
    /**
     * Header band and button fill of transactional email, as a hex string.
     *
     * This is the ONE legitimate duplicate of the brand colour. Email clients strip
     * stylesheets, so the templates inline their colours and cannot read the HSL tokens in
     * `src/index.css` that drive the web UI. The two must be changed together: a rebrand that
     * only touches `index.css` leaves every email in the old palette.
     */
    headerColor: string;
    /** Closing line of the order email, after the brand name. */
    signOff: string;
  };
};
