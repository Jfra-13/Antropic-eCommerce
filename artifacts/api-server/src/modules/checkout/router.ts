import { Router, type IRouter } from "express";
import {
  CheckoutQuoteBody,
  CheckoutQuoteResponse,
  type CheckoutQuoteInput,
} from "@workspace/api-zod";
import { requireAuth } from "../../lib/auth";
import * as service from "./service";

const router: IRouter = Router();

router.use("/checkout", requireAuth);

router.post("/checkout/quote", async (req, res) => {
  const body = CheckoutQuoteBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: body.error.message });
    return;
  }
  const result = await service.quote(req.user!.id, body.data as CheckoutQuoteInput);
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.json(CheckoutQuoteResponse.parse(result.quote));
});

export default router;
