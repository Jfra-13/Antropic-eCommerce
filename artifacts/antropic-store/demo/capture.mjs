// Captures the public (unauthenticated) GET responses of a running api-server into a
// JSON snapshot. The static demo build embeds that snapshot and replays it from an
// in-browser fetch shim, so the storefront runs with real API payloads and no backend.
//
//   node demo/capture.mjs [apiBaseUrl] [outFile]
//
// Defaults: http://127.0.0.1:3001 -> demo/generated/api-snapshot.json

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const API = (process.argv[2] ?? "http://127.0.0.1:3001").replace(/\/+$/, "");
const OUT = resolve(
  process.argv[3] ?? new URL("./generated/api-snapshot.json", import.meta.url).pathname,
);

async function get(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

const snapshot = { capturedAt: new Date().toISOString(), routes: {} };

// The storefront pulls the whole catalog once (lib/catalog.ts uses limit=100) and
// filters client-side, so a single products call covers every list screen.
const products = await get("/api/products?limit=100");

snapshot.routes["/api/products"] = products;
snapshot.routes["/api/categories"] = await get("/api/categories");
snapshot.routes["/api/occasions"] = await get("/api/occasions");
snapshot.routes["/api/config"] = await get("/api/config");
snapshot.routes["/api/pickup-points"] = await get("/api/pickup-points");

// Product detail is served per slug; the list payload already carries the full product
// shape, but fetch each one so the snapshot mirrors what the endpoint really returns.
for (const item of products.items) {
  snapshot.routes[`/api/products/${item.slug}`] = await get(
    `/api/products/${encodeURIComponent(item.slug)}`,
  );
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(snapshot));

const kb = (JSON.stringify(snapshot).length / 1024).toFixed(0);
console.log(
  `Captured ${Object.keys(snapshot.routes).length} routes (${products.items.length} products, ${kb} KB) -> ${OUT}`,
);
