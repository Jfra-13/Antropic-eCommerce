import { Router, type IRouter } from "express";
import { RecordConsentBody } from "@workspace/api-zod";
import { optionalAuth } from "../../lib/auth";
import * as service from "./service";

const router: IRouter = Router();

// Public: a visitor decides about cookies before they ever have an account.
router.post("/consents", optionalAuth, async (req, res) => {
  const body = RecordConsentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: body.error.message });
    return;
  }
  await service.record(body.data, {
    userId: req.user?.id ?? null,
    // Taken from the request, never from the body. req.ip is only trustworthy because
    // `trust proxy` is configured explicitly (see lib/env.ts).
    ipAddress: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
  });
  res.status(204).end();
});

export default router;
