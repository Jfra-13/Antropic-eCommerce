import { Router, type IRouter } from "express";
import {
  CreatePaymentProofUploadUrlParams,
  CreatePaymentProofUploadUrlResponse,
  AttachPaymentProofParams,
  AttachPaymentProofBody,
  AttachPaymentProofResponse,
  CreateGuestPaymentProofUploadUrlResponse,
  AttachGuestPaymentProofBody,
  AttachGuestPaymentProofResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../../lib/auth";
import { requireGuestOrder } from "../orders/guest-access";
import * as service from "./service";

const router: IRouter = Router();

// Payment routes are owner-scoped: the order must belong to the caller.
router.use("/orders/:id/payment-proof", requireAuth);

router.post("/orders/:id/payment-proof/upload-url", async (req, res) => {
  const params = CreatePaymentProofUploadUrlParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ code: "INVALID_PARAM", message: "Invalid order id" });
    return;
  }
  const result = await service.createUploadUrl(req.user!.id, params.data.id);
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.json(CreatePaymentProofUploadUrlResponse.parse(result.upload));
});

router.post("/orders/:id/payment-proof", async (req, res) => {
  const params = AttachPaymentProofParams.safeParse(req.params);
  const body = AttachPaymentProofBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: "Invalid order id or body" });
    return;
  }
  const result = await service.attachProof(
    req.user!.id,
    params.data.id,
    body.data.path,
    body.data.amountReported ?? null,
  );
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.json(AttachPaymentProofResponse.parse(result.order));
});

// Guest orders (auditoría §1.4): the same two steps, opened by the order's access token instead
// of a session. requireGuestOrder has already proved the caller holds this order's token, so the
// owner passed down is simply the order's own customer.
router.post("/guest/orders/:id/payment-proof/upload-url", requireGuestOrder, async (req, res) => {
  const order = req.guestOrder!;
  const result = await service.createUploadUrl(order.userId, order.id);
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.json(CreateGuestPaymentProofUploadUrlResponse.parse(result.upload));
});

router.post("/guest/orders/:id/payment-proof", requireGuestOrder, async (req, res) => {
  const body = AttachGuestPaymentProofBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: "Invalid body" });
    return;
  }
  const order = req.guestOrder!;
  const result = await service.attachProof(
    order.userId,
    order.id,
    body.data.path,
    body.data.amountReported ?? null,
  );
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.json(AttachGuestPaymentProofResponse.parse(result.order));
});

export default router;
