// Money helpers. The DB stores numeric(10,2) as strings; we do integer-cents math and
// never touch floats (float money math is a bug factory). All values in this domain are
// non-negative — there is no negative money here.

export function toCents(value: string): number {
  const [whole, frac = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isFinite(cents)) throw new Error(`Invalid money value: ${value}`);
  return cents;
}

export function fromCents(cents: number): string {
  const c = Math.max(0, Math.round(cents));
  return `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
}

// ponytail: dev-time self-check — money is a money path; fail loud on boot if math breaks.
if (process.env["NODE_ENV"] !== "production") {
  const eq = (a: string, b: string) => {
    if (a !== b) throw new Error(`money self-check failed: ${a} !== ${b}`);
  };
  eq(fromCents(toCents("12.50") + toCents("0.05")), "12.55");
  eq(fromCents(toCents("100") - toCents("0.01")), "99.99");
  eq(fromCents(toCents("12.5")), "12.50");
  eq(fromCents(toCents("12")), "12.00");
}
