import { Router, type IRouter } from "express";
import {
  CreateReturnBody,
  CreateReturnResponse,
  ListMyReturnsQueryParams,
  ListMyReturnsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../../lib/auth";
import * as service from "./service";

const router: IRouter = Router();

// Return creation is owner-scoped: the ticket is bound to req.user.id and its own order.
router.use("/returns", requireAuth);

router.get("/returns", async (req, res) => {
  const query = ListMyReturnsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ code: "INVALID_QUERY", message: query.error.message });
    return;
  }
  const tickets = await service.getMyReturns(req.user!.id, query.data.orderId);
  res.json(ListMyReturnsResponse.parse(tickets));
});

router.post("/returns", async (req, res) => {
  const body = CreateReturnBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: body.error.message });
    return;
  }
  const result = await service.createReturn(req.user!.id, body.data);
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.status(201).json(CreateReturnResponse.parse(result.ticket));
});

export default router;
