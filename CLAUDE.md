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
pnpm --filter @workspace/db run generate               # author a migration from the schema diff
pnpm --filter @workspace/db run migrate                # apply pending migrations to DATABASE_URL
pnpm --filter @workspace/db run push-force             # prototyping only, throwaway DB (see below)
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
apply the schema first with `pnpm --filter @workspace/db run migrate`. There is no default
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
  `customFetch` wrapper), `brand` (brand identity as data — see below).
- **`docs/`** — `COMANDOS.md` (runbook), `CLONACION.md` (fork procedure for a second brand),
  `TUNELES.md` (Cloudflare Tunnel demo guide), `negocio/` (requirements, physical DB schema,
  role flows, style guide).
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

Schema changes are **migration-based**. `generate` authors a SQL file from the schema diff into
`lib/db/drizzle/`, which is committed alongside the schema change; `migrate` replays whatever a
database has not seen, tracked in `drizzle.__drizzle_migrations`. CI builds the test database with
`migrate`, so a missing or malformed migration fails there rather than in production.

`push`/`push-force` still exist but are for prototyping against a **throwaway** database only:
they diff against whatever the target currently holds, so two environments pushed at different
times drift apart with no record of what was applied.

A database created before migrations existed has the tables but no bookkeeping, so `migrate`
would try to re-create them and fail. Run `pnpm --filter @workspace/scripts run
baseline-migrations` once against it first — it records the baseline without executing its SQL,
and refuses to run against an empty database, where the answer is plain `migrate`.

> **Gotcha (rename resolver):** if one change adds a column AND drops another in the *same* table,
> `drizzle-kit push` opens an interactive "is this a rename?" prompt that `--force` does not skip and
> that breaks without a TTY. With `generate` the prompt is answered once by a developer and the
> answer lives in the committed SQL, so CI (`migrate`) never sees it — one more reason `push`
> belongs only on a throwaway database.

### brand

`lib/brand/src/brand.ts` is the single file that says who the store is: name, tagline, delivery
zone, order-reference prefix, per-artifact document head (title, meta, Open Graph, icons, theme
color) and the email header color. It is consumed by both frontends, the API's email templates and
the Vite configs.

This exists because the codebase gets forked per brand (`docs/CLONACION.md`). The boundary: what a
**developer** sets and the HTML shell needs before the API is ever called lives here; what the
**business** must be able to correct without a deploy — razón social, RUC, domicilio fiscal, legal
texts, contact, banners — lives in the `settings` table and is edited in the backoffice.

Two things follow from that:

- Each artifact's `index.html` carries no brand identity. `brandHtmlPlugin`
  (`lib/brand/src/vite-plugin.ts`) injects the head and emits `manifest.webmanifest` at build time,
  and serves the manifest from memory in dev. The plugin is loaded as real ESM by Node, so imports
  *inside* `lib/brand` spell out the `.ts` extension.
- `lib/brand/src/no-hardcoded-brand.test.ts` scans `artifacts/`, `lib/` and `scripts/` and fails if
  the brand name, tagline, delivery zone or reference prefix are written by hand anywhere else. It
  runs in CI. Package names and repo paths (`@workspace/antropic-store`) are exempt — they are
  identifiers, not copy.

## antropic-store (storefront)

Wired to `api-server` through `api-client-react` (React Query hooks) with Supabase for auth
(magic link + Google OAuth). There is no mock data layer — `src/data/mockData.ts` no longer exists.

`src/context/StoreContext.tsx` holds the dual-mode state: logged out, cart and favorites live in
`localStorage` (guest keys); on login they are merged into the server-side cart/wishlist and the
local copies are cleared. Supabase persists the session in `localStorage` and refreshes it.

Routing is `wouter` (`src/App.tsx`); UI components are shadcn/ui-style primitives under
`src/components/ui/`.

**Brand color gotcha**: brand colors live in *two* representations that must be updated together —
HSL tokens in `src/index.css` (consumed by shadcn/ui via `hsl(var(--primary))`) and the hex value in
`lib/brand` used by the transactional email templates, which inline their styles because email
clients discard stylesheets. A palette change touching only `index.css` leaves every email in the old
colors. Garment swatch colors (Rosa, Coral, Dorado…) come from the database and represent physical
product colors, not brand identity — never include them in a brand-palette swap, even where a hex
value coincidentally matches an old brand color.

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
a frozen-lockfile install + `db migrate` after merges.

Never commit `.env` files or `.har` captures — HAR files record request headers, cookies and bearer
tokens in plaintext.
