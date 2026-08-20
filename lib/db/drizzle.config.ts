import { defineConfig } from "drizzle-kit";
import fs from "node:fs";
import path from "path";

// drizzle-kit does not auto-load .env; load the repo-root file if present.
const envPath = path.join(__dirname, "../../.env");
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  // Forward-slash relative path: path.join yields Windows backslashes that
  // drizzle-kit's globby treats as escapes -> "No schema files found".
  schema: "./src/schema/index.ts",
  // Versioned migrations live here and are committed. `generate` authors them from the schema
  // diff, `migrate` applies the ones a database has not seen yet, tracked in
  // drizzle.__drizzle_migrations. This is the only sanctioned path for a shared database:
  // `push` diffs against whatever the target happens to contain, which is fine for a scratch
  // database and a guaranteed source of divergence once there is more than one environment.
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
