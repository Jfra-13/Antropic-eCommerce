import { db } from "@workspace/db";

// The transaction handle drizzle passes to the db.transaction callback. Query functions
// that must run inside the order-creation transaction accept this; read-only callers pass
// the plain `db` instance (DbOrTx accepts either).
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbOrTx = typeof db | Tx;
