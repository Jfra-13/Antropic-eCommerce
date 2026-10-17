// SQLSTATE of a Postgres error, wherever it sits in the cause chain.
//
// Drizzle wraps driver errors in a DrizzleQueryError whose own `code` is undefined and hangs
// the pg error off `cause`. Reading `.code` on the caught value alone therefore returns nothing,
// and every guard written that way compiles, looks right and never fires. It has been found
// three times in this codebase by running the code rather than reading it: the webhook
// idempotency guard (Fase 6), and in Fase 9 the order idempotency race — a double click on
// "Confirmar" answered 500 instead of returning the order — and the catalogue's duplicate
// slug/SKU check. One helper, so a fourth copy cannot be written the broken way.
export function pgErrorCode(e: unknown): string | undefined {
  for (let cur = e, depth = 0; cur != null && depth < 5; depth++) {
    const code = typeof cur === "object" ? (cur as { code?: unknown }).code : undefined;
    if (typeof code === "string") return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

// Postgres unique_violation (SQLSTATE 23505).
export function isUniqueViolation(e: unknown): boolean {
  return pgErrorCode(e) === "23505";
}
