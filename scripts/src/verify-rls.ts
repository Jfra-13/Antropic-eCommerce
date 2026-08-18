// RLS probe: talks to Supabase's PostgREST endpoint the way an attacker would — from
// outside the app, with nothing but the anon key, which is public by design.
//
// The API server reaches Postgres directly with server-side credentials, so RLS is not what
// protects a normal request. But PostgREST is exposed on the same database, so any table
// without RLS is readable by anyone who opens devtools and copies the anon key. This script
// is the only thing that actually proves otherwise; "RLS enabled" in the dashboard does not.
//
// Run:  pnpm --filter @workspace/scripts run verify-rls
// Needs SUPABASE_URL and SUPABASE_ANON_KEY (root .env). Read-only: it never writes.

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

type Verdict = "EXPOSED" | "empty" | "blocked" | "error";

// Ask PostgREST what it exposes rather than hardcoding a table list, so a table added later
// is covered automatically instead of being silently skipped.
async function listExposedTables(): Promise<string[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers });
  if (!res.ok) {
    throw new Error(`Could not read the PostgREST schema: HTTP ${res.status} ${await res.text()}`);
  }
  const spec = (await res.json()) as { paths?: Record<string, unknown> };
  return Object.keys(spec.paths ?? {})
    .filter((p) => p !== "/" && !p.includes("{") && !p.startsWith("/rpc/"))
    .map((p) => p.slice(1))
    .sort();
}

async function probe(table: string): Promise<{ verdict: Verdict; detail: string }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, { headers });

  if (res.status === 401 || res.status === 403) {
    return { verdict: "blocked", detail: `HTTP ${res.status}` };
  }
  if (!res.ok) {
    return { verdict: "error", detail: `HTTP ${res.status} ${(await res.text()).slice(0, 120)}` };
  }

  const rows = (await res.json()) as unknown[];
  // A row came back with nothing but the public key: RLS is off, or a policy is too loose.
  if (Array.isArray(rows) && rows.length > 0) {
    return { verdict: "EXPOSED", detail: `returned ${rows.length} row(s)` };
  }
  // 200 with [] means the request was allowed but matched nothing — consistent with RLS on
  // and no policy granting anon access. Not proof of a correct policy, just no leak here.
  return { verdict: "empty", detail: "200, no rows" };
}

async function main(): Promise<void> {
  console.log(`Probing ${SUPABASE_URL} with the anon key (read-only)\n`);

  const tables = await listExposedTables();
  if (tables.length === 0) {
    console.log("PostgREST exposes no tables. Nothing to probe.");
    return;
  }

  const exposed: string[] = [];
  const errored: string[] = [];

  for (const table of tables) {
    const { verdict, detail } = await probe(table);
    const mark = verdict === "EXPOSED" ? "FAIL" : verdict === "error" ? "??  " : "ok  ";
    console.log(`  ${mark} ${table.padEnd(28)} ${verdict.padEnd(8)} ${detail}`);
    if (verdict === "EXPOSED") exposed.push(table);
    if (verdict === "error") errored.push(table);
  }

  console.log(`\n${tables.length} table(s) probed.`);
  if (errored.length > 0) {
    console.log(`${errored.length} returned an unexpected status: ${errored.join(", ")}`);
  }

  if (exposed.length > 0) {
    console.error(
      `\nFAIL — readable with the public anon key: ${exposed.join(", ")}\n` +
        `Enable RLS on these tables and write policies for SELECT, INSERT, UPDATE and DELETE.`,
    );
    process.exit(1);
  }

  console.log(
    "\nPASS — no table returned rows to the anon key.\n" +
      "Note: this proves nothing leaks to an ANONYMOUS caller. Verifying that a logged-in\n" +
      "user cannot read another user's orders needs a second run with a real user's JWT,\n" +
      "and write policies need their own test.",
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
});
