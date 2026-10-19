import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { DashboardSummary } from "@workspace/api-zod";
import adminRouter from "./router";
import { approvePaymentTx } from "../payments/queries";
import {
  resetDatabase,
  seedProfile,
  seedVariant,
  seedOrderAwaitingApproval,
} from "../../test/db";
import { startApi, type Api } from "../../test/http";

// Only the JWT signature is faked: the token is the profile id. The role still comes from
// profiles.role through the real requireAuth, which is the thing under test.
vi.mock("jose", () => ({
  createRemoteJWKSet: () => () => undefined,
  jwtVerify: async (token: string) => ({ payload: { sub: token } }),
}));

// Every route on the admin router, with the role decision made for it (auditoría §11.11,
// Fase C). "staff" = employee and admin; "admin" = admin only. A route added to the router
// without a line here fails the suite: the role decision cannot be skipped by omission.
const ROLES: Record<string, "staff" | "admin"> = {
  "GET /admin/payments/queue": "staff",
  "POST /admin/orders/:id/approve": "staff",
  "POST /admin/orders/:id/reject": "staff",
  "GET /admin/orders/:id/payment-events": "staff",
  "GET /admin/shipments": "staff",
  "GET /admin/orders": "staff",
  "GET /admin/orders/:id": "staff",
  "POST /admin/orders/:id/fulfillment": "staff",
  "GET /admin/products": "staff",
  "POST /admin/products": "staff",
  "PATCH /admin/products/:id": "staff",
  // Deleting cannot be undone, so it is stricter than the role matrix on purpose.
  "DELETE /admin/products/:id": "admin",
  "POST /admin/products/:id/variants": "staff",
  "POST /admin/products/import": "staff",
  "POST /admin/products/:id/media": "staff",
  "DELETE /admin/media/:id": "staff",
  "PATCH /admin/variants/:id": "staff",
  "POST /admin/categories": "staff",
  "PATCH /admin/categories/:id": "staff",
  "DELETE /admin/categories/:id": "admin",
  "POST /admin/occasions": "staff",
  "PATCH /admin/occasions/:id": "staff",
  "DELETE /admin/occasions/:id": "admin",
  "GET /admin/coupons": "admin",
  "POST /admin/coupons": "admin",
  "PATCH /admin/coupons/:id": "admin",
  "DELETE /admin/coupons/:id": "admin",
  "GET /admin/returns": "staff",
  "PATCH /admin/returns/:id": "staff",
  "GET /admin/complaints": "staff",
  // Open business decision (§11.11): who answers complaints. Restricting it is this line
  // plus an adminOnly on the route.
  "PATCH /admin/complaints/:id": "staff",
  "GET /admin/users": "admin",
  "POST /admin/users": "admin",
  "PATCH /admin/users/:id": "admin",
  "GET /admin/config": "admin",
  "PUT /admin/config": "admin",
  "POST /admin/config/media/upload-url": "admin",
  "GET /admin/pickup-points": "admin",
  "POST /admin/pickup-points": "admin",
  "PATCH /admin/pickup-points/:id": "admin",
  "DELETE /admin/pickup-points/:id": "admin",
  "GET /admin/dashboard": "staff",
  "GET /admin/reports": "admin",
  "GET /admin/ops": "staff",
  "GET /admin/notifications": "staff",
  "POST /admin/notifications/:id/retry": "staff",
};

type Layer = { route?: { path: string; methods: Record<string, boolean> }; handle?: { stack?: unknown } };

function registeredRoutes(): string[] {
  return (adminRouter as unknown as { stack: Layer[] }).stack.flatMap((layer) =>
    layer.route
      ? Object.keys(layer.route.methods).map((m) => `${m.toUpperCase()} ${layer.route!.path}`)
      : [],
  );
}

// A well-formed id that matches nothing: past the gate, a handler answers 404 or 400 and
// writes nothing.
function concrete(route: string): [string, string] {
  const [method, path] = route.split(" ") as [string, string];
  return [method, path.replace(/:id/g, crypto.randomUUID())];
}

describe("admin route roles", () => {
  let api: Api;
  let customer: string;
  let employee: string;

  beforeAll(async () => {
    await resetDatabase();
    customer = await seedProfile({ role: "customer" });
    employee = await seedProfile({ role: "employee" });
    api = await startApi();
  });

  afterAll(async () => {
    await api.close();
  });

  it("classifies every route registered on the admin router, and only those", () => {
    const routes = registeredRoutes();
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.filter((r) => !(r in ROLES))).toEqual([]);
    expect(Object.keys(ROLES).filter((r) => !routes.includes(r))).toEqual([]);
    // registeredRoutes() only sees routes declared directly on adminRouter. A nested router
    // mounted with `use` would carry routes this sweep never visits, so refuse it outright:
    // declare admin routes on adminRouter, or extend the enumeration first.
    const nested = (adminRouter as unknown as { stack: Layer[] }).stack.filter((l) => !l.route && l.handle?.stack);
    expect(nested).toEqual([]);
  });

  it("answers 403 to a customer on every admin route", async () => {
    for (const route of registeredRoutes()) {
      const res = await api.request(...concrete(route), customer, {});
      expect(res.status, route).toBe(403);
    }
  });

  it("answers 403 to an employee on admin-only routes, and lets them through the staff ones", async () => {
    for (const route of registeredRoutes()) {
      const res = await api.request(...concrete(route), employee, {});
      // The second half matters as much as the first: a staff route that quietly became
      // admin-only would lock the team out of daily work with nothing failing.
      if (ROLES[route] === "admin") expect(res.status, route).toBe(403);
      else {
        // Past the gate, not just "not 403": a staff route that crashes is just as unusable.
        expect(res.status, route).not.toBe(403);
        expect(res.status, route).toBeLessThan(500);
      }
    }
  });

  it("keeps sales figures out of an employee's dashboard, and gives them to the admin", async () => {
    // A sale approved today, so every figure the admin sees is a real number, not a default.
    const admin = await seedProfile({ role: "admin" });
    const variant = await seedVariant(5);
    const orderId = await seedOrderAwaitingApproval(customer, [{ ...variant, quantity: 2 }]);
    expect((await approvePaymentTx(orderId, admin)).kind).toBe("ok");

    const dashboard = async (as: string) =>
      (await (await api.request("GET", "/admin/dashboard", as)).json()) as DashboardSummary;

    const asEmployee = await dashboard(employee);
    expect(asEmployee.kpis).toBeNull();
    expect(asEmployee.topProducts).toEqual([
      expect.objectContaining({ quantity: 2, revenue: null }),
    ]);
    expect(asEmployee.alerts).toBeDefined();

    const asAdmin = await dashboard(admin);
    expect(asAdmin.kpis).toMatchObject({ salesToday: "100.00", ordersToday: 1 });
    expect(asAdmin.topProducts).toEqual([
      expect.objectContaining({ quantity: 2, revenue: "100.00" }),
    ]);
  });

  it("answers 401 with no token", async () => {
    const res = await api.request("GET", "/admin/dashboard");
    expect(res.status).toBe(401);
  });
});
