import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

// Supabase serves every table in `public` through PostgREST to anyone with the anon key, and
// that key ships in the client bundle. RLS with no policy is what closes that door; the API is
// not affected because it connects as the owner. On 2026-10-19 the production project had RLS
// off on every table (AUDITORIA §3.2), so this reads the flag from the catalog of a database
// built by `migrate`: a new table that forgets .enableRLS() fails here, not in production.
//
// It reads pg_class rather than the drizzle schema on purpose, so a table created by a
// hand-written migration is covered too.

describe("row level security", () => {
  it("is enabled on every table in the public schema", async () => {
    const result = await db.execute<{ relname: string; rls: boolean }>(sql`
      SELECT c.relname, c.relrowsecurity AS rls
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      ORDER BY c.relname
    `);

    // Guard against a vacuous pass on an unmigrated database.
    expect(result.rows.map((r) => r.relname)).toContain("orders");
    expect(result.rows.filter((r) => !r.rls).map((r) => r.relname)).toEqual([]);
  });

  it("exposes no views, which would bypass RLS when owned by postgres", async () => {
    const result = await db.execute<{ relname: string }>(sql`
      SELECT c.relname
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
    `);
    expect(result.rows).toEqual([]);
  });
});
