import { Router, type IRouter } from "express";
import healthRouter from "./health";
import meRouter from "./me";
import catalogRouter from "../modules/catalog/router";
import cartRouter from "../modules/cart/router";
import wishlistRouter from "../modules/wishlist/router";

const router: IRouter = Router();

router.use(healthRouter);
router.use(meRouter);
router.use(catalogRouter);
router.use(cartRouter);
router.use(wishlistRouter);

export default router;
