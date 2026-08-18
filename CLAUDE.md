# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from repo root unless noted. Package manager is pnpm (workspaces).

```
pnpm install                                          # install (frozen lockfile in CI/post-merge)
pnpm run build                                        # typecheck + build all packages
pnpm run typecheck                                    # tsc --build libs, then typecheck artifacts/scripts
pnpm run test                                         # vitest unit tests (no database)
pnpm run test:integration                             # vitest against real Postgres (requires DATABASE_URL)
pnpm --filter @workspace/api-server run build          # required before `start` after any API change
pnpm --filter @workspace/api-server run start          # run API server (requires PORT, DATABASE_URL)
pnpm --filter @workspace/antropic-store run dev        # storefront (requires PORT, BASE_PATH, VITE_API_URL)
pnpm --filter @workspace/antropic-admin run dev        # admin panel (requires PORT, BASE_PATH)
pnpm --filter @workspace/mockup-sandbox run dev        # mockup sandbox (requires PORT, BASE_PATH)
pnpm --filter @workspace/api-spec run codegen          # regenerate api-client-react + api-zod from openapi.yaml
pnpm --filter @workspace/db run push                   # push Drizzle schema to DATABASE_URL (dev only)
pnpm --filter @workspace/db run push-force             # push with --force (drops/alters without prompt)
pnpm --filter @workspace/scripts run seed              # seed catalog (idempotent)
```

The API's `dev` script uses bash `export` syntax and breaks in PowerShell — use `build` + `start`
instead. `start` serves whatever is in `dist/`, so **the build is mandatory after touching API code**.

`docs/COMANDOS.md` is the full operational runbook (startup order, per-shell variants, smoke tests,
common symptoms). Prefer it over reconstructing commands from scratch.

Single-package typecheck: `pnpm --filter <name> run typecheck` (e.g. `@workspace/antropic-store`).

Quality gates are `typecheck`, `test`, `test:integration` and `build`, and CI runs all four
(`.github/workflows/ci.yml`).

- `pnpm test` — vitest unit tests. Pure domain logic only (money, order state machines, coupon
  discounts, complaint deadlines); no database, runs anywhere.
- `pnpm test:integration` — vitest against **real Postgres**, driven by `DATABASE_URL`. These cover
  what a unit test cannot prove: stock concurrency under simultaneous approvals, transaction
  rollback, complaint correlativos, append-only consent history.

Integration tests **truncate tables**. The harness (`artifacts/api-server/src/test/db.ts`) refuses
to run against any host other than localhost, so point `DATABASE_URL` at a throwaway database and
apply the schema first with `pnpm --filter @workspace/db run push-force`. There is no default
`DATABASE_URL` for them on purpose.

Tests live next to the code they cover: `*.test.ts` for unit, `*.integration.test.ts` for the ones
that need a database.

Required env vars: `PORT` and `BASE_PATH` (per dev-server package, passed on the command line, not
in `.env`), `DATABASE_URL` + `SUPABASE_*` (api-server, db, from the root `.env`), `VITE_*` (store
and admin, from their own `.env`). See `.env.example` files.

## Workspace layout

pnpm workspace with two package roots, each with a different lifecycle:

- **`artifacts/*`** — deployable apps: `antropic-store` (customer storefront, Vite+React),
  `antropic-admin` (staff admin panel, Vite+React), `api-server` (Express 5 API), `mockup-sandbox`
  (design/prototyping playground for UI mockups, not shipped).
- **`lib/*`** — internal libraries consumed by artifacts via `workspace:*`. `db` (Drizzle schema +
  pg pool), `api-spec` (OpenAPI source + Orval codegen config, no runtime code), `api-zod`
  (generated Zod schemas), `api-client-react` (generated React Query hooks + hand-written
  `customFetch` wrapper).
- **`docs/`** — `COMANDOS.md` (runbook), `TUNELES.md` (Cloudflare Tunnel demo guide), `negocio/`
  (requirements, physical DB schema, role flows, style guide).
- Shared `catalog:` versions for common deps (react, vite, tailwind, radix, etc.) are pinned once in
  `pnpm-workspace.yaml`; packages reference them as `"catalog:"` instead of hardcoding a version.
- `scripts/` is a workspace member too (misc one-off TS scripts run via `tsx`).

### API contract flow (spec-first)

`lib/api-spec/openapi.yaml` is the source of truth. Running its `codegen` script drives Orval to
regenerate:

