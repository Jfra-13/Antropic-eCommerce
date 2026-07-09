import { Router, type IRouter } from "express";
import {
  ListPaymentVerificationQueueQueryParams,
  ListPaymentVerificationQueueResponse,
  ApproveOrderPaymentParams,
  ApproveOrderPaymentResponse,
  RejectOrderPaymentParams,
  RejectOrderPaymentResponse,
  ListShipmentsQueryParams,
  ListShipmentsResponse,
  AdvanceFulfillmentParams,
  AdvanceFulfillmentBody,
  AdvanceFulfillmentResponse,
  ListAdminProductsQueryParams,
  ListAdminProductsResponse,
  CreateProductBody,
  CreateProductResponse,
  UpdateProductParams,
  UpdateProductBody,
  UpdateProductResponse,
  CreateVariantParams,
  CreateVariantBody,
  CreateVariantResponse,
  UpdateVariantParams,
  UpdateVariantBody,
  UpdateVariantResponse,
  ImportProductsBody,
  ImportProductsResponse,
  ListCouponsQueryParams,
  ListCouponsResponse,
  CreateCouponBody,
  CreateCouponResponse,
  UpdateCouponParams,
  UpdateCouponBody,
  UpdateCouponResponse,
  DeleteCouponParams,
  ListReturnsQueryParams,
  ListReturnsResponse,
  UpdateReturnStatusParams,
  UpdateReturnStatusBody,
  UpdateReturnStatusResponse,
  ListUsersQueryParams,
  ListUsersResponse,
  CreateEmployeeBody,
  CreateEmployeeResponse,
  UpdateUserParams,
  UpdateUserBody,
  UpdateUserResponse,
  GetAdminConfigResponse,
  UpdateAdminConfigBody,
  UpdateAdminConfigResponse,
  CreateConfigMediaUploadUrlResponse,
  ListAdminPickupPointsResponse,
  CreatePickupPointBody,
  CreatePickupPointResponse,
  UpdatePickupPointParams,
  UpdatePickupPointBody,
  UpdatePickupPointResponse,
  DeletePickupPointParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../../lib/auth";
import { createPublicMediaUploadUrl } from "../../lib/storage";
import * as payments from "../payments/service";
import * as orders from "../orders/service";
import * as catalog from "../catalog/service";
import * as coupons from "../coupons/service";
import * as returns from "../returns/service";
import * as users from "../users/service";
import * as config from "../config/service";

const router: IRouter = Router();

// Backoffice is gated to staff. Authorization lives here (Express), not in RLS
// (planeación §3). Every /admin route requires a verified staff JWT.
router.use("/admin", requireAuth, requireRole("employee", "admin"));

// Payment verification queue (requerimientos §6.3): orders awaiting a constancia review.
router.get("/admin/payments/queue", async (req, res) => {
  const query = ListPaymentVerificationQueueQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ code: "INVALID_QUERY", message: query.error.message });
    return;
  }
  const queue = await payments.getVerificationQueue(query.data.page, query.data.limit);
  res.json(ListPaymentVerificationQueueResponse.parse(queue));
});

// Approve a payment: order -> pagado + stock decremented atomically (idempotent).
router.post("/admin/orders/:id/approve", async (req, res) => {
  const params = ApproveOrderPaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ code: "INVALID_PARAM", message: "Invalid order id" });
    return;
  }
  const result = await payments.approvePayment(params.data.id, req.user!.id);
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.json(ApproveOrderPaymentResponse.parse(result.order));
});

// Reject a payment: order -> rechazado (idempotent, no stock change).
router.post("/admin/orders/:id/reject", async (req, res) => {
  const params = RejectOrderPaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ code: "INVALID_PARAM", message: "Invalid order id" });
    return;
  }
  const result = await payments.rejectPayment(params.data.id, req.user!.id);
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.json(RejectOrderPaymentResponse.parse(result.order));
});

