import { defineConfig } from "vitest/config";

// The brand guard is a repository-wide check (it walks artifacts/ and lib/), so it runs from
// the package that owns the rule rather than from whichever app happens to have a test runner.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
