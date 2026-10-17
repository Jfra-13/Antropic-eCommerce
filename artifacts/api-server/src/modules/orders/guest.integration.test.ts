import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Request, Response } from "express";
import {
  db,
  coupons,
  couponRedemptions,
  orders,
  orderItems,
  paymentEvents,
  profiles,
  notificationDeliveries,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { CreateGuestOrderInput } from "@workspace/api-zod";
import { createGuestOrder, claimGuestOrders } from "./service";
import { requireGuestOrder, GUEST_TOKEN_HEADER } from "./guest-access";
import { listAdminOrders } from "./queries";
import { attachProof } from "../payments/service";
import { notifyGuestOrderPlaced } from "../notifications/service";
import { listProfiles } from "../users/queries";
import { resetDatabase, seedProfile, seedVariant, seedOrderInState } from "../../test/db";

// Fase 9 — checkout de invitado (auditoría §1.4). Against real Postgres because what is under
// test is mostly database behaviour: the guest profile and the order commit or roll back
// together, the idempotency key is a unique index, a single-use coupon is consumed under a
// row lock, and claiming re-points rows in one transaction.

function guestInput(
  variantId: string,
  overrides: Partial<CreateGuestOrderInput> = {},
): CreateGuestOrderInput {
  return {
    email: "Invitada@Example.test",
    fullName: "Ana Invitada",
    phone: "999 888 777",
    items: [{ variantId, quantity: 1 }],
    deliveryMethod: "delivery",
    shippingAddress: "Av. Invitada 123",
    ...overrides,
  };
}

async function guestProfilesFor(email: string) {
  return db
    .select()
    .from(profiles)
    .where(and(eq(profiles.isGuest, true), eq(profiles.email, email)));
}

async function placeGuestOrder(input: CreateGuestOrderInput) {
  const result = await createGuestOrder(input);
  if (!result.ok) throw new Error(`expected an order, got ${result.code}`);
  return result.receipt;
}

// requireGuestOrder is Express middleware; driving it with a minimal req/res is enough to see
// what it lets through without standing up the whole app.
async function openWithToken(orderId: string, token: string | undefined) {
  const req = {
    params: { id: orderId },
    get: (name: string) => (name === GUEST_TOKEN_HEADER ? token : undefined),
  } as unknown as Request;
  let status = 200;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json() {
      return this;
    },
  } as unknown as Response;
  let passed = false;
  await requireGuestOrder(req, res, () => {
    passed = true;
  });
  return { passed, status, order: req.guestOrder };
}

