// Kept out of service.ts on purpose. The notifications module needs the correlativo to render
// the Hoja de Reclamación, and complaints/service already imports notifications — putting this
// there would close an import cycle. Same reason orders/mappers.ts exists.

// The correlativo the consumer is told to quote when following up. Derived from the serial
// rather than stored, so the sequence has exactly one source of truth.
export function complaintCode(complaintNumber: number): string {
  return `LR-${String(complaintNumber).padStart(6, "0")}`;
}
