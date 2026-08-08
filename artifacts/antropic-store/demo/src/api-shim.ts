// In-browser stand-in for api-server, used by the static demo build.
//
// The storefront talks to the API exclusively through `customFetch`, which ends in a
// plain `fetch("/api/...")`. This module patches `window.fetch` before the app boots
// (main.demo.ts imports it first) and answers those calls itself:
//
//   * GET  routes come from demo/generated/api-snapshot.json — real payloads captured
//     from a running api-server against the seeded catalog (see demo/capture.mjs).
//   * The authenticated, stateful routes (cart, wishlist, profile, checkout, orders)
//     are re-implemented in memory, mirroring the server's response shapes so the
//     storefront's React Query cache behaves exactly as it does against the real API.
//
// State lives for the lifetime of the tab and is intentionally not persisted: a reload
// gives a clean demo. Guest cart/favorites still use the app's own localStorage keys,
// because that path never touches the API.
//
// Everything here is demo scaffolding. It is NOT a test double for the API contract —
// pricing, stock and order rules are approximations of the server's behaviour, enough
// to walk through the flow on screen.

import snapshot from "../generated/api-snapshot.json";

type Json = Record<string, unknown>;

const routes = snapshot.routes as Record<string, unknown>;
const products = (routes["/api/products"] as { items: ProductDto[] }).items;
const config = routes["/api/config"] as {
  deliveryFee: string;
  freeShippingThreshold: string | null;
};

type VariantDto = {
  id: string;
  size: string;
  color: string;
  sku: string;
  stock: number;
};

type ProductDto = {
  id: string;
  slug: string;
  name: string;
  price: string;
  variants: VariantDto[];
  images: { path: string }[];
};

// ---------------------------------------------------------------------------
// Money — integer cents, same reasoning as api-server/src/lib/money.ts.
// ---------------------------------------------------------------------------

