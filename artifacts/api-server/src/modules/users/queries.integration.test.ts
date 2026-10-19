import { describe, it, expect, beforeEach } from "vitest";
import { db, orders } from "@workspace/db";
import { eq } from "drizzle-orm";
import { updateProfileRow } from "./queries";
import { resetDatabase, seedProfile, seedOrderInState } from "../../test/db";

// Staff read a customer's contact from the snapshot on each order. A correction to the profile
// has to reach the orders still in progress, and must leave closed ones as they were.

beforeEach(async () => {
  await resetDatabase();
});

async function contactOf(orderId: string) {
  const [row] = await db
    .select({ name: orders.contactName, phone: orders.contactPhone })
    .from(orders)
    .where(eq(orders.id, orderId));
  return row;
}

async function seedOrderWithContact(
  userId: string,
  fulfillmentStatus: (typeof orders.$inferInsert)["fulfillmentStatus"],
) {
  const id = await seedOrderInState(userId, fulfillmentStatus ? "pagado" : "pendiente_pago");
  await db
    .update(orders)
    .set({ fulfillmentStatus, contactName: "Ana Vieja", contactPhone: "111" })
    .where(eq(orders.id, id));
  return id;
}

describe("correcting a profile's contact", () => {
  it("copies the new name and phone onto open orders, unpaid ones included", async () => {
    const user = await seedProfile({ fullName: "Ana Vieja", phone: "111" });
    const unpaid = await seedOrderWithContact(user, null);
    const shipped = await seedOrderWithContact(user, "enviado");

    await updateProfileRow(user, { fullName: "Ana Nueva", phone: "222" });

    expect(await contactOf(unpaid)).toEqual({ name: "Ana Nueva", phone: "222" });
    expect(await contactOf(shipped)).toEqual({ name: "Ana Nueva", phone: "222" });
  });

  it("leaves delivered and picked-up orders with the contact they closed with", async () => {
    const user = await seedProfile({ fullName: "Ana Vieja", phone: "111" });
    const delivered = await seedOrderWithContact(user, "entregado");
    const pickedUp = await seedOrderWithContact(user, "recogido");

    await updateProfileRow(user, { phone: "222" });

    expect(await contactOf(delivered)).toEqual({ name: "Ana Vieja", phone: "111" });
    expect(await contactOf(pickedUp)).toEqual({ name: "Ana Vieja", phone: "111" });
  });

  it("copies only the field that changed, and never touches another customer's orders", async () => {
    const user = await seedProfile({ fullName: "Ana Vieja", phone: "111" });
    const other = await seedProfile({ fullName: "Ana Vieja", phone: "111" });
    const mine = await seedOrderWithContact(user, null);
    const theirs = await seedOrderWithContact(other, null);

    await updateProfileRow(user, { phone: "222" });

    expect(await contactOf(mine)).toEqual({ name: "Ana Vieja", phone: "222" });
    expect(await contactOf(theirs)).toEqual({ name: "Ana Vieja", phone: "111" });
  });

  it("leaves orders alone when only the shipping address changes", async () => {
    const user = await seedProfile({ fullName: "Ana Vieja", phone: "111" });
    const open = await seedOrderWithContact(user, null);

    await updateProfileRow(user, { shippingAddress: "Av. Nueva 456" });

    expect(await contactOf(open)).toEqual({ name: "Ana Vieja", phone: "111" });
  });
});
