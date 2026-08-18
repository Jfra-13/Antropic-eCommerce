import {
  db,
  complaints,
  orders,
  type Complaint,
  type InsertComplaint,
} from "@workspace/db";
import { and, desc, asc, eq, sql, type SQL } from "drizzle-orm";

type ComplaintStatus = Complaint["status"];
type ComplaintType = Complaint["type"];

export async function insertComplaint(values: InsertComplaint): Promise<Complaint> {
  const rows = await db.insert(complaints).values(values).returning();
  return rows[0]!;
}

export type AdminComplaintRow = {
  complaint: Complaint;
  orderNumber: number | null;
};

const adminComplaintColumns = {
  complaint: complaints,
  orderNumber: orders.orderNumber,
};

// Backoffice board. Ordered by legal deadline rather than by arrival: what matters is what is
// about to go overdue, not what came in most recently. Open files come first for the same
// reason — a resolved complaint with an old deadline is not urgent.
export async function listComplaints(
  status: ComplaintStatus | undefined,
  type: ComplaintType | undefined,
  page: number,
  limit: number,
): Promise<{ rows: AdminComplaintRow[]; total: number }> {
  const conds: SQL[] = [];
  if (status) conds.push(eq(complaints.status, status));
  if (type) conds.push(eq(complaints.type, type));
  const where = conds.length > 0 ? and(...conds) : undefined;
  const offset = (page - 1) * limit;

  const rows = await db
    .select(adminComplaintColumns)
    .from(complaints)
    // Left join: a queja about how someone was treated need not reference an order at all.
    .leftJoin(orders, eq(complaints.orderId, orders.id))
    .where(where)
    .orderBy(
      // Unanswered first, then soonest deadline.
      sql`case when ${complaints.status} in ('pendiente','en_proceso') then 0 else 1 end`,
      asc(complaints.dueAt),
      desc(complaints.createdAt),
    )
    .limit(limit)
    .offset(offset);

  const counted = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(complaints)
    .where(where);

  return { rows, total: counted[0]?.count ?? 0 };
}

export async function getAdminComplaintById(id: string): Promise<AdminComplaintRow | undefined> {
  const rows = await db
    .select(adminComplaintColumns)
    .from(complaints)
    .leftJoin(orders, eq(complaints.orderId, orders.id))
    .where(eq(complaints.id, id))
    .limit(1);
  return rows[0];
}

// Records the provider's response. There is no delete counterpart anywhere in this module:
// complaints are kept for two years, and `cerrado` is how a file ends.
export async function respondToComplaint(
  id: string,
  status: ComplaintStatus,
  response: string | null,
  respondedBy: string,
): Promise<boolean> {
  // respondedAt marks when an answer was actually given, so it is only stamped when there is
  // one. A status change on its own (pendiente -> en_proceso) is not a response.
  const patch: Record<string, unknown> = { status };
  if (response !== null) {
    patch["response"] = response;
    patch["respondedAt"] = new Date();
    patch["respondedBy"] = respondedBy;
  }
  const rows = await db
    .update(complaints)
    .set(patch)
    .where(eq(complaints.id, id))
    .returning({ id: complaints.id });
  return rows.length > 0;
}
