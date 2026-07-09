import { Router, type IRouter } from "express";
import { GetPublicConfigResponse, ListPickupPointsResponse } from "@workspace/api-zod";
import * as config from "./service";

// Public store config (no auth): checkout reads delivery fee, Yape, and pickup points;
// the home reads active banners. Write side lives in the admin router.
const router: IRouter = Router();

router.get("/config", async (_req, res) => {
  const cfg = await config.getPublicConfig();
  res.json(GetPublicConfigResponse.parse(cfg));
});

router.get("/pickup-points", async (_req, res) => {
  const list = await config.getPickupPoints(true);
  res.json(ListPickupPointsResponse.parse(list));
});

export default router;
