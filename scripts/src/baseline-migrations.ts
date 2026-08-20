// Marks migrations as already applied WITHOUT running their SQL.
//
// Why this exists: every database that predates versioned migrations was built with
// `drizzle-kit push`, so the tables are there but `drizzle.__drizzle_migrations` is not. Running `migrate` against one of them would
// try to CREATE TABLE on tables that already exist and fail on the first statement. This
// script writes the bookkeeping rows so the database is recognised as being at the baseline,
// after which every future migration applies normally.
//
// Run ONCE per pre-existing database (local, staging, production), then never again:
//   pnpm --filter @workspace/scripts run baseline-migrations
//
// A database created from scratch does NOT need this — run `migrate` and it does the right
// thing. See docs/COMANDOS.md §2.
//
// Read-only with respect to your data: it only ever inserts into drizzle.__drizzle_migrations.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/db";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(here, "../../lib/db/drizzle");

// Mirrors drizzle-orm's own bookkeeping exactly (pg-core/dialect.ts): schema `drizzle`, table
// `__drizzle_migrations`, hash = sha256 of the migration file's full contents, created_at =
// the journal's `when`. Any deviation and drizzle would re-apply migrations it should skip.
const MIGRATIONS_SCHEMA = "drizzle";
const MIGRATIONS_TABLE = "__drizzle_migrations";

// A handful of tables from the baseline. If none of them exist, this is an empty database and
// baselining it would be a silent disaster: the rows would claim the schema is applied while
// nothing had been created, and the mistake would only surface as a missing-relation error in
// production. Empty database -> `migrate`, not this script.
const EXPECTED_TABLES = ["products", "orders", "profiles", "settings"];

type JournalEntry = { idx: number; when: number; tag: string };

function readJournal(): JournalEntry[] {
  const journalPath = path.join(MIGRATIONS_DIR, "meta", "_journal.json");
  if (!fs.existsSync(journalPath)) {
    console.error(`No migration journal at ${journalPath}. Run: pnpm --filter @workspace/db run generate`);
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(journalPath, "utf8")).entries as JournalEntry[];
}

function hashOf(tag: string): string {
  const sqlPath = path.join(MIGRATIONS_DIR, `${tag}.sql`);
  const contents = fs.readFileSync(sqlPath, "utf8");
  return crypto.createHash("sha256").update(contents).digest("hex");
}

async function main(): Promise<void> {
  const entries = readJournal();
  if (entries.length === 0) {
    console.error("The migration journal is empty; nothing to baseline.");
    process.exit(2);
  }

  const found = await pool.query<{ table_name: string }>(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_name = any($1)`,
    [EXPECTED_TABLES],
  );
  if (found.rowCount === 0) {
    console.error(
      "This database has none of the expected tables, so it is not a pre-existing schema.\n" +
        "Baselining it would record migrations as applied without creating anything.\n" +
        "Run this instead:  pnpm --filter @workspace/db run migrate",
    );
    process.exit(1);
  }

  await pool.query(`create schema if not exists "${MIGRATIONS_SCHEMA}"`);
  await pool.query(
    `create table if not exists "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" (
       id serial primary key,
       hash text not null,
       created_at bigint
     )`,
  );

  const existing = await pool.query<{ created_at: string }>(
    `select created_at from "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"`,
  );
  const recorded = new Set(existing.rows.map((r) => String(r.created_at)));

  let inserted = 0;
  for (const entry of entries) {
    if (recorded.has(String(entry.when))) {
      console.log(`  = ${entry.tag} (already recorded)`);
      continue;
    }
    await pool.query(
      `insert into "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" ("hash", "created_at") values ($1, $2)`,
      [hashOf(entry.tag), entry.when],
    );
    console.log(`  + ${entry.tag} (marked as applied, SQL not run)`);
    inserted += 1;
  }

  console.log(
    inserted === 0
      ? "\nNothing to do: this database was already baselined."
      : `\nBaselined ${inserted} migration(s). From now on use: pnpm --filter @workspace/db run migrate`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
