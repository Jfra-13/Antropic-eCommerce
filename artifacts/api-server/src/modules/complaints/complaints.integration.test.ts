import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db, complaints } from "@workspace/db";
import * as service from "./service";
import { dueDateFrom } from "./mappers";
import { resetDatabase, seedProfile, seedOrderInState } from "../../test/db";

// The Libro de Reclamaciones is the most heavily fined thing in this codebase. These tests pin
// the properties INDECOPI would check, so that a refactor that quietly breaks one fails here
// instead of in an inspection.

const validInput = {
  type: "reclamo" as const,
  consumerName: "María Quispe",
  consumerDocumentType: "dni" as const,
  consumerDocumentNumber: "45678912",
  consumerEmail: "maria@example.test",
  itemType: "producto" as const,
  itemDescription: "Vestido rosa talla M",
  detail: "Llegó con una costura abierta.",
  request: "Solicito el cambio.",
};

describe("filing a complaint", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("issues a gap-free correlativo starting at LR-000001", async () => {
    const first = await service.createComplaint(validInput, null);
    const second = await service.createComplaint({ ...validInput, type: "queja" }, null);

    expect(first.ok && first.receipt.code).toBe("LR-000001");
    expect(second.ok && second.receipt.code).toBe("LR-000002");
  });

  it("drops an order reference that does not exist, without a 500 or a gap in the correlativo", async () => {
    // Anyone can file without a session, so an invented uuid must not be able to burn a
    // complaint_number: the sequence does not give a value back on rollback.
    const userId = await seedProfile();
    const orderId = await seedOrderInState(userId, "pagado");

    const first = await service.createComplaint({ ...validInput, orderId }, null);
    const bogus = await service.createComplaint(
      { ...validInput, orderId: crypto.randomUUID() },
      null,
    );
    const third = await service.createComplaint(validInput, null);

    expect([first, bogus, third].map((r) => r.ok && r.receipt.code)).toEqual([
      "LR-000001",
      "LR-000002",
      "LR-000003",
    ]);
    const rows = await db.select().from(complaints).orderBy(complaints.complaintNumber);
    expect(rows.map((r) => r.orderId)).toEqual([orderId, null, null]);
  });

  it("accepts a complaint with no account behind it", async () => {
    // userId null is the normal case, not an edge case: requiring registration to complain
    // would obstruct the right the book exists to guarantee.
    const result = await service.createComplaint(validInput, null);
    expect(result.ok).toBe(true);

    const [row] = await db.select().from(complaints);
    expect(row!.userId).toBeNull();
  });

  it("attributes the filing when the person happens to be signed in", async () => {
    const userId = await seedProfile();
    await service.createComplaint(validInput, userId);

    const [row] = await db.select().from(complaints);
    expect(row!.userId).toBe(userId);
  });

  it("stamps the 15 business day legal deadline at filing time", async () => {
    // The arithmetic is covered in mappers.test.ts; this proves the stored column uses it,
    // measured from the database's own created_at.
    await service.createComplaint(validInput, null);

    const [row] = await db.select().from(complaints);
    expect(row!.dueAt.toISOString()).toBe(dueDateFrom(row!.createdAt).toISOString());
  });

  it("refuses a complaint for a minor with no guardian named", async () => {
    const result = await service.createComplaint({ ...validInput, isMinor: true }, null);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.code).toBe("GUARDIAN_REQUIRED");
    // And nothing was written: a rejected filing must not leave a half-record behind.
    expect(await db.select().from(complaints)).toHaveLength(0);
  });

  it("accepts the same complaint once a guardian is named", async () => {
    const result = await service.createComplaint(
      { ...validInput, isMinor: true, guardianName: "Rosa Quispe" },
      null,
    );
    expect(result.ok).toBe(true);
  });
});

describe("responding to a complaint", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("records who answered and when", async () => {
    const adminId = await seedProfile({ role: "admin" });
    const filed = await service.createComplaint(validInput, null);
    const id = filed.ok ? filed.receipt.id : "";

    const result = await service.respond(id, "resuelto", "Se aprobó el cambio.", adminId);

    expect(result.ok).toBe(true);
    const [row] = await db.select().from(complaints).where(eq(complaints.id, id));
    expect(row!.status).toBe("resuelto");
    expect(row!.response).toBe("Se aprobó el cambio.");
    expect(row!.respondedBy).toBe(adminId);
    expect(row!.respondedAt).not.toBeNull();
  });

  it("does not stamp a response time for a bare status change", async () => {
    // Moving a file to `en_proceso` is not an answer, and must not look like one — the
    // legal clock is measured against a real response.
    const adminId = await seedProfile({ role: "admin" });
    const filed = await service.createComplaint(validInput, null);
    const id = filed.ok ? filed.receipt.id : "";

    await service.respond(id, "en_proceso", null, adminId);

    const [row] = await db.select().from(complaints).where(eq(complaints.id, id));
    expect(row!.status).toBe("en_proceso");
    expect(row!.respondedAt).toBeNull();
    expect(row!.response).toBeNull();
  });

  it("reports days remaining, negative once the deadline has passed", async () => {
    const filed = await service.createComplaint(validInput, null);
    const id = filed.ok ? filed.receipt.id : "";
    // Backdate the deadline to simulate a file that has run out of time.
    await db
      .update(complaints)
      .set({ dueAt: new Date(Date.now() - 3 * 86_400_000) })
      .where(eq(complaints.id, id));

    const list = await service.getComplaints(undefined, undefined, 1, 50);
    expect(list.items[0]!.daysRemaining).toBeLessThan(0);
  });

  it("lists open files before settled ones, soonest deadline first", async () => {
    const adminId = await seedProfile({ role: "admin" });
    const a = await service.createComplaint(validInput, null);
    const b = await service.createComplaint(validInput, null);
    await service.respond(a.ok ? a.receipt.id : "", "resuelto", "Resuelto.", adminId);

    const list = await service.getComplaints(undefined, undefined, 1, 50);
    // The still-open one has to surface above the answered one regardless of arrival order.
    expect(list.items[0]!.id).toBe(b.ok ? b.receipt.id : "");
    expect(list.items[0]!.status).toBe("pendiente");
  });
});
