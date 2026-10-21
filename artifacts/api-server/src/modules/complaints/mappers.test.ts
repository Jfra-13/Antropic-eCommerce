import { describe, it, expect } from "vitest";
import { complaintCode, dueDateFrom, daysRemaining } from "./mappers";

// The correlativo and the 15-business-day deadline are legal artefacts: INDECOPI checks both.
// They are tested here, away from the database, so a regression shows up as a failing assertion
// rather than as a fine. Every instant below is written with its Lima offset (-05:00), because
// the business day is a Lima day.

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
  it("ends on the 15th business day after filing, skipping weekends", () => {
    // Filed Monday 2026-08-17. Business days start on Tuesday the 18th; the 15th is Monday
    // 2026-09-07 (three weekends skipped).
    const filed = new Date("2026-08-17T10:00:00-05:00");
    expect(dueDateFrom(filed).toISOString()).toBe("2026-09-08T04:59:59.999Z");
  });

  it("does not count the filing day, even when filed at the start of it", () => {
    expect(dueDateFrom(new Date("2026-08-17T00:00:00-05:00")).toISOString()).toBe(
      "2026-09-08T04:59:59.999Z",
    );
  });

  it("starts counting on Monday when filed on a weekend", () => {
    // Saturday and Sunday filings both land on the same deadline as a Friday one.
    const fromFriday = dueDateFrom(new Date("2026-08-21T12:00:00-05:00"));
    expect(dueDateFrom(new Date("2026-08-22T12:00:00-05:00"))).toEqual(fromFriday);
    expect(dueDateFrom(new Date("2026-08-23T12:00:00-05:00"))).toEqual(fromFriday);
    // Friday 2026-08-21 + 15 business days = Friday 2026-09-11.
    expect(fromFriday.toISOString()).toBe("2026-09-12T04:59:59.999Z");
  });

  it("uses the Lima day, not the UTC one, for a late-evening filing", () => {
    // 22:00 Friday in Lima is already Saturday in UTC. Counted in UTC it would start a day
    // late and give the business an extra day the law does not.
    const lateFriday = new Date("2026-08-21T22:00:00-05:00");
    expect(dueDateFrom(lateFriday).toISOString()).toBe("2026-09-12T04:59:59.999Z");
  });

  it("crosses month and year boundaries", () => {
    // Filed Friday 2026-12-18; the 15th business day is Friday 2027-01-08.
    expect(dueDateFrom(new Date("2026-12-18T09:00:00-05:00")).toISOString()).toBe(
      "2027-01-09T04:59:59.999Z",
    );
  });
});

describe("daysRemaining", () => {
  // Due at the end of Monday 2026-09-07 in Lima.
  const due = dueDateFrom(new Date("2026-08-17T10:00:00-05:00"));

  it("starts at 15 on the filing day", () => {
    expect(daysRemaining(due, new Date("2026-08-17T10:00:00-05:00"))).toBe(15);
  });

  it("does not drop over a weekend", () => {
    // From Friday 2026-09-04 only Monday is left; the weekend in between costs nothing.
    expect(daysRemaining(due, new Date("2026-09-04T10:00:00-05:00"))).toBe(1);
    expect(daysRemaining(due, new Date("2026-09-05T10:00:00-05:00"))).toBe(1);
    expect(daysRemaining(due, new Date("2026-09-06T23:00:00-05:00"))).toBe(1);
  });

  it("reads 0 on the due day, until the day is over", () => {
    // 0 is "vence hoy", not overdue: the business still has the rest of today.
    expect(daysRemaining(due, new Date("2026-09-07T00:00:00-05:00"))).toBe(0);
    expect(daysRemaining(due, new Date("2026-09-07T23:59:00-05:00"))).toBe(0);
  });

  it("goes negative once the deadline has passed", () => {
    // Overdue files must surface, not silently read as zero.
    expect(daysRemaining(due, new Date("2026-09-08T00:01:00-05:00"))).toBe(-1);
    expect(daysRemaining(due, new Date("2026-09-10T10:00:00-05:00"))).toBe(-3);
  });

  it("stays negative over a weekend that follows the deadline", () => {
    // Due Friday; on Saturday and Sunday no business day has passed, but it is overdue.
    const dueFriday = dueDateFrom(new Date("2026-08-21T12:00:00-05:00"));
    expect(daysRemaining(dueFriday, new Date("2026-09-12T10:00:00-05:00"))).toBe(-1);
    expect(daysRemaining(dueFriday, new Date("2026-09-13T10:00:00-05:00"))).toBe(-1);
    expect(daysRemaining(dueFriday, new Date("2026-09-14T10:00:00-05:00"))).toBe(-1);
  });
});
