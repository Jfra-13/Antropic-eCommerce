import { Router, type IRouter } from "express";
import { CreateComplaintBody, CreateComplaintResponse } from "@workspace/api-zod";
import { optionalAuth } from "../../lib/auth";
import * as service from "./service";

const router: IRouter = Router();

// Deliberately NOT behind requireAuth. Making a consumer create an account before they can
// file a complaint would itself obstruct the right the Libro de Reclamaciones exists to
// guarantee. optionalAuth only means: if they happen to be signed in, attribute the filing to
// them; if not, take it anyway.
router.post("/complaints", optionalAuth, async (req, res) => {
  const body = CreateComplaintBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: body.error.message });
    return;
  }
  const result = await service.createComplaint(body.data, req.user?.id ?? null);
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.status(201).json(CreateComplaintResponse.parse(result.receipt));
});

export default router;
