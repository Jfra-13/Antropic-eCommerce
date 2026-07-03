# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from repo root unless noted. Package manager is pnpm (workspaces).

```
pnpm install                                          # install (frozen lockfile in CI/post-merge)
pnpm run build                                        # typecheck + build all packages
pnpm run typecheck                                    # tsc --build libs, then typecheck artifacts/scripts
pnpm --filter @workspace/api-server run dev            # run API server (requires PORT, DATABASE_URL)
pnpm --filter @workspace/antropic-store run dev        # run storefront (requires PORT)
pnpm --filter @workspace/mockup-sandbox run dev        # run mockup sandbox (requires PORT, BASE_PATH)
pnpm --filter @workspace/api-spec run codegen          # regenerate api-client-react + api-zod from openapi.yaml
pnpm --filter @workspace/db run push                   # push Drizzle schema to DATABASE_URL (dev only)
pnpm --filter @workspace/db run push-force             # push with --force (drops/alters without prompt)
```

Single-package typecheck: `pnpm --filter <name> run typecheck` (e.g. `@workspace/antropic-store`).

Required env vars: `PORT` (per dev-server package), `DATABASE_URL` (api-server, db), `BASE_PATH` (mockup-sandbox, antropic-store dev servers via Vite config).

## Workspace layout

pnpm workspace with two package roots, each with a different lifecycle:

- **`artifacts/*`** — deployable apps. Currently: `antropic-store` (customer-facing storefront, Vite+React), `api-server` (Express 5 API), `mockup-sandbox` (design/prototyping playground for UI mockups, not shipped).
- **`lib/*`** — internal libraries consumed by artifacts via `workspace:*`. `db` (Drizzle schema + pg pool), `api-spec` (OpenAPI source + Orval codegen config, no runtime code), `api-zod` (generated Zod schemas from the spec), `api-client-react` (generated React Query hooks + `customFetch` wrapper, generated code consumed by artifacts).
- Shared `catalog:` versions for common deps (react, vite, tailwind, radix, etc.) are pinned once in `pnpm-workspace.yaml`; packages reference them as `"catalog:"` instead of hardcoding a version.
- `scripts/` is a workspace member too (misc one-off TS scripts run via `tsx`).

### API contract flow (spec-first)

`lib/api-spec/openapi.yaml` is the source of truth. Running its `codegen` script drives Orval to regenerate:
- `lib/api-zod/src/generated/**` — Zod schemas + types (imported by `api-server` for request/response validation, e.g. `HealthCheckResponse` in `routes/health.ts`).
- `lib/api-client-react/src/generated/**` — React Query hooks (imported by frontend artifacts).

Never hand-edit files under `generated/`; edit `openapi.yaml` and rerun codegen. `api-client-react`'s `custom-fetch.ts` is hand-written (not generated) — it's the Orval mutator, handling base URL injection, bearer auth, and error parsing (`ApiError`/`ResponseParseError`) for both browser and React Native runtimes.

### api-server

Express 5 app (`src/app.ts`) mounted under `/api`, routes composed in `src/routes/index.ts` by mounting sub-routers (pattern: one router per resource, e.g. `health.ts`). Structured logging via pino/pino-http (`src/lib/logger.ts`). `PORT` and `DATABASE_URL` are required env vars — the app throws at startup rather than defaulting.

### db (Drizzle)

`lib/db/src/schema/index.ts` re-exports one file per table (currently empty — see the commented template in that file for the expected pattern: `pgTable` + `createInsertSchema` from `drizzle-zod` + inferred types). `lib/db/src/index.ts` creates the `pg.Pool`/`drizzle` instance from `DATABASE_URL` and re-exports the schema. Schema changes are applied with `push`/`push-force` (no migration files checked in — this is push-based, not migration-based).

## antropic-store (storefront)

