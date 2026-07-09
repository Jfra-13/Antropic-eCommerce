import { Router, type IRouter } from "express";
import {
  ListCategoriesResponse,
  ListOccasionsResponse,
  ListProductsResponse,
  ListProductsQueryParams,
  GetProductResponse,
} from "@workspace/api-zod";
import * as service from "./service";

const router: IRouter = Router();

router.get("/categories", async (_req, res) => {
  res.json(ListCategoriesResponse.parse(await service.getCategories()));
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
