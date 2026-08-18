import { describe, it, expect } from "vitest";
import { toCents, fromCents } from "./money";

// Money is the one place in this codebase where a rounding bug is a refund, so these tests
// pin the exact behaviour rather than a general sense of correctness.

describe("toCents", () => {
  it("parses the DB's numeric(10,2) string form", () => {
    expect(toCents("12.50")).toBe(1250);
    expect(toCents("0.05")).toBe(5);
    expect(toCents("100.00")).toBe(10000);
  });

  it("accepts a single decimal place and a bare integer", () => {
    // Postgres hands back "12.5" and "12" depending on the value; both are 12.50 and 12.00.
    expect(toCents("12.5")).toBe(1250);
    expect(toCents("12")).toBe(1200);
  });

  it("truncates beyond two decimals instead of rounding up", () => {
    // Documented, deliberate: the column is scale 2, so a third digit is not money we hold.
    expect(toCents("12.999")).toBe(1299);
  });

  it("tolerates surrounding whitespace from a settings value", () => {
    expect(toCents(" 12.50 ")).toBe(1250);
  });

  it("rejects anything that is not money instead of inventing a number", () => {
    // Each of these used to return a plausible-looking value: 0, 0, 120, -500 and 100000.
    // A wrong number in a total is not discovered until someone is charged it.
    expect(() => toCents("abc")).toThrow(/Invalid money value/);
    expect(() => toCents("")).toThrow(/Invalid money value/);
    expect(() => toCents("   ")).toThrow(/Invalid money value/);
    expect(() => toCents("1.2.3")).toThrow(/Invalid money value/);
    expect(() => toCents("1e3")).toThrow(/Invalid money value/);
  });

  it("rejects negative money — this domain has none", () => {
    // Dangerous in combination with fromCents, which clamps negatives to "0.00": the bad
    // input would disappear instead of failing.
    expect(() => toCents("-5.00")).toThrow(/Invalid money value/);
  });
});

describe("fromCents", () => {
  it("always renders two decimal places", () => {
    expect(fromCents(1250)).toBe("12.50");
    expect(fromCents(5)).toBe("0.05");
    expect(fromCents(0)).toBe("0.00");
    expect(fromCents(10000)).toBe("100.00");
  });

  it("rounds a fractional cent to the nearest cent", () => {
    expect(fromCents(1250.6)).toBe("12.51");
    expect(fromCents(1250.4)).toBe("12.50");
  });

  it("clamps negatives to zero — there is no negative money in this domain", () => {
    // A discount larger than the subtotal must never render as a negative total.
    expect(fromCents(-500)).toBe("0.00");
  });
});

describe("round trip", () => {
  it("survives the arithmetic the checkout actually does", () => {
    // The exact cases that break when someone reaches for floats.
    expect(fromCents(toCents("12.50") + toCents("0.05"))).toBe("12.55");
    expect(fromCents(toCents("100") - toCents("0.01"))).toBe("99.99");
    expect(fromCents(toCents("0.10") * 3)).toBe("0.30");
  });

  it("is stable over a long line-item sum", () => {
    // 0.1 + 0.2 !== 0.3 in floats; in cents it is exact 100 times over.
    let cents = 0;
    for (let i = 0; i < 100; i++) cents += toCents("0.07");
    expect(fromCents(cents)).toBe("7.00");
  });
});
