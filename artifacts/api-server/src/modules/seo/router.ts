import { Router, type IRouter } from "express";
import * as service from "./service";

const router: IRouter = Router();

// Served as XML, not JSON: the sitemap protocol is an XML schema and a crawler will not
// parse anything else. It is public and unauthenticated, like the storefront it describes.
router.get("/sitemap.xml", async (_req, res) => {
  const origin = service.siteUrl();
  if (origin === null) {
    res.status(503).json({
      code: "SITE_URL_NOT_CONFIGURED",
      message:
        "No public site URL is configured (STORE_URL / brand.siteUrl), so no absolute URLs can be emitted.",
    });
    return;
  }
  const document = await service.buildSitemap(origin);
  // A day of caching: the catalogue changes far more slowly than crawlers ask, and the
  // query behind this endpoint touches every active product.
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(document);
});

export default router;
