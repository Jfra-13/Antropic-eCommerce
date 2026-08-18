// Pure domain helpers for the Libro de Reclamaciones. Kept out of service.ts for two reasons:
// the notifications module needs the correlativo to render the Hoja and complaints/service
// already imports notifications, so putting it there would close an import cycle (same reason
// orders/mappers.ts exists); and the legal deadline arithmetic is the kind of thing that has to
// be testable without a database standing behind it.

// D.S. 011-2011-PCM: the provider has 30 CALENDAR days — not working days — to answer. Named
// because a bare 30 buried in a date calculation is how a legal deadline quietly becomes wrong.
export const LEGAL_RESPONSE_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// The correlativo the consumer is told to quote when following up. Derived from the serial
// rather than stored, so the sequence has exactly one source of truth.
export function complaintCode(complaintNumber: number): string {
  return `LR-${String(complaintNumber).padStart(6, "0")}`;
}

// The legal deadline for a complaint filed at `filedAt`.
export function dueDateFrom(filedAt: Date): Date {
  return new Date(filedAt.getTime() + LEGAL_RESPONSE_DAYS * MS_PER_DAY);
}

// Whole calendar days left to answer, relative to `now`. Negative once the deadline has passed,
// which the backoffice renders as overdue rather than hiding. `now` is a parameter rather than
// a call to Date.now() inside so the boundary cases can actually be tested.
export function daysRemaining(dueAt: Date, now: Date = new Date()): number {
  return Math.ceil((dueAt.getTime() - now.getTime()) / MS_PER_DAY);
}
