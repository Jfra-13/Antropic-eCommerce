// Builds the storefront demo into ONE self-contained HTML file.
//
//   node demo/build.mjs
//
// Vite is configured (demo/vite.config.ts) to inline every image as a data URI and emit
// a single JS chunk and a single stylesheet; this script then:
//
//   1. replaces the Google Fonts @import with @font-face rules carrying base64 woff2,
//      because the published page runs under a CSP that blocks external hosts;
//   2. folds the stylesheet and the script into the HTML.
//
// Outputs, both in demo/dist:
//   antropic-store-demo.html           complete document — open it straight from disk
//   antropic-store-demo.fragment.html  same page without the <html>/<head>/<body> shell,
//                                      for hosts that supply their own document wrapper

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const demoDir = dirname(fileURLToPath(import.meta.url));
const distDir = join(demoDir, "dist");
const OUT = join(distDir, "antropic-store-demo.html");
const OUT_FRAGMENT = join(distDir, "antropic-store-demo.fragment.html");

// Chrome UA: the Google Fonts CSS endpoint serves woff2 only to browsers that support it.
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// The storefront is Spanish-language, so latin + latin-ext is all that gets rendered.
// Keeping the other subsets would multiply the font payload for nothing.
const KEEP_SUBSETS = new Set(["latin", "latin-ext"]);

// Splits the Google Fonts stylesheet into its `/* subset */ @font-face {...}` blocks and
// drops the ones outside KEEP_SUBSETS.
function keepLatinBlocks(css) {
  const blocks = [];
  const re = /\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g;
  for (const [, subset, block] of css.matchAll(re)) {
    if (KEEP_SUBSETS.has(subset)) blocks.push(block);
  }
  return blocks;
}

async function inlineFontFaces(url) {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`Google Fonts CSS ${res.status} for ${url}`);
  const css = await res.text();

  const blocks = keepLatinBlocks(css);
  const out = [];

  for (const block of blocks) {
    const match = block.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/);
    if (!match) continue;
    const font = await fetch(match[1], { headers: { "user-agent": UA } });
    if (!font.ok) throw new Error(`Font ${font.status} for ${match[1]}`);
    const base64 = Buffer.from(await font.arrayBuffer()).toString("base64");
    out.push(
      block.replace(
        match[0],
        `url(data:font/woff2;base64,${base64}) format('woff2')`,
      ),
    );
  }

  if (out.length === 0) throw new Error(`No latin @font-face blocks found in ${url}`);
  return out.join("\n");
}

// ---------------------------------------------------------------------------

console.log("› vite build");
execFileSync(
  process.execPath,
  [
    join(demoDir, "../node_modules/vite/bin/vite.js"),
    "build",
    "--config",
    join(demoDir, "vite.config.ts"),
  ],
  { stdio: "inherit", cwd: demoDir },
);

const html = readFileSync(join(distDir, "index.html"), "utf8");
const assetsDir = join(distDir, "assets");
const assets = readdirSync(assetsDir);

const cssFile = assets.find((f) => f.endsWith(".css"));
const jsFile = assets.find((f) => f.endsWith(".js")) ?? "demo.js";
if (!cssFile) throw new Error("No stylesheet emitted — did the build change?");

let css = readFileSync(join(assetsDir, cssFile), "utf8");
const js = readFileSync(
  statSync(join(assetsDir, jsFile), { throwIfNoEntry: false })
    ? join(assetsDir, jsFile)
    : join(distDir, jsFile),
  "utf8",
);

// index.css opens with an @import of the Google Fonts stylesheet; postcss hoists it to
// the top of the bundle. Swap it for the fonts themselves. Both spellings show up: the
// source uses `url('…')`, the minifier rewrites it to a bare string.
const importMatch = css.match(
  /@import\s*(?:url\(\s*)?(['"]?)(https:\/\/fonts\.googleapis\.com\/[^'")]+)\1\s*\)?\s*;?/,
);
if (importMatch) {
  console.log("› inlining web fonts");
  css = css.replace(importMatch[0], await inlineFontFaces(importMatch[2]));
} else {
  console.warn("! no Google Fonts @import found in the built CSS — skipping font inlining");
}

// `</script` inside the bundle would close the inline script tag early. The JSON snapshot
// and the app code are both plain JS strings, so escaping the sequence is enough.
const safeJs = js.replace(/<\/script/gi, "<\\/script");

// The replacements go through functions on purpose: a string replacement would treat
// `$$` in the bundle as an escape and silently corrupt it (React's `$$typeof` is the
// one that bites), and `$&`/`$1` would splice in match text.
const single = html
  .replace(/\s*<link rel="stylesheet"[^>]*>/, "")
  .replace(/\s*<script type="module"[^>]*><\/script>/, "")
  .replace("</head>", () => `  <style>\n${css}\n  </style>\n  </head>`)
  .replace(
    "</body>",
    () => `  <script type="module">\n${safeJs}\n  </script>\n  </body>`,
  );

writeFileSync(OUT, single);

// Fragment form: the same <title>/<style>/#root/<script>, minus the document shell, for
// publishing hosts that wrap the content in their own <html>/<head>/<body>.
const fragment = [
  `<title>${(html.match(/<title>(.*?)<\/title>/) ?? [, "ANTROPIC Store — demo"])[1]}</title>`,
  `<style>\n${css}\n</style>`,
  `<div id="root"></div>`,
  `<script type="module">\n${safeJs}\n</script>`,
].join("\n");
writeFileSync(OUT_FRAGMENT, fragment);

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2);
console.log(`› ${OUT} (${mb(Buffer.byteLength(single))} MB)`);
console.log(`› ${OUT_FRAGMENT} (${mb(Buffer.byteLength(fragment))} MB)`);
