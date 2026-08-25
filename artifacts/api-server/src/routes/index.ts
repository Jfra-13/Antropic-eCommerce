import { Router, type IRouter } from "express";
import healthRouter from "./health";
import meRouter from "./me";
import catalogRouter from "../modules/catalog/router";
import cartRouter from "../modules/cart/router";
import wishlistRouter from "../modules/wishlist/router";
import checkoutRouter from "../modules/checkout/router";
import ordersRouter from "../modules/orders/router";
import paymentsRouter from "../modules/payments/router";
import returnsRouter from "../modules/returns/router";
import complaintsRouter from "../modules/complaints/router";
import consentsRouter from "../modules/consents/router";
import configRouter from "../modules/config/router";
import seoRouter from "../modules/seo/router";
import adminRouter from "../modules/admin/router";

const router: IRouter = Router();

router.use(healthRouter);
router.use(meRouter);
router.use(catalogRouter);
router.use(cartRouter);
router.use(wishlistRouter);
router.use(checkoutRouter);
router.use(ordersRouter);
router.use(paymentsRouter);
router.use(returnsRouter);
router.use(complaintsRouter);
router.use(consentsRouter);
router.use(configRouter);
router.use(seoRouter);
router.use(adminRouter);

export default router;
