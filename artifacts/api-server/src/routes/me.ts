import { Router, type IRouter } from "express";
import { GetMeResponse } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

// Returns the authenticated caller's profile. Proves the auth pipeline end to end
// (JWT verify -> profile bootstrap -> req.user).
router.get("/me", requireAuth, (req, res) => {
  res.json(GetMeResponse.parse({ user: req.user }));
});

export default router;
