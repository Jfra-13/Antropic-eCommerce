import { Router, type IRouter } from "express";
import {
  GetWishlistResponse,
  AddWishlistItemBody,
  AddWishlistItemResponse,
  RemoveWishlistItemParams,
  RemoveWishlistItemResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../../lib/auth";
import * as service from "./service";

const router: IRouter = Router();

// Owner-scoped: the wishlist is always keyed by req.user.id (jwt.sub).
router.use("/wishlist", requireAuth);

router.get("/wishlist", async (req, res) => {
  res.json(GetWishlistResponse.parse(await service.getWishlist(req.user!.id)));
});

router.post("/wishlist", async (req, res) => {
  const body = AddWishlistItemBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: body.error.message });
    return;
  }
  const result = await service.addItem(req.user!.id, body.data.productId);
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.json(AddWishlistItemResponse.parse(result.wishlist));
});

router.delete("/wishlist/:productId", async (req, res) => {
  const params = RemoveWishlistItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ code: "INVALID_PARAM", message: "Invalid productId" });
    return;
  }
  const wishlist = await service.removeItem(req.user!.id, params.data.productId);
  res.json(RemoveWishlistItemResponse.parse(wishlist));
});

export default router;
