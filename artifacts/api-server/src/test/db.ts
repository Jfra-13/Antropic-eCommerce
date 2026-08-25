import { sql } from "drizzle-orm";
import {
  db,
  categories,
  products,
  productVariants,
  profiles,
  orders,
  orderItems,
} from "@workspace/db";

// Harness for the integration tests.
//
// THESE HELPERS TRUNCATE TABLES. That is the point — each test needs a known starting state —
// but it also means pointing them at the wrong database destroys it. The guard below is the
// only thing standing between `pnpm test:integration` and a real dataset, so it refuses to run
// against anything that is not a local host. CI's Postgres service container is on localhost;
// a Supabase connection string never is.
function assertScratchDatabase(): void {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    throw new Error(
      "DATABASE_URL is required for integration tests. Point it at a throwaway database — " +
        "these tests truncate tables.",
    );
  }
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`DATABASE_URL is not a valid URL: ${url}`);
  }
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
    throw new Error(
      `Refusing to run destructive integration tests against host "${host}". ` +
        "Only a local throwaway database is allowed.",
    );
  }
}

// Ordered so CASCADE never has to guess. RESTART IDENTITY matters for the complaint correlativo:
// the tests assert LR-000001, which is only stable if the sequence restarts.
const TABLES = [
  "order_items",
  "payment_events",
  "orders",
  "payment_proofs",
  "product_variants",
  "products",
  "categories",
  "complaints",
  "consents",
  "notification_deliveries",
  "profiles",
] as const;

export async function resetDatabase(): Promise<void> {
  assertScratchDatabase();
  try {
    await db.execute(
      sql.raw(`truncate table ${TABLES.join(", ")} restart identity cascade`),
    );
  } catch (e) {
    // Drizzle wraps driver errors, so the useful text ("relation ... does not exist") sits on
    // the cause rather than the top-level message. Walk the chain or the hint never fires.
    const message = errorChain(e);
    if (/does not exist/i.test(message)) {
      throw new Error(
        `Schema is missing from the test database (${message}). ` +
          "Run: pnpm --filter @workspace/db run migrate",
      );
    }
    throw e;
  }
}

function errorChain(e: unknown): string {
  const parts: string[] = [];
  let current: unknown = e;
  while (current instanceof Error) {
    parts.push(current.message);
    current = current.cause;
  }
  return parts.length > 0 ? parts.join(" | ") : String(e);
}

let seq = 0;
const unique = () => `${Date.now()}-${++seq}`;

export async function seedProfile(
  overrides: { email?: string; role?: "customer" | "employee" | "admin" } = {},
): Promise<string> {
  const rows = await db
    .insert(profiles)
    .values({
      id: crypto.randomUUID(),
      email: overrides.email ?? `user-${unique()}@example.test`,
      role: overrides.role ?? "customer",
    })
    .returning({ id: profiles.id });
  return rows[0]!.id;
}

export type SeededVariant = { productId: string; variantId: string; sku: string };

// One category + product + variant, which is the smallest thing an order can point at.
export async function seedVariant(stock: number, price = "50.00"): Promise<SeededVariant> {
  const u = unique();
  const category = await db
    .insert(categories)
    .values({ name: `Cat ${u}`, slug: `cat-${u}` })
    .returning({ id: categories.id });
  const product = await db
    .insert(products)
    .values({ name: `Product ${u}`, slug: `product-${u}`, price, categoryId: category[0]!.id })
    .returning({ id: products.id });
  const sku = `SKU-${u}`;
  const variant = await db
    .insert(productVariants)
    .values({ productId: product[0]!.id, size: "M", color: "Rosa", sku, stock })
    .returning({ id: productVariants.id });
  return { productId: product[0]!.id, variantId: variant[0]!.id, sku };
}

// An order sitting in `en_verificacion`, i.e. exactly where the backoffice picks it up.
export async function seedOrderAwaitingApproval(
  userId: string,
  lines: { variantId: string; sku: string; quantity: number; unitPrice?: string }[],
): Promise<string> {
  const priced = lines.map((l) => ({ ...l, unitPrice: l.unitPrice ?? "50.00" }));
  const subtotalCents = priced.reduce(
    (sum, l) => sum + Math.round(Number(l.unitPrice) * 100) * l.quantity,
    0,
  );
  const total = (subtotalCents / 100).toFixed(2);

  const order = await db
    .insert(orders)
    .values({
      userId,
      paymentStatus: "en_verificacion",
      deliveryMethod: "delivery",
      shippingAddress: "Av. Test 123",
      subtotal: total,
      total,
    })
    .returning({ id: orders.id });

  await db.insert(orderItems).values(
    priced.map((l) => ({
      orderId: order[0]!.id,
      variantId: l.variantId,
      productName: "Producto de prueba",
      variantLabel: "M / Rosa",
      sku: l.sku,
      unitPrice: l.unitPrice,
      quantity: l.quantity,
      lineTotal: (Math.round(Number(l.unitPrice) * 100) * l.quantity / 100).toFixed(2),
    })),
  );
  return order[0]!.id;
}

// An order in an arbitrary payment state and, optionally, backdated. The expiry tests need
// both: the job only looks at orders older than a cutoff, and asserting that with real waiting
// would make the suite take days.
export async function seedOrderInState(
  userId: string,
  paymentStatus: (typeof orders.$inferInsert)["paymentStatus"],
  opts: { createdAt?: Date; deliveryMethod?: "delivery" | "recojo" } = {},
): Promise<string> {
  const row = await db
    .insert(orders)
    .values({
      userId,
      paymentStatus,
      deliveryMethod: opts.deliveryMethod ?? "delivery",
      shippingAddress: "Av. Test 123",
      subtotal: "50.00",
      total: "50.00",
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    })
    .returning({ id: orders.id });
  return row[0]!.id;
}

export async function orderPaymentStatus(orderId: string): Promise<string> {
  const rows = await db
    .select({ status: orders.paymentStatus })
    .from(orders)
    .where(sql`${orders.id} = ${orderId}`);
  return rows[0]!.status;
}

export async function variantStock(variantId: string): Promise<number> {
  const rows = await db
    .select({ stock: productVariants.stock })
    .from(productVariants)
    .where(sql`${productVariants.id} = ${variantId}`);
  return rows[0]!.stock;
}
