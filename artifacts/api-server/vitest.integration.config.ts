import { defineConfig } from "vitest/config";

// Integration tests: real Postgres, real transactions. These are the ones that prove the
// claims a checklist cannot — that two shoppers cannot buy the same last unit, that a
// complaint cannot be deleted, that consent history is append-only.
//
// DATABASE_URL is NOT defaulted here: these must run against a throwaway database provided by
// whoever invokes them (CI service container, or a local scratch instance). Silently falling
// back to a default risks pointing them at a real database, and they truncate tables.
export default defineConfig({
  test: {
    include: ["src/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // Transactions and row locks mean these tests deliberately contend with each other;
    // running files in parallel against one database makes failures non-deterministic.
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      NODE_ENV: "test",
      PORT: "1",
      // The service layer logs as it goes; in a test run that is noise that hides failures.
      LOG_LEVEL: "silent",
      SUPABASE_URL: "https://unused.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "unused",
      // Set so the email transport takes its real code path and calls fetch, which the outbox
      // tests stub. Unset, it would short-circuit to "sin configurar" and those tests would
      // pass without ever exercising delivery.
      RESEND_API_KEY: "test-key",
      RESEND_FROM: "Test <no-reply@example.test>",
    },
  },
});
