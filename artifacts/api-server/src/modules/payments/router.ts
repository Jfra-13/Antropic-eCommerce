import { Router, type IRouter } from "express";
import {
  CreatePaymentProofUploadUrlParams,
  CreatePaymentProofUploadUrlResponse,
  AttachPaymentProofParams,
  AttachPaymentProofBody,
  AttachPaymentProofResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../../lib/auth";
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

export default router;
