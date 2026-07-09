import { Router, type IRouter } from "express";
import healthRouter from "./health";
import meRouter from "./me";
import catalogRouter from "../modules/catalog/router";

const router: IRouter = Router();

router.use(healthRouter);
router.use(meRouter);
router.use(catalogRouter);

export default router;
