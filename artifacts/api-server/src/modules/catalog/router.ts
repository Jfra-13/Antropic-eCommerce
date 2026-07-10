import { Router, type IRouter } from "express";
import {
  ListCategoriesResponse,
  ListCategoriesQueryParams,
  ListOccasionsResponse,
  ListProductsResponse,
  ListProductsQueryParams,
  GetProductResponse,
  CreateStockAlertBody,
} from "@workspace/api-zod";
import { optionalAuth } from "../../lib/auth";
import * as service from "./service";

const router: IRouter = Router();

router.get("/categories", async (req, res) => {
  const query = ListCategoriesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ code: "INVALID_QUERY", message: query.error.message });
    return;
  }
  res.json(ListCategoriesResponse.parse(await service.getCategories(query.data.includeEmpty)));
});

// "Avísame cuando haya stock": guests subscribe with an explicit email; authenticated
// callers fall back to their profile email.
router.post("/stock-alerts", optionalAuth, async (req, res) => {
  const body = CreateStockAlertBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: body.error.message });
    return;
  }
  const email = body.data.email ?? req.user?.email;
  if (!email) {
    res.status(400).json({ code: "EMAIL_REQUIRED", message: "email is required for guests" });
    return;
  }
  const result = await service.subscribeStockAlert(
    body.data.variantId,
    email,
    req.user?.id ?? null,
  );
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.status(201).send();
});

router.get("/occasions", async (_req, res) => {
  res.json(ListOccasionsResponse.parse(await service.getOccasions()));
});

router.get("/products", async (req, res) => {
  const parsed = ListProductsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ code: "INVALID_QUERY", message: parsed.error.message });
    return;
  }
  const data = await service.getProducts(parsed.data);
  res.json(ListProductsResponse.parse(data));
});

router.get("/products/:slug", async (req, res) => {
  const product = await service.getProductBySlug(req.params.slug);
  if (!product) {
    res.status(404).json({ code: "NOT_FOUND", message: "Product not found" });
    return;
  }
  res.json(GetProductResponse.parse(product));
});

export default router;
