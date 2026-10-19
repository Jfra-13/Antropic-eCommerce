// SQLSTATE of a Postgres error, wherever it sits in the cause chain.
//
// Drizzle wraps driver errors in a DrizzleQueryError whose own `code` is undefined and hangs
// the pg error off `cause`. Reading `.code` on the caught value alone therefore returns nothing,
// and every guard written that way compiles, looks right and never fires. It has been found
// three times in this codebase by running the code rather than reading it: the webhook
// idempotency guard (Fase 6), and in Fase 9 the order idempotency race — a double click on
// "Confirmar" answered 500 instead of returning the order — and the catalogue's duplicate
// slug/SKU check. One helper, so a fourth copy cannot be written the broken way.
function pgError(e: unknown): { code: string; constraint?: unknown } | undefined {
  for (let cur = e, depth = 0; cur != null && depth < 5; depth++) {
    const code = typeof cur === "object" ? (cur as { code?: unknown }).code : undefined;
    if (typeof code === "string") return cur as { code: string; constraint?: unknown };
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

export function pgErrorCode(e: unknown): string | undefined {
  return pgError(e)?.code;
}

// Postgres unique_violation (SQLSTATE 23505). With `constraint`, only a violation of that one:
// a table with several unique indexes must not read every collision as the one it expects.
export function isUniqueViolation(e: unknown, constraint?: string): boolean {
  const pg = pgError(e);
  return pg?.code === "23505" && (constraint === undefined || pg.constraint === constraint);
}
