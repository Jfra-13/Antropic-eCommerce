// RLS check for the real Supabase project, in two halves.
//
// 1. Catalog (DATABASE_URL, read-only transaction): every table in `public` must have RLS
//    enabled, and `public` must hold no views (owned by postgres, a view bypasses RLS) and no
//    functions the anon role can execute (PostgREST serves them as /rpc/*). This is the half
//    that proves anything: an empty table with RLS off answers the anon key with 200 and no
//    rows, exactly like a protected one.
// 2. Anon probe (SUPABASE_URL + SUPABASE_ANON_KEY): asks PostgREST for one row of each of
//    those tables the way an attacker would, from outside the app with the public key only.
//    It confirms the catalog from the outside and catches a policy that is too loose.
//
// Table discovery comes from the catalog, not from GET /rest/v1/: Supabase now restricts that
// OpenAPI document to the service_role key, so with the anon key the old discovery died with a
// 401 before probing anything.
//
// It never writes and never prints row contents, only counts: the output goes into the audit
// as evidence, and the rows it would find are customers' personal data.
//
// Run:  pnpm --filter @workspace/scripts run verify-rls
// Needs DATABASE_URL, SUPABASE_URL and SUPABASE_ANON_KEY (root .env).

import { pool } from "@workspace/db";

const SUPABASE_URL = process.env["SUPABASE_URL"]?.replace(/\/$/, "");
const ANON_KEY = process.env["SUPABASE_ANON_KEY"];

if (!SUPABASE_URL || !ANON_KEY) {
  console.error(
    "SUPABASE_URL and SUPABASE_ANON_KEY must be set.\n" +
      "Both are in the root .env (Supabase dashboard -> Project Settings -> API).",
  );
  process.exit(2);
}

const headers = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };

type Catalog = {
  tables: { name: string; rls: boolean }[];
  views: string[];
  anonFunctions: string[];
};

async function readCatalog(): Promise<Catalog> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const tables = await client.query<{ name: string; rls: boolean }>(`
      SELECT c.relname AS name, c.relrowsecurity AS rls
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      ORDER BY c.relname`);
    const views = await client.query<{ name: string }>(`
      SELECT c.relname AS name
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
      ORDER BY c.relname`);
    const functions = await client.query<{ name: string }>(`
      SELECT p.proname AS name
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE')
      ORDER BY p.proname`);
    await client.query("ROLLBACK");
    return {
      tables: tables.rows,
      views: views.rows.map((r) => r.name),
      anonFunctions: functions.rows.map((r) => r.name),
    };
  } finally {
    client.release();
  }
}

// Row count only. The body is parsed to count it and then dropped.
async function probe(table: string): Promise<{ leaked: boolean; detail: string }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, { headers });
  if (!res.ok) {
    // 401/403/404 all mean PostgREST refused to serve the table, which is not a leak.
    return { leaked: false, detail: `HTTP ${res.status}` };
  }
  const rows = (await res.json()) as unknown;
  const count = Array.isArray(rows) ? rows.length : 0;
  return { leaked: count > 0, detail: `HTTP ${res.status}, ${count} row(s)` };
}

async function main(): Promise<void> {
  const catalog = await readCatalog();
  if (catalog.tables.length === 0) {
    // An empty `public` means DATABASE_URL points at the wrong database, not that all is well.
    console.error("No tables in the public schema. Is DATABASE_URL the Supabase project?");
    process.exitCode = 2;
    return;
  }

  const failures: string[] = [];
  console.log(`Probing ${SUPABASE_URL} with the anon key (read-only)\n`);

  for (const { name, rls } of catalog.tables) {
    const { leaked, detail } = await probe(name);
    const ok = rls && !leaked;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${name.padEnd(28)} rls=${rls ? "on " : "OFF"}  ${detail}`);
    if (!rls) failures.push(`${name}: RLS disabled`);
    if (leaked) failures.push(`${name}: returned rows to the anon key`);
  }
  for (const view of catalog.views) failures.push(`${view}: view in public (bypasses RLS)`);
  for (const fn of catalog.anonFunctions) failures.push(`${fn}(): executable by anon via /rpc`);

  console.log(
    `\n${catalog.tables.length} table(s), ${catalog.views.length} view(s), ` +
      `${catalog.anonFunctions.length} anon-executable function(s).`,
  );

  if (failures.length > 0) {
    console.error(`\nFAIL\n  ${failures.join("\n  ")}`);
    // exitCode, not exit(): exiting while the pool is still closing aborts Node on Windows.
    process.exitCode = 1;
    return;
  }

  console.log(
    "\nPASS — RLS on every table, nothing returned to the anon key, no views or RPC.\n" +
      "With no policies, the anon and authenticated roles can neither read nor write any table.",
  );
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 2;
  })
  .finally(() => pool.end());
