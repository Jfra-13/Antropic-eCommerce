import { env } from "./env";

// Money helpers. The DB stores numeric(10,2) as strings; we do integer-cents math and
// never touch floats (float money math is a bug factory). All values in this domain are
// non-negative — there is no negative money here.

// Accepts exactly what this domain calls money: a non-negative decimal, optionally with a
// fractional part. Everything else is rejected BEFORE any arithmetic happens.
//
// The permissive version of this function accepted more than it should and produced a plausible
// number instead of an error: "" and " " became 0, "1.2.3" became 120, "-5.00" became -500
// (which fromCents then clamped silently back to 0.00), and "1e3" became 100000. A money parser
// that quietly invents a value is worse than one that throws, because the wrong number reaches
// a total and nobody finds out until a customer is charged it.
const MONEY_PATTERN = /^\d+(\.\d+)?$/;

export function toCents(value: string): number {
  const trimmed = value.trim();
  if (!MONEY_PATTERN.test(trimmed)) throw new Error(`Invalid money value: ${value}`);
  const [whole, frac = ""] = trimmed.split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isFinite(cents)) throw new Error(`Invalid money value: ${value}`);
  return cents;
}

export function fromCents(cents: number): string {
  const c = Math.max(0, Math.round(cents));
  return `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
}

// ponytail: dev-time self-check — money is a money path; fail loud on boot if math breaks.
if (!env.isProduction) {
  const eq = (a: string, b: string) => {
    if (a !== b) throw new Error(`money self-check failed: ${a} !== ${b}`);
  };
  eq(fromCents(toCents("12.50") + toCents("0.05")), "12.55");
  eq(fromCents(toCents("100") - toCents("0.01")), "99.99");
  eq(fromCents(toCents("12.5")), "12.50");
  eq(fromCents(toCents("12")), "12.00");
}
