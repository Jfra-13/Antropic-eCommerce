# Antropic Store

Customer-facing storefront (Vite + React + Tailwind + shadcn/ui). Wired to
`api-server` through the generated `api-client-react` hooks, with Supabase for
auth (magic link + Google OAuth).

## Dev

```
pnpm --filter @workspace/antropic-store run dev        # requires PORT, BASE_PATH, VITE_API_URL
pnpm --filter @workspace/antropic-store run typecheck
```

`VITE_API_URL` must point at the running API. Vite reads it only at startup, so
changing it means restarting the server. Full startup order in
`docs/COMANDOS.md` §4 — the API always goes up first.

## State model

`src/context/StoreContext.tsx` runs in two modes:

- **Logged out** — cart lines (variant-keyed) and favorites (product ids) live
  in `localStorage` under guest keys, hydrated against the catalog on load.
- **Logged in** — cart and wishlist live server-side; the guest copies are
  merged in on login and then cleared. Supabase keeps the session in
  `localStorage` and refreshes it.

## Brand colors gotcha

Brand colors live in two places that must change together:

- HSL tokens in `src/index.css` (consumed by shadcn via `hsl(var(--primary))`).
- Any remaining hardcoded hex arbitrary values in pages/components.

Garment swatch colors (Rosa, Coral, Dorado…) come from the database and
represent physical product colors, not brand identity — never swap them in a
brand-palette change.

## Pending

- [ ] Payments flow (see `docs/negocio/Antropic-Requerimientos.md`, payments
      section still open).
- [ ] Replace placeholder product imagery with final assets.