function toCents(value: string): number {
  const [whole, frac = ""] = value.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

function fromCents(cents: number): string {
  const c = Math.max(0, Math.round(cents));
  return `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Catalog lookups
// ---------------------------------------------------------------------------

const variantIndex = new Map<string, { product: ProductDto; variant: VariantDto }>();
for (const product of products) {
  for (const variant of product.variants) {
    variantIndex.set(variant.id, { product, variant });
  }
}

// ---------------------------------------------------------------------------
// Mutable demo state
// ---------------------------------------------------------------------------

const cart = new Map<string, number>(); // variantId -> quantity
const wishlist = new Set<string>(); // productId
const orders: Json[] = [];
const ordersByIdempotencyKey = new Map<string, Json>();

const profile = {
  id: "00000000-0000-4000-8000-0000000000d0",
  email: "demo@antropic.test",
  role: "customer" as const,
  fullName: null as string | null,
  phone: null as string | null,
  shippingAddress: null as string | null,
};

// Coupons the demo accepts. The real catalogue lives in the `coupons` table; these two
// exist so the coupon field on checkout has something to do.
const COUPONS: Record<string, { type: "percent" | "amount"; value: number }> = {
  ANTROPIC10: { type: "percent", value: 10 },
  VERANO25: { type: "amount", value: 2500 },
};

function cartItems(): Json[] {
  const items: Json[] = [];
  for (const [variantId, quantity] of cart) {
    const entry = variantIndex.get(variantId);
    if (!entry) continue;
    const { product, variant } = entry;
    items.push({
      variantId,
      productId: product.id,
      slug: product.slug,
      name: product.name,
      size: variant.size,
      color: variant.color,
      sku: variant.sku,
      stock: variant.stock,
      unitPrice: product.price,
      quantity,
      image: product.images[0]?.path ?? null,
    });
  }
  return items;
}

function addToCart(variantId: string, quantity: number): void {
  const entry = variantIndex.get(variantId);
  if (!entry) return;
  const next = (cart.get(variantId) ?? 0) + Math.max(1, quantity);
  cart.set(variantId, Math.min(next, entry.variant.stock));
}

function quote(couponCode: string | null, deliveryMethod: string) {
  const items = cartItems();
  const subtotal = items.reduce(
    (sum, item) =>
      sum + toCents(item.unitPrice as string) * (item.quantity as number),
    0,
  );

  const coupon = couponCode ? COUPONS[couponCode.toUpperCase()] : undefined;
  const discount = !coupon
    ? 0
    : coupon.type === "percent"
      ? Math.round((subtotal * coupon.value) / 100)
      : Math.min(coupon.value, subtotal);

  // Recojo never ships. Delivery is free once the order clears the threshold.
  const threshold = config.freeShippingThreshold
    ? toCents(config.freeShippingThreshold)
    : null;
  const shipping =
    deliveryMethod === "recojo" ||
    (threshold !== null && subtotal - discount >= threshold)
      ? 0
      : toCents(config.deliveryFee);

  return {
    items: items.map((item) => ({
      variantId: item.variantId,
      name: item.name,
      variantLabel: `${item.size} · ${item.color}`,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      lineTotal: fromCents(
        toCents(item.unitPrice as string) * (item.quantity as number),
      ),
    })),
    subtotal: fromCents(subtotal),
    shippingCost: fromCents(shipping),
    discountAmount: fromCents(discount),
    total: fromCents(subtotal - discount + shipping),
    couponCode: coupon ? couponCode!.toUpperCase() : null,
  };
}

function createOrder(body: Json): Json | { error: [number, string, string] } {
  const key = typeof body.idempotencyKey === "string" ? body.idempotencyKey : null;
  if (key && ordersByIdempotencyKey.has(key)) {
    return ordersByIdempotencyKey.get(key)!;
  }

  if (cart.size === 0) {
    return { error: [409, "CART_EMPTY", "El carrito está vacío"] };
  }
  if (!profile.fullName?.trim() || !profile.phone?.trim()) {
    return {
      error: [
        409,
        "PROFILE_INCOMPLETE",
        "Completá tu nombre y teléfono para continuar",
      ],
    };
  }

  const deliveryMethod = body.deliveryMethod === "recojo" ? "recojo" : "delivery";
  const totals = quote(
    typeof body.couponCode === "string" ? body.couponCode : null,
    deliveryMethod,
  );
  const items = cartItems();
  const orderNumber = 1000 + orders.length + 1;

  const order: Json = {
    id: crypto.randomUUID(),
    orderNumber,
    referenceCode: `ANT-${orderNumber}`,
    paymentStatus: "pendiente_pago",
    fulfillmentStatus: null,
    deliveryMethod,
    pickupPointId: deliveryMethod === "recojo" ? (body.pickupPointId ?? null) : null,
    shippingAddress:
      deliveryMethod === "delivery"
        ? (body.shippingAddress ?? profile.shippingAddress)
        : null,
    subtotal: totals.subtotal,
    shippingCost: totals.shippingCost,
    discountAmount: totals.discountAmount,
    total: totals.total,
    couponCode: totals.couponCode,
    paymentProofStatus: null,
    createdAt: new Date().toISOString(),
    items: items.map((item) => ({
      variantId: item.variantId,
      productName: item.name,
      variantLabel: `${item.size} · ${item.color}`,
      sku: item.sku,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      lineTotal: fromCents(
        toCents(item.unitPrice as string) * (item.quantity as number),
      ),
    })),
  };

  orders.unshift(order);
  if (key) ordersByIdempotencyKey.set(key, order);
  cart.clear(); // the server empties the cart when the order is placed
  return order;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

function json(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fail(status: number, code: string, message: string): Response {
  return json({ code, message }, status);
}

function isSignedIn(headers: Headers): boolean {
  return headers.get("authorization") !== null;
}

function handle(method: string, path: string, headers: Headers, body: Json): Response {
  // --- public catalog: straight from the snapshot ---------------------------
  if (method === "GET" && routes[path] !== undefined) {
    return json(routes[path]);
  }
  if (method === "GET" && path.startsWith("/api/products/")) {
    return fail(404, "NOT_FOUND", "Product not found");
  }
  if (method === "POST" && path === "/api/stock-alerts") {
    return json(null, 204);
  }

  // --- everything below needs a session -------------------------------------
  // The storefront only sends a bearer token when signed in, so mirroring the
  // server's 401 keeps it in guest mode (localStorage cart) until login.
  if (!isSignedIn(headers)) {
    return fail(401, "UNAUTHORIZED", "Authentication required");
  }

  if (path === "/api/me") {
    if (method === "GET") return json({ user: profile });
    if (method === "PATCH") {
      if (typeof body.fullName === "string") profile.fullName = body.fullName;
      if (typeof body.phone === "string") profile.phone = body.phone;
      if (typeof body.shippingAddress === "string") {
        profile.shippingAddress = body.shippingAddress;
      }
      return json({ user: profile });
    }
  }

  if (path === "/api/cart") {
    if (method === "GET") return json({ items: cartItems() });
  }
  if (path === "/api/cart/items" && method === "POST") {
    addToCart(String(body.variantId), Number(body.quantity ?? 1));
    return json({ items: cartItems() });
  }
  if (path === "/api/cart/merge" && method === "POST") {
    for (const item of (body.items as { variantId: string; quantity?: number }[]) ?? []) {
      addToCart(item.variantId, item.quantity ?? 1);
    }
    return json({ items: cartItems() });
  }
  if (path.startsWith("/api/cart/items/")) {
    const variantId = decodeURIComponent(path.slice("/api/cart/items/".length));
    if (method === "PATCH") {
      const quantity = Number(body.quantity);
      if (quantity > 0) cart.set(variantId, quantity);
      else cart.delete(variantId);
      return json({ items: cartItems() });
    }
    if (method === "DELETE") {
      cart.delete(variantId);
      return json({ items: cartItems() });
    }
  }

  if (path === "/api/wishlist") {
    if (method === "GET" || method === "POST") {
      if (method === "POST") wishlist.add(String(body.productId));
      return json({ items: products.filter((p) => wishlist.has(p.id)) });
    }
  }
  if (path.startsWith("/api/wishlist/") && method === "DELETE") {
    wishlist.delete(decodeURIComponent(path.slice("/api/wishlist/".length)));
    return json({ items: products.filter((p) => wishlist.has(p.id)) });
  }

  if (path === "/api/checkout/quote" && method === "POST") {
    const code = typeof body.couponCode === "string" ? body.couponCode : null;
    if (code && !COUPONS[code.toUpperCase()]) {
      return fail(422, "COUPON_INVALID", "El cupón no es válido");
    }
    return json(quote(code, String(body.deliveryMethod ?? "delivery")));
  }

  if (path === "/api/orders") {
    if (method === "GET") {
      return json({ items: orders, total: orders.length, page: 1, limit: 20 });
    }
    if (method === "POST") {
      const result = createOrder(body);
      if ("error" in result && Array.isArray(result.error)) {
        const [status, code, message] = result.error as [number, string, string];
        return fail(status, code, message);
      }
      return json(result, 201);
    }
  }
  if (method === "GET" && /^\/api\/orders\/[^/]+$/.test(path)) {
    const id = path.slice("/api/orders/".length);
    const order = orders.find((o) => o.id === id);
    return order ? json(order) : fail(404, "NOT_FOUND", "Order not found");
  }

  // Attaching a Yape receipt uploads a file to Supabase Storage; there is no bucket
  // behind a static page, so this is the one flow the demo cannot carry out.
  if (path.includes("/payment-proof")) {
    return fail(
      501,
      "DEMO_UNSUPPORTED",
      "Subir la constancia de pago no está disponible en la demo estática.",
    );
  }

  if (path === "/api/returns") {
    if (method === "GET") return json([]);
    if (method === "POST") {
      return json(
        {
          id: crypto.randomUUID(),
          ticketNumber: 1,
          orderId: String(body.orderId ?? ""),
          userId: profile.id,
          reason: (body.reason as string) ?? null,
          currentSize: (body.currentSize as string) ?? null,
          desiredSize: (body.desiredSize as string) ?? null,
          photoPath: null,
          status: "nueva",
          createdAt: new Date().toISOString(),
        },
        201,
      );
    }
  }

  return fail(404, "NOT_FOUND", "Route not found");
}

// ---------------------------------------------------------------------------
// fetch patch
// ---------------------------------------------------------------------------

const realFetch = window.fetch.bind(window);

window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const request = new Request(input as RequestInfo, init);
  const url = new URL(request.url, window.location.href);

  if (!url.pathname.startsWith("/api/")) return realFetch(input as RequestInfo, init);

  // Query strings only ever narrow a list the storefront re-filters client-side
  // (lib/catalog.ts pulls limit=100 and does the rest in memory), so the snapshot is
  // keyed on the path alone.
  const path = url.pathname;

  let body: Json = {};
  if (request.method !== "GET" && request.method !== "HEAD") {
    const text = await request.text();
    if (text) {
      try {
        body = JSON.parse(text) as Json;
      } catch {
        body = {};
      }
    }
  }

  // A touch of latency so loading states are visible rather than flashing past.
  await new Promise((resolve) => setTimeout(resolve, 120));

  return handle(request.method.toUpperCase(), path, request.headers, body);
};
