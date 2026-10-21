// Runs the integration suite against the throwaway Postgres in docker-compose.test.yml:
// start it (or reuse it), replay the migrations, run the tests. The same three steps CI takes,
// so a failure shows up here instead of on the pull request.
//
// DATABASE_URL is set explicitly for every step. drizzle.config.ts loads the root .env, which
// may point at a real database, but a value already in the environment wins over the file —
// that precedence is what keeps `migrate` and the truncating tests off anything real.
import { spawnSync } from "node:child_process";

const DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5433/antropic_test";

function run(command) {
  // shell: true so that `pnpm` resolves to pnpm.cmd on Windows.
  const result = spawnSync(command, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, DATABASE_URL },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("docker compose -f docker-compose.test.yml up -d --wait");
run("pnpm --filter @workspace/db run migrate");
run(`pnpm --filter @workspace/api-server run test:integration ${process.argv.slice(2).join(" ")}`);
