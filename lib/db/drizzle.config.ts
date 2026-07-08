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
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
