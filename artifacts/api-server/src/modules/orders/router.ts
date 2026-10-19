import { Router, type IRouter } from "express";
import {
  CreateOrderBody,
  CreateOrderResponse,
  ListOrdersQueryParams,
  ListOrdersResponse,
  GetOrderParams,
  GetOrderResponse,
  CreateGuestOrderBody,
  CreateGuestOrderResponse,
  GetGuestOrderResponse,
  type CreateOrderInput,
  type CreateGuestOrderInput,
} from "@workspace/api-zod";
import { requireAuth } from "../../lib/auth";
import { requireGuestOrder } from "./guest-access";
import * as service from "./service";

const router: IRouter = Router();

// Guest checkout (auditoría §1.4). No session: the order is created from the lines in the body,
// and read back afterwards with the access token returned here.
router.post("/guest/orders", async (req, res) => {
  const body = CreateGuestOrderBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: body.error.message });
    return;
  }
  const result = await service.createGuestOrder(body.data as CreateGuestOrderInput);
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.status(result.status).json(CreateGuestOrderResponse.parse(result.receipt));
});

router.get("/guest/orders/:id", requireGuestOrder, async (req, res) => {
  res.json(GetGuestOrderResponse.parse(await service.buildOrderDto(req.guestOrder!)));
});

// Every order route is owner-scoped: orders are resolved by req.user.id (jwt.sub).
router.use("/orders", requireAuth);

router.post("/orders", async (req, res) => {
  const body = CreateOrderBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: body.error.message });
    return;
  }
  const result = await service.createOrder(req.user!.id, body.data as CreateOrderInput);
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.status(result.status).json(CreateOrderResponse.parse(result.order));
});

router.get("/orders", async (req, res) => {
  const query = ListOrdersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ code: "INVALID_QUERY", message: query.error.message });
    return;
  }
  const list = await service.listOrders(req.user!.id, query.data.page, query.data.limit);
  res.json(ListOrdersResponse.parse(list));
});

router.get("/orders/:id", async (req, res) => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ code: "INVALID_PARAM", message: "Invalid order id" });
    return;
  }
  const order = await service.getOrder(req.user!.id, params.data.id);
  if (!order) {
    res.status(404).json({ code: "NOT_FOUND", message: "Order not found" });
    return;
  }
  res.json(GetOrderResponse.parse(order));
});

export default router;
