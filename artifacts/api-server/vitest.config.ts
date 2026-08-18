import { defineConfig } from "vitest/config";

// Unit tests: pure domain logic, no database. Anything that needs Postgres is an
// *.integration.test.ts and runs from vitest.integration.config.ts instead.
//
// The env block exists because lib/env.ts validates the whole environment the moment it is
// imported, and money.ts imports it. These are throwaway values: nothing here connects.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "src/**/*.integration.test.ts"],
    env: {
      NODE_ENV: "test",
      PORT: "1",
      DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
      SUPABASE_URL: "https://unused.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "unused",
    },
  },
});
