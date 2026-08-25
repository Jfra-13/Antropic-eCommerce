import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { brand, brandHtmlPlugin } from "@workspace/brand/vite-plugin";
import path from "path";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    // Injects the head (title, meta, icons) and emits manifest.webmanifest and robots.txt
    // from lib/brand, so the HTML shell carries no brand identity of its own.
    //
    // The disallowed paths are the ones that are private, personal or meaningless out of
    // session. A checkout URL in a search result is a support ticket; an order detail page
    // is somebody's address. `/libro-de-reclamaciones` is deliberately NOT here: it is
    // legally required to be publicly reachable, and being findable is the point.
    brandHtmlPlugin(brand.storefront, {
      disallow: ["/cart", "/checkout", "/profile", "/orders/", "/favorites", "/login"],
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Third-party code changes on its own schedule, application code changes every
        // deploy. Keeping them in one file means every copy fix re-downloads React for
        // every returning visitor. These three are the libraries big enough for that to
        // matter; everything else stays with the app, where a shared chunk per small
        // dependency would cost more in requests than it saves in bytes.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@supabase")) return "vendor-supabase";
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
            return "vendor-react";
          }
          if (id.includes("@radix-ui")) return "vendor-radix";
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
