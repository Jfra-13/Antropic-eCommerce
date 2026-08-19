import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { brand, orderReference, parseOrderReference, webManifest } from "./index.ts";

// This suite is the reason the brand module keeps its value over time.
//
// Moving the brand name out of the components once is easy; keeping it out is the hard part,
// because the next person to add a page will type "Antropic" without thinking — and nothing
// will look wrong until the clone ships with the wrong name on a checkout screen. So the rule
// is enforced by a test rather than by a convention: brand identity may appear in
// lib/brand/src/brand.ts and nowhere else in the source.
//
// The forbidden terms are read from the brand config itself, so this guard keeps working, and
// keeps guarding the right words, after a clone changes them.

const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");

// Where brand identity would do damage: shipped application source and the HTML shells.
const SCAN_ROOTS = [
  "artifacts/antropic-store/src",
  "artifacts/antropic-store/index.html",
  "artifacts/antropic-admin/src",
  "artifacts/antropic-admin/index.html",
  "artifacts/mockup-sandbox/src",
  "artifacts/mockup-sandbox/index.html",
  "artifacts/api-server/src",
  "lib/db/src",
  "lib/api-spec/openapi.yaml",
  "scripts/src",
];

// `generated/` is written by Orval from openapi.yaml and is never hand-edited; `dist` and
// `node_modules` are build output. Nothing here is a place a human puts a brand name.
const SKIP_DIRS = new Set(["node_modules", "dist", "generated", ".tsbuildinfo"]);

function walk(target: string): string[] {
  let stat;
  try {
    stat = statSync(target);
  } catch {
    return [];
  }
  if (stat.isFile()) return [target];
  return readdirSync(target).flatMap((entry) =>
    SKIP_DIRS.has(entry) ? [] : walk(path.join(target, entry)),
  );
}

const files = SCAN_ROOTS.flatMap((rel) => walk(path.join(repoRoot, rel)));

// Package specifiers and repository paths carry the brand only as an identifier — the
// customer never sees `@workspace/antropic-store`, and renaming the directories is a
// mechanical step of the fork rather than part of the brand (see docs/CLONACION.md). They are
// blanked out before matching so the guard stays about copy, which is what actually ships.
const IDENTIFIER_PATTERNS = [/@workspace\/[a-z0-9-]+/gi, /\b(?:artifacts|lib)\/[a-z0-9-]+/gi];

function findLeaks(pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const copy = IDENTIFIER_PATTERNS.reduce((acc, p) => acc.replace(p, ""), line);
      if (pattern.test(copy)) {
        hits.push(`${path.relative(repoRoot, file)}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  return hits;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("brand identity is configuration, not code", () => {
  it("scans a non-trivial number of files", () => {
    // A guard that silently scans nothing passes forever. If the layout moves, fail loudly
    // here rather than keep reporting a clean result for an empty set.
    expect(files.length).toBeGreaterThan(100);
  });

  it("never writes the brand name into application source", () => {
    const leaks = findLeaks(new RegExp(`\\b${escapeRegExp(brand.name)}\\b`, "i"));
    expect(
      leaks,
      `The brand name belongs in lib/brand/src/brand.ts. Import it from @workspace/brand instead:\n${leaks.join("\n")}`,
    ).toEqual([]);
  });

  it("never writes the brand tagline into application source", () => {
    const leaks = findLeaks(new RegExp(escapeRegExp(brand.tagline), "i"));
    expect(leaks, `Use brand.tagline:\n${leaks.join("\n")}`).toEqual([]);
  });

  it("never writes the delivery zone into application source", () => {
    // The zone reaches customers in checkout copy ("Dirección de envío (…)"), and a second
    // brand will almost certainly cover a different district.
    const leaks = findLeaks(new RegExp(escapeRegExp(brand.deliveryZone), "i"));
    expect(leaks, `Use brand.deliveryZone:\n${leaks.join("\n")}`).toEqual([]);
  });

  it("never writes the order reference prefix into application source", () => {
    // Matches the prefix only where it is used as a reference ("ANT-000123"), which is how it
    // reaches customers; a bare word that happens to contain the letters is not a leak.
    const leaks = findLeaks(new RegExp(`\\b${escapeRegExp(brand.orderReferencePrefix)}-?\\d`, "i"));
    expect(
      leaks,
      `Use orderReference()/parseOrderReference() from @workspace/brand:\n${leaks.join("\n")}`,
    ).toEqual([]);
  });
});

describe("order reference", () => {
  it("round-trips through the configured prefix", () => {
    expect(orderReference(123)).toBe(`${brand.orderReferencePrefix}-123`);
    expect(parseOrderReference(orderReference(123))).toBe(123);
  });

  it("accepts what a human actually types into the backoffice search", () => {
    expect(parseOrderReference("123")).toBe(123);
    expect(parseOrderReference(` ${brand.orderReferencePrefix.toLowerCase()}-123 `)).toBe(123);
    expect(parseOrderReference(`${brand.orderReferencePrefix}123`)).toBe(123);
  });

  it("returns null for terms that are not references, so a name search is not read as one", () => {
    const bare = `${brand.orderReferencePrefix}-`;
    for (const term of ["", "  ", "maria", bare, "12a", "1.5", "-5"]) {
      expect(parseOrderReference(term), `expected "${term}" not to parse`).toBeNull();
    }
  });
});

describe("web app manifest", () => {
  it("takes its name and colours from the brand, not from a checked-in file", () => {
    const manifest = JSON.parse(webManifest(brand.storefront));
    expect(manifest.name).toBe(brand.storefront.title);
    expect(manifest.short_name).toBe(brand.shortName);
    expect(manifest.theme_color).toBe(brand.storefront.themeColor);
  });
});
