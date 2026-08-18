import { describe, it, expect, beforeEach } from "vitest";
import { asc } from "drizzle-orm";
import { db, consents } from "@workspace/db";
import * as service from "./service";
import { resetDatabase } from "../../test/db";

// The consent ledger only has value if it is append-only and if its context cannot be forged.
// Both properties are invisible in a code review of a single function, so they are pinned here.

const context = { userId: null, ipAddress: "203.0.113.10", userAgent: "TestAgent/1.0" };

describe("consent ledger", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("keeps one row per purpose rather than one per person", async () => {
    // Agreeing to have an order processed is not agreeing to be marketed to, so the two can
    // never collapse into a single record.
    await service.record(
      { purpose: "pedido", granted: true, policyVersion: "v1", email: "a@example.test" },
      context,
    );
    await service.record(
      { purpose: "marketing", granted: false, policyVersion: "v1", email: "a@example.test" },
      context,
    );

    const rows = await db.select().from(consents).orderBy(asc(consents.createdAt));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => [r.purpose, r.granted])).toEqual([
      ["pedido", true],
      ["marketing", false],
    ]);
  });

  it("records a withdrawal as a new row, leaving the original grant intact", async () => {
    // If withdrawing erased the grant, the business could no longer show what was agreed to
    // and when — which is the whole point of keeping the ledger.
    const input = { purpose: "cookies_analytics" as const, policyVersion: "v1", email: null };
    await service.record({ ...input, granted: true }, context);
    await service.record({ ...input, granted: false }, context);

    const rows = await db.select().from(consents).orderBy(asc(consents.createdAt));
    expect(rows).toHaveLength(2);
    expect(rows[0]!.granted).toBe(true);
    expect(rows[1]!.granted).toBe(false);
  });

  it("pins the version of the text that was actually shown", async () => {
    await service.record(
      { purpose: "marketing", granted: true, policyVersion: "v7", email: null },
      context,
    );
    const [row] = await db.select().from(consents);
    expect(row!.policyVersion).toBe("v7");
  });

  it("takes the request context from the caller's environment, not from the payload", async () => {
    // The service signature is what enforces this: there is no way to pass an IP through the
    // consent input, so a client cannot mint a record that points somewhere else.
    await service.record(
      { purpose: "marketing", granted: true, policyVersion: "v1", email: null },
      { userId: null, ipAddress: "198.51.100.7", userAgent: "RealAgent/2.0" },
    );
    const [row] = await db.select().from(consents);
    expect(row!.ipAddress).toBe("198.51.100.7");
    expect(row!.userAgent).toBe("RealAgent/2.0");
  });
});