// Logistics board (requerimientos §6.4): paid orders in fulfilment, filterable by method/status.
router.get("/admin/shipments", async (req, res) => {
  const query = ListShipmentsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ code: "INVALID_QUERY", message: query.error.message });
    return;
  }
  const { deliveryMethod, status, page, limit } = query.data;
  const list = await orders.getShipments({ deliveryMethod, status }, page, limit);
  res.json(ListShipmentsResponse.parse(list));
});

// Advance an order's fulfilment status (validated state transition).
router.post("/admin/orders/:id/fulfillment", async (req, res) => {
  const params = AdvanceFulfillmentParams.safeParse(req.params);
  const body = AdvanceFulfillmentBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: "Invalid order id or body" });
    return;
  }
  const result = await orders.advanceFulfillment(params.data.id, body.data.to);
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.json(AdvanceFulfillmentResponse.parse(result.order));
});

// --- Catálogo & Inventario (requerimientos §6.5) ---

router.get("/admin/products", async (req, res) => {
  const query = ListAdminProductsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ code: "INVALID_QUERY", message: query.error.message });
    return;
  }
  const list = await catalog.getAdminProducts(query.data.q, query.data.page, query.data.limit);
  res.json(ListAdminProductsResponse.parse(list));
});

router.post("/admin/products", async (req, res) => {
  const body = CreateProductBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: body.error.message });
    return;
  }
  const result = await catalog.createProduct(body.data);
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.status(result.status).json(CreateProductResponse.parse(result.product));
});

router.patch("/admin/products/:id", async (req, res) => {
  const params = UpdateProductParams.safeParse(req.params);
  const body = UpdateProductBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: "Invalid product id or body" });
    return;
  }
  const result = await catalog.updateProduct(params.data.id, body.data);
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.json(UpdateProductResponse.parse(result.product));
});

router.post("/admin/products/:id/variants", async (req, res) => {
  const params = CreateVariantParams.safeParse(req.params);
  const body = CreateVariantBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: "Invalid product id or body" });
    return;
  }
  const result = await catalog.addVariant(params.data.id, body.data);
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.json(CreateVariantResponse.parse(result.product));
});

router.post("/admin/products/import", async (req, res) => {
  const body = ImportProductsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: body.error.message });
    return;
  }
  const result = await catalog.importProducts(body.data.csv, body.data.dryRun ?? false);
  if (!result.ok) {
    res.status(400).json({ code: "INVALID_CSV", message: result.message });
    return;
  }
  res.json(ImportProductsResponse.parse(result.result));
});

router.patch("/admin/variants/:id", async (req, res) => {
  const params = UpdateVariantParams.safeParse(req.params);
  const body = UpdateVariantBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: "Invalid variant id or body" });
    return;
  }
  const result = await catalog.updateVariant(params.data.id, body.data);
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.json(UpdateVariantResponse.parse(result.product));
});

// --- Cupones (requerimientos §6.6) — solo Admin. El gate global permite empleado+admin;
// estas rutas exigen admin explícitamente (empleado ❌ en la matriz de permisos). ---
const adminOnly = requireRole("admin");

router.get("/admin/coupons", adminOnly, async (req, res) => {
  const query = ListCouponsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ code: "INVALID_QUERY", message: query.error.message });
    return;
  }
  const list = await coupons.getCoupons(query.data.q, query.data.page, query.data.limit);
  res.json(ListCouponsResponse.parse(list));
});

router.post("/admin/coupons", adminOnly, async (req, res) => {
  const body = CreateCouponBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: body.error.message });
    return;
  }
  const result = await coupons.createCoupon(body.data);
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.status(result.status).json(CreateCouponResponse.parse(result.coupon));
});

router.patch("/admin/coupons/:id", adminOnly, async (req, res) => {
  const params = UpdateCouponParams.safeParse(req.params);
  const body = UpdateCouponBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: "Invalid coupon id or body" });
    return;
  }
  const result = await coupons.updateCoupon(params.data.id, body.data);
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.json(UpdateCouponResponse.parse(result.coupon));
});

