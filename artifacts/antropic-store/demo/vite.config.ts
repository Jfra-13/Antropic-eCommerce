import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Static demo build of `antropic-store`.
//
// Same application source as the deployable storefront — only three things are swapped
// so it can run as one self-contained HTML file with no backend:
//
//   1. `src/lib/supabase.ts`  -> demo/src/supabase-stub.ts   (auth + storage, local)
//   2. `wouter` inside App.tsx -> demo/src/wouter-memory.tsx (routing in memory)
//   3. window.fetch            -> demo/src/api-shim.ts       (imported by the entry)
//
// Assets are inlined as data URIs here; build.mjs then folds the JS and CSS into the
// HTML. This config is deliberately separate from the storefront's own vite.config.ts —
// nothing here affects the deployable build.

const storeSrc = path.resolve(import.meta.dirname, "../src");
const demoSrc = path.resolve(import.meta.dirname, "src");

// Module substitution keyed on the *resolved* file, so it cannot be confused by another
// package importing something with the same specifier.
function demoSubstitutions(): Plugin {
  const supabaseModule = path.join(storeSrc, "lib/supabase.ts");
  const appModule = path.join(storeSrc, "App.tsx");
  const indexCss = path.join(storeSrc, "index.css");

  return {
    name: "antropic-demo-substitutions",
    enforce: "pre",

    // Tailwind v4 auto-detects sources from the Vite root, which for this build is
    // demo/ — so it would scan the four demo files and emit almost no utilities. The
    // markup actually lives next to index.css, so point @source at that directory
    // (paths in @source resolve relative to the stylesheet).
    transform(code, id) {
      if (path.resolve(id.split("?")[0]) !== indexCss) return null;
      return { code: `${code}\n@source "./";\n`, map: null };
    },
    async resolveId(source, importer, options) {
      if (!importer) return null;

      // `wouter` -> memory-routed wrapper, but only where the Router is mounted. The
      // wrapper itself must keep resolving to the real package.
      if (source === "wouter" && path.resolve(importer) === appModule) {
        return path.join(demoSrc, "wouter-memory.tsx");
      }

      if (!source.startsWith(".")) return null;

      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (resolved && path.resolve(resolved.id.split("?")[0]) === supabaseModule) {
        return path.join(demoSrc, "supabase-stub.ts");
      }
      return null;
    },
  };
}

export default defineConfig({
  root: import.meta.dirname,
  // Must stay "/": App.tsx derives the router base from BASE_URL, and a relative "./"
  // would leave it as "." — no route would ever match. Nothing else depends on it,
  // since every asset ends up inlined.
  base: "/",
  plugins: [demoSubstitutions(), react(), tailwindcss()],
  resolve: {
    alias: { "@": storeSrc },
    dedupe: ["react", "react-dom"],
  },
  define: {
    // The mock API answers same-origin `/api/...`, so the client needs no base URL.
    // These also stand in for the storefront's .env, which the demo build never reads.
    "import.meta.env.VITE_API_URL": '""',
    "import.meta.env.VITE_SUPABASE_URL": '"https://demo.invalid"',
    "import.meta.env.VITE_SUPABASE_ANON_KEY": '"demo"',
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    // One HTML + one JS + one CSS, with every image already a data URI — build.mjs only
    // has to fold three files together.
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: { inlineDynamicImports: true, entryFileNames: "demo.js" },
    },
  },
});
