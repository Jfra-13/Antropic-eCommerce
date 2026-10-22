import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Connections per process. With autoscaling the database sees instances × this, so production
// sets it low and points DATABASE_URL at the Supabase pooler in transaction mode (port 6543).
const poolMax = Number(process.env.DB_POOL_MAX?.trim() || 10);
if (!Number.isInteger(poolMax) || poolMax < 1) {
  throw new Error("DB_POOL_MAX must be a positive integer.");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: poolMax });
// An idle client the server or the pooler disconnects emits 'error' on the pool, and an
// unhandled 'error' event kills the process. The pool already discards that client; a request
// that needs a connection gets a fresh one.
pool.on("error", (err) => {
  console.error("Idle Postgres client error", err);
});
export const db = drizzle(pool, { schema });

export * from "./schema";