router.delete("/admin/coupons/:id", adminOnly, async (req, res) => {
  const params = DeleteCouponParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ code: "INVALID_PARAM", message: "Invalid coupon id" });
    return;
  }
  const result = await coupons.deleteCoupon(params.data.id);
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.status(204).send();
});

// --- Devoluciones (requerimientos §6.7) — empleado + admin (según matriz de permisos). ---

router.get("/admin/returns", async (req, res) => {
  const query = ListReturnsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ code: "INVALID_QUERY", message: query.error.message });
    return;
  }
  const list = await returns.getReturns(query.data.status, query.data.page, query.data.limit);
  res.json(ListReturnsResponse.parse(list));
});

router.patch("/admin/returns/:id", async (req, res) => {
  const params = UpdateReturnStatusParams.safeParse(req.params);
  const body = UpdateReturnStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: "Invalid return id or body" });
    return;
  }
  const result = await returns.updateReturnStatus(params.data.id, body.data.status);
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.json(UpdateReturnStatusResponse.parse(result.ticket));
});

// --- Usuarios (requerimientos §6.9) — solo Admin. ---

router.get("/admin/users", adminOnly, async (req, res) => {
  const query = ListUsersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ code: "INVALID_QUERY", message: query.error.message });
    return;
  }
  const list = await users.getUsers(query.data.role, query.data.q, query.data.page, query.data.limit);
  res.json(ListUsersResponse.parse(list));
});

router.post("/admin/users", adminOnly, async (req, res) => {
  const body = CreateEmployeeBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: body.error.message });
    return;
  }
  const result = await users.createEmployee(body.data);
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.status(201).json(CreateEmployeeResponse.parse(result.user));
});

router.patch("/admin/users/:id", adminOnly, async (req, res) => {
  const params = UpdateUserParams.safeParse(req.params);
  const body = UpdateUserBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: "Invalid user id or body" });
    return;
  }
  const result = await users.updateUser(req.user!.id, params.data.id, body.data);
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.json(UpdateUserResponse.parse(result.user));
});

// --- Configuración global (requerimientos §6.10) — solo Admin. ---

router.get("/admin/config", adminOnly, async (_req, res) => {
  const cfg = await config.getAdminConfig();
  res.json(GetAdminConfigResponse.parse(cfg));
});

router.put("/admin/config", adminOnly, async (req, res) => {
  const body = UpdateAdminConfigBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: body.error.message });
    return;
  }
  const cfg = await config.updateConfig(body.data);
  res.json(UpdateAdminConfigResponse.parse(cfg));
});

// Signed upload URL for a QR/banner image (public bucket). Frontend PUTs the file, then sends
// the returned path back in PUT /admin/config (yapeQrPath or a banner entry).
router.post("/admin/config/media/upload-url", adminOnly, async (_req, res) => {
  const signed = await createPublicMediaUploadUrl();
  res.json(CreateConfigMediaUploadUrlResponse.parse(signed));
});

router.get("/admin/pickup-points", adminOnly, async (_req, res) => {
  const list = await config.getPickupPoints(false);
  res.json(ListAdminPickupPointsResponse.parse(list));
});

router.post("/admin/pickup-points", adminOnly, async (req, res) => {
  const body = CreatePickupPointBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: body.error.message });
    return;
  }
  const point = await config.createPickupPoint(body.data);
  res.status(201).json(CreatePickupPointResponse.parse(point));
});

router.patch("/admin/pickup-points/:id", adminOnly, async (req, res) => {
  const params = UpdatePickupPointParams.safeParse(req.params);
  const body = UpdatePickupPointBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ code: "INVALID_BODY", message: "Invalid pickup point id or body" });
    return;
  }
  const result = await config.updatePickupPoint(params.data.id, body.data);
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.json(UpdatePickupPointResponse.parse(result.point));
});

router.delete("/admin/pickup-points/:id", adminOnly, async (req, res) => {
  const params = DeletePickupPointParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ code: "INVALID_PARAM", message: "Invalid pickup point id" });
    return;
  }
  const result = await config.deletePickupPoint(params.data.id);
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, message: result.message });
    return;
  }
  res.status(204).send();
});

export default router;
