import { describe, it, expect } from "vitest";
import { complaintCode, dueDateFrom, daysRemaining, LEGAL_RESPONSE_DAYS } from "./mappers";

// The correlativo and the 30-day deadline are legal artefacts: INDECOPI checks both. They are
// tested here, away from the database, so a regression shows up as a failing assertion rather
// than as a fine.

describe("complaintCode", () => {
  it("pads the serial to the six-digit correlativo", () => {
    expect(complaintCode(1)).toBe("LR-000001");
    expect(complaintCode(42)).toBe("LR-000042");
    expect(complaintCode(999_999)).toBe("LR-999999");
  });

  it("keeps growing past six digits instead of truncating", () => {
    // Truncating would start reissuing codes that already exist.
    expect(complaintCode(1_000_000)).toBe("LR-1000000");
  });
});

describe("dueDateFrom", () => {
  it("is 30 calendar days after filing", () => {
    const filed = new Date("2026-08-18T10:00:00Z");
    expect(dueDateFrom(filed).toISOString()).toBe("2026-09-17T10:00:00.000Z");
  });

  it("counts calendar days, not working days — weekends and holidays included", () => {
    const filed = new Date("2026-08-18T00:00:00Z");
    const diffDays = (dueDateFrom(filed).getTime() - filed.getTime()) / 86_400_000;
    expect(diffDays).toBe(LEGAL_RESPONSE_DAYS);
  });

  it("crosses month and year boundaries", () => {
    expect(dueDateFrom(new Date("2026-12-20T00:00:00Z")).toISOString()).toBe(
      "2027-01-19T00:00:00.000Z",
    );
  });
});

describe("daysRemaining", () => {
  const due = new Date("2026-09-17T10:00:00Z");

  it("counts down while there is time left", () => {
    expect(daysRemaining(due, new Date("2026-08-18T10:00:00Z"))).toBe(30);
    expect(daysRemaining(due, new Date("2026-09-16T10:00:00Z"))).toBe(1);
  });

  it("goes negative once the deadline has passed", () => {
    // Overdue files must surface, not silently read as zero.
    expect(daysRemaining(due, new Date("2026-09-20T10:00:00Z"))).toBe(-3);
  });

  it("still reads as the last day while any time remains on it", () => {
    // Rounding up matters: with 2 hours left the business has today, not zero days.
    expect(daysRemaining(due, new Date("2026-09-17T08:00:00Z"))).toBe(1);
  });
});
