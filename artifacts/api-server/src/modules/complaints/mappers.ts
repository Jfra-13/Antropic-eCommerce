// Pure domain helpers for the Libro de Reclamaciones. Kept out of service.ts for two reasons:
// the notifications module needs the correlativo to render the Hoja and complaints/service
// already imports notifications, so putting it there would close an import cycle (same reason
// orders/mappers.ts exists); and the legal deadline arithmetic is the kind of thing that has to
// be testable without a database standing behind it.

// Ley 31435 and D.S. 101-2022-PCM (amending D.S. 011-2011-PCM): the provider has 15 BUSINESS
// days, with no extension, to answer a reclamo or a queja. It was 30 calendar days until 2022.
// Named because a bare number buried in a date calculation is how a legal deadline quietly
// becomes wrong — which is exactly what happened to the old 30.
export const LEGAL_RESPONSE_BUSINESS_DAYS = 15;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Peru is UTC-5 all year (no daylight saving since 1994), so a fixed offset is exact. The
// business day is a Lima day: a complaint filed at 22:00 in Lima is not filed "tomorrow" in UTC.
const LIMA_OFFSET_MS = 5 * 60 * 60 * 1000;

// Days since the epoch, counted in Lima time.
function limaDay(at: Date): number {
  return Math.floor((at.getTime() - LIMA_OFFSET_MS) / MS_PER_DAY);
}

// ponytail: Monday to Friday only, national holidays are NOT skipped. Skipping a holiday moves
// the deadline later, so ignoring them can only make the computed date earlier than the legal
// one, never later: at worst the business answers a day or two early. A holiday calendar would
// need someone to maintain it every year, and a stale one errs on the dangerous side. Add one
// only if answering early becomes a real cost.
function isBusinessDay(day: number): boolean {
  const weekday = new Date(day * MS_PER_DAY).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

// Business days in the half-open range (from, to].
function businessDaysBetween(from: number, to: number): number {
  let count = 0;
  for (let day = from + 1; day <= to; day++) if (isBusinessDay(day)) count++;
  return count;
}

// The correlativo the consumer is told to quote when following up. Derived from the serial
// rather than stored, so the sequence has exactly one source of truth.
export function complaintCode(complaintNumber: number): string {
  return `LR-${String(complaintNumber).padStart(6, "0")}`;
}

// The legal deadline for a complaint filed at `filedAt`: the end (23:59:59.999 in Lima) of the
// 15th business day after the filing day. The filing day itself does not count.
export function dueDateFrom(filedAt: Date): Date {
  let day = limaDay(filedAt);
  for (let counted = 0; counted < LEGAL_RESPONSE_BUSINESS_DAYS; ) {
    day++;
    if (isBusinessDay(day)) counted++;
  }
  return new Date((day + 1) * MS_PER_DAY + LIMA_OFFSET_MS - 1);
}

// Business days left after today, relative to `now`: 15 on the filing day, 0 on the due day
// ("vence hoy": the business still has today), negative once the deadline has passed, which the
// backoffice renders as overdue rather than hiding. At least -1 even when only a weekend has gone
// by, so an overdue file never reads as due today. `now` is a parameter rather than a call to
// Date.now() inside so the boundary cases can actually be tested.
export function daysRemaining(dueAt: Date, now: Date = new Date()): number {
  const today = limaDay(now);
  const due = limaDay(dueAt);
  if (today <= due) return businessDaysBetween(today, due);
  return -Math.max(1, businessDaysBetween(due, today));
}
