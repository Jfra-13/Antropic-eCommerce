import { db, paymentProofs, orders, type Order } from "@workspace/db";
import { eq } from "drizzle-orm";

// Attach a proof and move the order to verification in one transaction (two writes must not
// diverge). Returns the updated order row.
export async function attachProofAndVerify(
  orderId: string,
  storagePath: string,
  amountReported: string | null,
): Promise<Order> {
  return db.transaction(async (tx) => {
    await tx.insert(paymentProofs).values({ orderId, storagePath, amountReported });
    const rows = await tx
      .update(orders)
      .set({ paymentStatus: "en_verificacion" })
      .where(eq(orders.id, orderId))
      .returning();
    const order = rows[0];
    if (!order) throw new Error(`Order ${orderId} vanished during proof attach`);
    return order;
  });
}