beforeEach(async () => {
  await resetDatabase();
  // Notifications are fire-and-forget and the outbox tries to deliver straight away. The
  // transport is the only thing faked: nothing in these tests may reach the network.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, text: async () => "" }) as unknown as Response),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("placing a guest order", () => {
  it("creates the order on a guest profile, priced from the catalogue, with an access token", async () => {
    const { variantId } = await seedVariant(5, "50.00");

    const result = await createGuestOrder(guestInput(variantId, { items: [{ variantId, quantity: 2 }] }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe(201);
    expect(result.receipt.order.total).toBe("100.00");
    expect(result.receipt.order.paymentStatus).toBe("pendiente_pago");
    expect(result.receipt.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // One guest profile, email normalised, holding the contact details logistics will use.
    const guests = await guestProfilesFor("invitada@example.test");
    expect(guests).toHaveLength(1);
    expect(guests[0]).toMatchObject({ fullName: "Ana Invitada", phone: "999 888 777", isGuest: true });

    const row = await db.select().from(orders).where(eq(orders.id, result.receipt.order.id));
    expect(row[0]!.userId).toBe(guests[0]!.id);
    expect(row[0]!.guestAccessToken).toBe(result.receipt.accessToken);
  });

  it("shows up on the backoffice board through the same profile join as any other order", async () => {
    // The reason for guest PROFILES over a nullable user_id: an inner join on a null drops the
    // row, and a guest order that staff cannot see is one nobody will ever verify.
    const { variantId } = await seedVariant(5);
    const receipt = await placeGuestOrder(guestInput(variantId));

    const { rows } = await listAdminOrders({}, 1, 20);
    expect(rows.map((r) => r.order.id)).toContain(receipt.order.id);
    expect(rows[0]).toMatchObject({ customerEmail: "invitada@example.test", customerIsGuest: true });
  });

  it("folds repeated lines for the same variant before checking stock", async () => {
    // Two lines of 2 against 3 units. Checked line by line each would pass; folded, the
    // order asks for 4 and must be refused.
    const { variantId } = await seedVariant(3);
    const result = await createGuestOrder(
      guestInput(variantId, {
        items: [
          { variantId, quantity: 2 },
          { variantId, quantity: 2 },
        ],
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("OUT_OF_STOCK");
  });

  it("refuses a variant that does not exist, without writing anything", async () => {
    const result = await createGuestOrder(guestInput(crypto.randomUUID()));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
    expect(await guestProfilesFor("invitada@example.test")).toHaveLength(0);
  });

  it("refuses an email whose account staff have blocked", async () => {
    await seedProfile({ email: "invitada@example.test", blocked: true });
    const { variantId } = await seedVariant(5);

    const result = await createGuestOrder(guestInput(variantId));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("BLOCKED");
    expect(await guestProfilesFor("invitada@example.test")).toHaveLength(0);
  });

  it("gives every guest order its own profile, so a second checkout cannot rewrite the first", async () => {
    // Reusing the profile by email would let anyone who types a stranger's address replace the
    // name and phone staff see on that stranger's pending order.
    const { variantId } = await seedVariant(5);
    const first = await placeGuestOrder(guestInput(variantId));
    await placeGuestOrder(guestInput(variantId, { fullName: "Otra Persona", phone: "111" }));

    const { rows } = await listAdminOrders({}, 1, 20);
    const original = rows.find((r) => r.order.id === first.order.id)!;
    expect(original.customerName).toBe("Ana Invitada");
    expect(await guestProfilesFor("invitada@example.test")).toHaveLength(2);
  });
});

describe("guest idempotency", () => {
  it("returns the same order and token for a repeated key with the same email", async () => {
    const { variantId } = await seedVariant(5);
    const input = guestInput(variantId, { idempotencyKey: "key-1" });

    const first = await placeGuestOrder(input);
    const again = await createGuestOrder({ ...input, email: "invitada@example.test" });

    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.status).toBe(200);
    expect(again.receipt.order.id).toBe(first.order.id);
    expect(again.receipt.accessToken).toBe(first.accessToken);
    expect(await db.select().from(orders)).toHaveLength(1);
  });

  it("creates exactly one order when the same key arrives twice at once", async () => {
    // The double click on "Confirmar". Both requests miss the replay lookup, both open a
    // transaction; the unique index on the key lets one commit and the other must come back
    // with the winner's order — not a 500 and not a second order.
    const { variantId } = await seedVariant(5);
    const input = guestInput(variantId, { idempotencyKey: "key-race" });

    const [a, b] = await Promise.all([createGuestOrder(input), createGuestOrder(input)]);

    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.receipt.order.id).toBe(b.receipt.order.id);
    expect(await db.select().from(orders)).toHaveLength(1);
    expect(await guestProfilesFor("invitada@example.test")).toHaveLength(1);
  });

  it("will not hand an order and its token to a caller with a different email", async () => {
    const { variantId } = await seedVariant(5);
    await placeGuestOrder(guestInput(variantId, { idempotencyKey: "key-2" }));

    const other = await createGuestOrder(
      guestInput(variantId, { idempotencyKey: "key-2", email: "otra@example.test" }),
    );

    expect(other.ok).toBe(false);
    if (other.ok) return;
    expect(other.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("answers 409, not 500, for a key that belongs to an account order", async () => {
    const accountId = await seedProfile();
    const accountOrder = await seedOrderInState(accountId, "pendiente_pago");
    await db.update(orders).set({ idempotencyKey: "key-3" }).where(eq(orders.id, accountOrder));
    const { variantId } = await seedVariant(5);

    const result = await createGuestOrder(guestInput(variantId, { idempotencyKey: "key-3" }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });
});

describe("guest orders and coupons", () => {
  it("leaves no orphan guest profile behind when the coupon race is lost", async () => {
    // A single-use coupon, two guests at once. One wins; the loser's guest profile was written
    // inside the order transaction, so it must roll back with it.
    await db.insert(coupons).values({ code: "UNICO", type: "percent", value: "10", maxUses: 1 });
    const { variantId } = await seedVariant(5);

    const [a, b] = await Promise.all([
      createGuestOrder(guestInput(variantId, { email: "a@example.test", couponCode: "UNICO" })),
      createGuestOrder(guestInput(variantId, { email: "b@example.test", couponCode: "UNICO" })),
    ]);

    const outcomes = [a.ok, b.ok].sort();
    expect(outcomes).toEqual([false, true]);
    const loser = a.ok ? "b@example.test" : "a@example.test";
    expect(await guestProfilesFor(loser)).toHaveLength(0);
    expect(await db.select().from(couponRedemptions)).toHaveLength(1);
  });
});

describe("opening a guest order with its token", () => {
  it("lets the right token through and attaches the order", async () => {
    const { variantId } = await seedVariant(5);
    const receipt = await placeGuestOrder(guestInput(variantId));

    const opened = await openWithToken(receipt.order.id, receipt.accessToken);

    expect(opened.passed).toBe(true);
    expect(opened.order?.id).toBe(receipt.order.id);
  });

  it("answers the same 404 for a wrong token, no token, an account order and a malformed id", async () => {
    const { variantId } = await seedVariant(5);
    const receipt = await placeGuestOrder(guestInput(variantId));
    const accountOrder = await seedOrderInState(await seedProfile(), "pendiente_pago");
    const otherGuest = await placeGuestOrder(guestInput(variantId, { email: "otra@example.test" }));

    const attempts = await Promise.all([
      openWithToken(receipt.order.id, "not-the-token"),
      openWithToken(receipt.order.id, undefined),
      // A valid token, but for a different order: tokens open one order, not any order.
      openWithToken(receipt.order.id, otherGuest.accessToken),
      openWithToken(accountOrder, receipt.accessToken),
      openWithToken("not-a-uuid", receipt.accessToken),
    ]);

    for (const attempt of attempts) {
      expect(attempt.passed).toBe(false);
      expect(attempt.status).toBe(404);
    }
  });
});

describe("guest constancia upload", () => {
  it("moves the order to verification, recording the guest as the actor", async () => {
    const { variantId } = await seedVariant(5);
    const receipt = await placeGuestOrder(guestInput(variantId));
    const [guest] = await guestProfilesFor("invitada@example.test");
    const path = `${receipt.order.id}/${crypto.randomUUID()}`;

    const result = await attachProof(guest!.id, receipt.order.id, path, "50.00");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.paymentStatus).toBe("en_verificacion");
    const events = await db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.orderId, receipt.order.id));
    expect(events[0]).toMatchObject({ type: "proof_attached", actorId: guest!.id });
  });

  it("refuses a path that was issued for another order", async () => {
    // Without this check one order could be "paid" with a constancia uploaded for another.
    const { variantId } = await seedVariant(5);
    const receipt = await placeGuestOrder(guestInput(variantId));
    const other = await placeGuestOrder(guestInput(variantId, { email: "otra@example.test" }));
    const [guest] = await guestProfilesFor("invitada@example.test");

    const result = await attachProof(
      guest!.id,
      receipt.order.id,
      `${other.order.id}/${crypto.randomUUID()}`,
      null,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_PROOF_PATH");
    const row = await db.select().from(orders).where(eq(orders.id, receipt.order.id));
    expect(row[0]!.paymentStatus).toBe("pendiente_pago");
  });
});

describe("the way back by email", () => {
  it("queues a confirmation to the guest's address", async () => {
    const { variantId } = await seedVariant(5);
    const receipt = await placeGuestOrder(guestInput(variantId));
    const [order] = await db.select().from(orders).where(eq(orders.id, receipt.order.id));

    await notifyGuestOrderPlaced(order!);

    const rows = await db
      .select()
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.kind, "guest_order_placed"),
          eq(notificationDeliveries.relatedId, receipt.order.id),
        ),
      );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]!.recipient).toBe("invitada@example.test");
  });
});

describe("claiming guest orders into an account", () => {
  async function seedGuestHistory() {
    const { variantId } = await seedVariant(10);
    await db.insert(coupons).values({ code: "BIENVENIDA", type: "percent", value: "10" });
    const first = await placeGuestOrder(guestInput(variantId, { couponCode: "BIENVENIDA" }));
    const second = await placeGuestOrder(
      guestInput(variantId, { email: "INVITADA@example.test", phone: "999 000 111" }),
    );
    const unrelated = await placeGuestOrder(guestInput(variantId, { email: "otra@example.test" }));
    return { first, second, unrelated };
  }

  it("moves every guest order under that email — and nothing else — into the account", async () => {
    const { first, second, unrelated } = await seedGuestHistory();
    const accountId = await seedProfile({ email: "invitada@example.test" });

    const result = await claimGuestOrders({
      id: accountId,
      email: "Invitada@example.test",
      emailProven: true,
    });

    expect(result).toEqual({ ok: true, claimed: 2 });
    // Staff now see an account customer, not a guest.
    const board = await listAdminOrders({}, 1, 20);
    expect(board.rows.find((r) => r.order.id === first.order.id)!.customerIsGuest).toBe(false);
    const owned = await db.select().from(orders).where(eq(orders.userId, accountId));
    expect(owned.map((o) => o.id).sort()).toEqual([first.order.id, second.order.id].sort());
    const stranger = await db.select().from(orders).where(eq(orders.id, unrelated.order.id));
    expect(stranger[0]!.userId).not.toBe(accountId);
    // The coupon use follows the order, so the account's redemption history is complete.
    const redemptions = await db.select().from(couponRedemptions);
    expect(redemptions[0]!.userId).toBe(accountId);
    // The links already emailed keep working after the claim.
    expect((await openWithToken(first.order.id, first.accessToken)).passed).toBe(true);
  });

  it("fills the account's empty contact fields from the latest guest checkout, and only those", async () => {
    await seedGuestHistory();
    const emptyAccount = await seedProfile({ email: "invitada@example.test" });

    await claimGuestOrders({ id: emptyAccount, email: "invitada@example.test", emailProven: true });

    const [filled] = await db.select().from(profiles).where(eq(profiles.id, emptyAccount));
    expect(filled).toMatchObject({ fullName: "Ana Invitada", phone: "999 000 111" });
  });

  it("never overwrites what the customer already put in their account", async () => {
    await seedGuestHistory();
    const account = await seedProfile({
      email: "invitada@example.test",
      fullName: "Ana Cuenta",
      phone: "123",
    });

    await claimGuestOrders({ id: account, email: "invitada@example.test", emailProven: true });

    const [kept] = await db.select().from(profiles).where(eq(profiles.id, account));
    expect(kept).toMatchObject({ fullName: "Ana Cuenta", phone: "123" });
  });

  it("refuses when the session does not prove the email, and moves nothing", async () => {
    // A password signup with confirmation off proves nothing about the address. Without this
    // gate, registering someone's email would hand over their orders, address and phone.
    const { first } = await seedGuestHistory();
    const account = await seedProfile({ email: "invitada@example.test" });

    const result = await claimGuestOrders({
      id: account,
      email: "invitada@example.test",
      emailProven: false,
    });

    expect(result.ok).toBe(false);
    const row = await db.select().from(orders).where(eq(orders.id, first.order.id));
    expect(row[0]!.userId).not.toBe(account);
  });

  it("is idempotent: a second claim finds nothing left to move", async () => {
    await seedGuestHistory();
    const account = await seedProfile({ email: "invitada@example.test" });
    const user = { id: account, email: "invitada@example.test", emailProven: true };

    await claimGuestOrders(user);
    expect(await claimGuestOrders(user)).toEqual({ ok: true, claimed: 0 });
  });

  it("keeps the guest profiles, because the payment history still points at them", async () => {
    const { variantId } = await seedVariant(5);
    const receipt = await placeGuestOrder(guestInput(variantId));
    const [guest] = await guestProfilesFor("invitada@example.test");
    await attachProof(guest!.id, receipt.order.id, `${receipt.order.id}/${crypto.randomUUID()}`, null);
    const account = await seedProfile({ email: "invitada@example.test" });

    await claimGuestOrders({ id: account, email: "invitada@example.test", emailProven: true });

    expect(await guestProfilesFor("invitada@example.test")).toHaveLength(1);
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, receipt.order.id));
    expect(items).toHaveLength(1);
  });
});

describe("the backoffice users list", () => {
  it("lists accounts only, not the contact records behind guest orders", async () => {
    const { variantId } = await seedVariant(5);
    await placeGuestOrder(guestInput(variantId));
    const accountId = await seedProfile({ email: "cuenta@example.test" });

    const { rows, total } = await listProfiles(undefined, undefined, 1, 50);

    expect(rows.map((r) => r.id)).toEqual([accountId]);
    expect(total).toBe(1);
  });
});
