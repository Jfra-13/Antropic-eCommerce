import {
  db,
  returnTickets,
  orders,
  profiles,
  type ReturnTicket,
  type InsertReturnTicket,
} from "@workspace/db";
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

type ReturnStatus = ReturnTicket["status"];

// Ownership gate + eligibility data: a customer may only open a return for their own order,
// and only once it was delivered/picked up.
export async function getOrderForReturn(
  orderId: string,
  userId: string,
): Promise<{ fulfillmentStatus: string | null } | undefined> {
  const rows = await db
    .select({ fulfillmentStatus: orders.fulfillmentStatus })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
    .limit(1);
  return rows[0];
}

// An "open" ticket (nueva/en_proceso) blocks a second one for the same order.
export async function hasOpenTicket(orderId: string): Promise<boolean> {
  const rows = await db
    .select({ id: returnTickets.id })
    .from(returnTickets)
    .where(and(eq(returnTickets.orderId, orderId), inArray(returnTickets.status, ["nueva", "en_proceso"])))
    .limit(1);
  return rows.length > 0;
}

export async function listMyReturns(
  userId: string,
  orderId: string | undefined,
): Promise<ReturnTicket[]> {
  const conds = [eq(returnTickets.userId, userId)];
  if (orderId) conds.push(eq(returnTickets.orderId, orderId));
  return db
    .select()
    .from(returnTickets)
    .where(and(...conds))
    .orderBy(desc(returnTickets.createdAt));
}

export async function insertReturnTicket(values: InsertReturnTicket): Promise<ReturnTicket> {
  const rows = await db.insert(returnTickets).values(values).returning();
  return rows[0]!;
}

export type AdminReturnRow = {
  ticket: ReturnTicket;
  orderNumber: number;
  customerName: string | null;
  customerEmail: string;
  customerPhone: string | null;
};

const adminReturnColumns = {
  ticket: returnTickets,
  orderNumber: orders.orderNumber,
  customerName: profiles.fullName,
  customerEmail: profiles.email,
  customerPhone: profiles.phone,
};

// Backoffice board (requerimientos §6.7): tickets joined with order number + customer contact,
// newest first, optionally filtered by status.
export async function listReturns(
  status: ReturnStatus | undefined,
  page: number,
  limit: number,
): Promise<{ rows: AdminReturnRow[]; total: number }> {
  const where: SQL | undefined = status ? eq(returnTickets.status, status) : undefined;
  const offset = (page - 1) * limit;

  const rows = await db
    .select(adminReturnColumns)
    .from(returnTickets)
    .innerJoin(orders, eq(returnTickets.orderId, orders.id))
    .innerJoin(profiles, eq(returnTickets.userId, profiles.id))
    .where(where)
    .orderBy(desc(returnTickets.createdAt))
    .limit(limit)
    .offset(offset);

  const counted = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(returnTickets)
    .where(where);

  return { rows, total: counted[0]?.count ?? 0 };
}

export async function getAdminReturnById(id: string): Promise<AdminReturnRow | undefined> {
  const rows = await db
    .select(adminReturnColumns)
    .from(returnTickets)
    .innerJoin(orders, eq(returnTickets.orderId, orders.id))
    .innerJoin(profiles, eq(returnTickets.userId, profiles.id))
    .where(eq(returnTickets.id, id))
    .limit(1);
  return rows[0];
}

// Status is pure workflow tracking (no money/stock side effects), so any status is settable —
// no state machine like payments/fulfilment. Returns false when the ticket does not exist.
export async function updateReturnStatusRow(
  id: string,
  status: ReturnStatus,
): Promise<boolean> {
  const rows = await db
    .update(returnTickets)
    .set({ status })
    .where(eq(returnTickets.id, id))
    .returning({ id: returnTickets.id });
  return rows.length > 0;
}
