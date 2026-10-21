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

  it("has no policies, so neither anon nor a logged-in user can read through PostgREST", async () => {
    // RLS without policies is a deny-all. The first policy turns that into an allow-list, and
    // `authenticated` is any account anyone can sign up for: one written loosely hands every
    // customer the other customers' orders. Adding one is a deliberate decision, so it fails here
    // until this test is updated with it.
    const result = await db.execute<{ table: string; policy: string }>(sql`
      SELECT c.relname AS table, p.polname AS policy
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
    `);
    expect(result.rows).toEqual([]);
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