- `lib/api-zod/src/generated/**` — Zod schemas + types (imported by `api-server` for request/response
  validation).
- `lib/api-client-react/src/generated/**` — React Query hooks (imported by frontend artifacts).

Never hand-edit files under `generated/`; edit `openapi.yaml` and rerun codegen. `api-client-react`'s
`custom-fetch.ts` is hand-written (not generated) — it's the Orval mutator, handling base URL
injection, bearer auth, and error parsing (`ApiError`/`ResponseParseError`).

### api-server

Express 5 app (`src/app.ts`) mounted under `/api`. Routes are composed in `src/routes/index.ts`,
which mounts one router per domain module under `src/modules/`: `catalog`, `cart`, `wishlist`,
`checkout`, `orders`, `payments`, `returns`, `config`, `admin` — plus the flat `health` and `me`
routers. New endpoints belong in the matching module's router, not in a new top-level file.

Structured logging via pino/pino-http (`src/lib/logger.ts`). `PORT` and `DATABASE_URL` are required
env vars — the app throws at startup rather than defaulting. Auth is JWT verification against
Supabase; the role comes from `profiles.role`.

### db (Drizzle)

`lib/db/src/schema/index.ts` re-exports one file per table (products, variants, orders, carts,
profiles, returns, coupons, settings, etc.). `lib/db/src/index.ts` creates the `pg.Pool`/`drizzle`
instance from `DATABASE_URL` and re-exports the schema.

Schema changes are applied with `push`/`push-force` — **push-based, not migration-based**. No
migration files are checked in.

> **Gotcha (rename resolver):** if one change adds a column AND drops another in the *same* table,
> `drizzle-kit push` opens an interactive "is this a rename?" prompt that `--force` does not skip and
> that breaks without a TTY. Workaround: split into two pushes — additions first, then the drop.

## antropic-store (storefront)

Wired to `api-server` through `api-client-react` (React Query hooks) with Supabase for auth
(magic link + Google OAuth). There is no mock data layer — `src/data/mockData.ts` no longer exists.

`src/context/StoreContext.tsx` holds the dual-mode state: logged out, cart and favorites live in
`localStorage` (guest keys); on login they are merged into the server-side cart/wishlist and the
local copies are cleared. Supabase persists the session in `localStorage` and refreshes it.

Routing is `wouter` (`src/App.tsx`); UI components are shadcn/ui-style primitives under
`src/components/ui/`.

**Brand color gotcha**: brand colors live in *two* places that must be updated together — HSL tokens
in `src/index.css` (consumed by shadcn/ui via `hsl(var(--primary))`) and hardcoded hex Tailwind
arbitrary values (e.g. `text-[#EA4C75]`) scattered across pages/components, which do not inherit from
the CSS tokens. A palette change touching only `index.css` will look inconsistent. Garment swatch
colors (Rosa, Coral, Dorado…) come from the database and represent physical product colors, not
brand identity — never include them in a brand-palette swap, even where a hex value coincidentally
matches an old brand color.

## antropic-admin (staff panel)

Vite+React panel for catalog, orders, shipments, returns, users and store content configuration.
Consumes the same generated `api-client-react` hooks as the storefront and authenticates through
Supabase. Access is gated on `profiles.role`; the first admin has to be promoted by hand via SQL
(see `docs/COMANDOS.md` §1.4) because no admin exists to promote anyone at bootstrap.

Unlike the storefront, its `VITE_API_URL` comes from `artifacts/antropic-admin/.env` rather than the
command line — changing it requires restarting the Vite server, since Vite reads `.env` only at
startup.

## mockup-sandbox

Design playground, not a shipped artifact. `mockupPreviewPlugin.ts` is a custom Vite plugin that
globs `src/components/mockups/**/*.tsx` (excluding anything with an `_`-prefixed path segment) and
writes an auto-generated module map to `src/.generated/mockup-components.ts` mapping each file to a
lazy import — this is how the sandbox discovers and previews mockup components without manual
registration. It watches the directory in dev and regenerates on add/remove.

## Deployment / environment

`pnpm-workspace.yaml` enforces a 1-day minimum npm package release age as a supply-chain guard
(`minimumReleaseAge: 1440`); do not lower this without a strong reason. `scripts/post-merge.sh` runs
a frozen-lockfile install + `db push` after merges.

Never commit `.env` files or `.har` captures — HAR files record request headers, cookies and bearer
tokens in plaintext.
