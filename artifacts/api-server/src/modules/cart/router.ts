import { Router, type IRouter } from "express";
import {
  GetCartResponse,
  AddCartItemBody,
  AddCartItemResponse,
  UpdateCartItemBody,
  UpdateCartItemParams,
  UpdateCartItemResponse,
  RemoveCartItemParams,
  RemoveCartItemResponse,
  MergeCartBody,
  MergeCartResponse,
  ResolveGuestCartBody,
  ResolveGuestCartResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../../lib/auth";
import * as service from "./service";

const router: IRouter = Router();

// A guest cart has no row here: it travels in the body and is only read, never stored.
// Rate-limited with the guest quote (app.ts, /api/guest/checkout).
router.post("/guest/checkout/cart", async (req, res) => {
  const body = ResolveGuestCartBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: body.error.message });
    return;
  }
  res.json(ResolveGuestCartResponse.parse(await service.resolveGuestCart(body.data.items)));
});

// Every cart route is owner-scoped: the cart is resolved from req.user.id (jwt.sub),
// never from a client-supplied id.
router.use("/cart", requireAuth);

router.get("/cart", async (req, res) => {
  res.json(GetCartResponse.parse(await service.getCart(req.user!.id)));
});

router.post("/cart/items", async (req, res) => {
  const body = AddCartItemBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: body.error.message });
    return;
  }
  const result = await service.addItem(req.user!.id, body.data.variantId, body.data.quantity);
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.json(AddCartItemResponse.parse(result.cart));
});

router.patch("/cart/items/:variantId", async (req, res) => {
  const params = UpdateCartItemParams.safeParse(req.params);
  const body = UpdateCartItemBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: "Invalid variantId or quantity" });
    return;
  }
  const result = await service.setQuantity(
    req.user!.id,
    params.data.variantId,
    body.data.quantity,
  );
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.json(UpdateCartItemResponse.parse(result.cart));
});

router.delete("/cart/items/:variantId", async (req, res) => {
  const params = RemoveCartItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ code: "INVALID_PARAM", message: "Invalid variantId" });
    return;
  }
  const cart = await service.removeItem(req.user!.id, params.data.variantId);
  res.json(RemoveCartItemResponse.parse(cart));
});

router.post("/cart/merge", async (req, res) => {
  const body = MergeCartBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: body.error.message });
    return;
  }
  const cart = await service.merge(req.user!.id, body.data.items);
  res.json(MergeCartResponse.parse(cart));
});

export default router;
