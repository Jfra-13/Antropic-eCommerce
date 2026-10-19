import { Router, type IRouter } from "express";
import {
  CheckoutQuoteBody,
  CheckoutQuoteResponse,
  GuestCheckoutQuoteBody,
  GuestCheckoutQuoteResponse,
  type CheckoutQuoteInput,
  type GuestCheckoutQuoteInput,
} from "@workspace/api-zod";
import { requireAuth } from "../../lib/auth";
import * as service from "./service";

const router: IRouter = Router();

// Guest quote: no session, the cart travels in the body (it lives in the browser).
router.post("/guest/checkout/quote", async (req, res) => {
  const body = GuestCheckoutQuoteBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: body.error.message });
    return;
  }
  const result = await service.guestQuote(body.data as GuestCheckoutQuoteInput);
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.json(GuestCheckoutQuoteResponse.parse(result.quote));
});

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
