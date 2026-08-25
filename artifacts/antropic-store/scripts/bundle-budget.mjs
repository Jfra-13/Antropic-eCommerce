import { gzipSync } from "node:zlib";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

// Size budget for the first load, enforced as part of `build` so CI fails on a regression.
//
// A budget nobody enforces is a comment. The storefront's customers are on Peruvian mobile
// networks, where every 100 kB of JavaScript is real seconds before anything is interactive,
// and bundles only ever grow — one convenient library at a time, each of them defensible on
// its own. This is the check that makes the growth visible on the pull request that causes
// it, instead of six months later in a Lighthouse report nobody runs.
//
// Measured over the *initial* payload only: the entry chunk plus the chunks the HTML
// preloads, which is exactly what a visitor downloads before the first screen. Route chunks
// are deliberately excluded — splitting work in that direction is the point.
//
// Gzip is what the numbers are in, because that is what crosses the network. Raising a
// budget is a decision, not a formality: do it in the same commit as the change that needs
// it, with the reason in the message.

const BUDGET_GZIP_KB = 225;

const dist = path.resolve(import.meta.dirname, "..", "dist", "public");
const html = readFileSync(path.join(dist, "index.html"), "utf8");

const referenced = [
  ...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g),
  ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+\.js)"/g),
].map((m) => m[1]);

if (referenced.length === 0) {
  console.error("bundle-budget: no initial scripts found in index.html — did the build change?");
  process.exit(1);
}

let totalGzip = 0;
const rows = [];
for (const ref of referenced) {
  const file = path.join(dist, ref.replace(/^\//, ""));
  const gzip = gzipSync(readFileSync(file)).length;
  totalGzip += gzip;
  rows.push({ file: path.basename(file), raw: statSync(file).size, gzip });
}

rows.sort((a, b) => b.gzip - a.gzip);
const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
console.log("\nInitial JavaScript payload:");
for (const r of rows) console.log(`  ${r.file.padEnd(34)} ${kb(r.raw).padStart(10)}  gzip ${kb(r.gzip).padStart(9)}`);
console.log(`  ${"".padEnd(34)} ${"".padStart(10)}  gzip ${kb(totalGzip).padStart(9)}  (budget ${BUDGET_GZIP_KB} kB)\n`);

if (totalGzip > BUDGET_GZIP_KB * 1024) {
  console.error(
    `bundle-budget: initial JavaScript is ${kb(totalGzip)} gzipped, over the ${BUDGET_GZIP_KB} kB budget.\n` +
      "Split the new code behind a route, import it lazily, or raise the budget deliberately\n" +
      "in scripts/bundle-budget.mjs with the reason in the commit message.",
  );
  process.exit(1);
}
