import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Fails the build when a server-only Supabase secret reaches a client bundle.
//
// The service role key bypasses RLS on every table. Anything Vite inlines into dist/ is
// downloaded by every visitor, so one VITE_ variable pointed at the wrong value publishes it.
// Reading the source is not enough: the leak happens at build time, from the environment.
//
// CI never has the real key, so searching for its literal value would always pass there.
// Instead this decodes every JWT in the output and rejects any whose payload says
// role=service_role, which catches a legacy key whatever its value. New-format secret keys
// are opaque, so those are caught by their `sb_secret_` prefix. The variable name is checked
// too: code that mentions it is code that is trying to read it on the client.
//
// Every file is scanned, not just .js: source maps, HTML and the manifest ship as well.

const root = path.resolve(import.meta.dirname, "..");
const dists = ["artifacts/antropic-store/dist/public", "artifacts/antropic-admin/dist/public"];

const JWT = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    return statSync(file).isDirectory() ? walk(file) : [file];
  });
}

function jwtRole(token) {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).role;
  } catch {
    return undefined;
  }
}

const problems = [];
const seen = [];

for (const dist of dists) {
  const dir = path.join(root, dist);
  let files;
  try {
    files = walk(dir);
  } catch {
    files = [];
  }
  // An empty or missing dist would make every check below pass without looking at anything.
  if (files.length === 0) {
    problems.push(`${dist}: no build output — run the build before this check`);
    continue;
  }

  for (const file of files) {
    const rel = path.relative(root, file);
    const text = readFileSync(file, "latin1");
    if (text.includes("SUPABASE_SERVICE_ROLE_KEY")) problems.push(`${rel}: mentions SUPABASE_SERVICE_ROLE_KEY`);
    if (text.includes("sb_secret_")) problems.push(`${rel}: contains an sb_secret_ key`);
    for (const [token] of text.matchAll(JWT)) {
      const role = jwtRole(token);
      seen.push(`${rel}: JWT role=${role ?? "?"}`);
      if (role === "service_role") problems.push(`${rel}: contains a JWT with role=service_role`);
    }
  }
}

console.log(`\nClient bundle secret check: ${seen.length} JWT(s) found`);
for (const line of seen) console.log(`  ${line}`);

if (problems.length > 0) {
  console.error("\ncheck-client-bundle: server-only secret in a client bundle:");
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    "\nThe service role key must never be a VITE_ variable. Rotate it in Supabase if this\n" +
      "build was ever deployed, then fix the variable that carried it.",
  );
  process.exit(1);
}
console.log("  no service-role secret in store or admin dist/\n");