Currently frontend-only: state (cart, favorites, auth) is mocked in `src/context/StoreContext.tsx` and persisted to `localStorage`, backed by static data in `src/data/mockData.ts` — it is not yet wired to `api-server`/`api-client-react` despite the dependency being present. Routing is `wouter` (`src/App.tsx`), UI components are shadcn/ui-style primitives under `src/components/ui/`.

**Brand color gotcha**: brand colors live in *two* places that must be updated together — HSL tokens in `src/index.css` (consumed by shadcn/ui via `hsl(var(--primary))`) and hardcoded hex Tailwind arbitrary values (e.g. `text-[#EA4C75]`) scattered across pages/components, which do not inherit from the CSS tokens. A palette change touching only `index.css` will look inconsistent. **Exception**: `src/data/mockData.ts` has a garment swatch color map (Rosa, Coral, Dorado, etc.) — these represent physical product colors, not brand identity, even where a hex value coincidentally matches an old brand color. Never include it in a brand-palette swap.

## mockup-sandbox

Design playground, not a shipped artifact. `mockupPreviewPlugin.ts` is a custom Vite plugin that globs `src/components/mockups/**/*.tsx` (excluding anything with an `_`-prefixed path segment) and writes an auto-generated module map to `src/.generated/mockup-components.ts` mapping each file to a lazy import — this is how the sandbox discovers and previews mockup components without manual registration. It watches the directory in dev and regenerates on add/remove.

## Deployment / environment

`pnpm-workspace.yaml` enforces a 1-day minimum npm package release age as a supply-chain guard (`minimumReleaseAge: 1440`); do not lower this without a strong reason. `scripts/post-merge.sh` runs a frozen-lockfile install + `db push` after merges.

COMO ES DE REPLIT DESCARGADO PARA UQE FUNCIOONE DE LOCAL SE DEBE HACER LO SIGUIENTE.

Hacer todo el bash a exepcion del ejecutar tienda
---------------------------
- Desactivar ese script en tu copia local (más rápida, no requiere instalar nada)

Como ese script es solo una alarma de seguridad para el entorno de Replit y no aplica en tu PC (tú ya sabes que estás usando pnpm), puedes desactivarlo editando un archivo:

1. En VSCode, abre el package.json que está en la raíz del proyecto (no el de artifacts/antropic-store, sino el de más arriba, junto a la carpeta artifacts).
Busca esta línea:

"preinstall": "sh -c 'rm -f package-lock.json yarn.lock; case \"$npm_config_user_agent\" in pnpm/*) ;; *) echo \"Use pnpm instead\" >&2; exit 1 ;; esac'",

---------------------------------------
Replit solo corre en Linux, ese archivo le dice a pnpm "no instales las versiones de estas librerías para Windows, Mac, etc. — solo necesito Linux".

1. Abre el archivo pnpm-workspace.yaml (está en la raíz del proyecto, junto al package.json que ya editaste).

2.  Busca la sección que empieza con overrides: (vas a ver una lista larga de líneas que dicen cosas como "esbuild>@esbuild/darwin-arm64": "-", "rollup>@rollup/rollup-win32-x64-msvc": "-", etc. — son como 80 líneas).

3. Selecciona TODA esa sección y reemplázala

overrides:
  # drizzle-kit uses esbuild internally on an older version that's vulnerable, this overrides it
  "@esbuild-kit/esm-loader": "npm:tsx@^4.21.0"
  esbuild: "0.27.3"

4. Ejecuta

Remove-Item -Recurse -Force node_modules

-----------------------------------------
- Instalar 20 o superior
node -v

- Instalar gestor de paquetes
npm install -g pnpm

- Verificar su instalacion
pnpm -v

- Ejecutar
pnpm approve-builds

- Instalar dependecias en tu proyecto
pnpm install

- Ejecutar la tieda
$env:PORT=5173; $env:BASE_PATH="/"; pnpm --filter @workspace/antropic-store run dev

- Ir al navegador local
http://localhost:5173
