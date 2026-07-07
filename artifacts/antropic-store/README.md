# Antropic Store

Customer-facing storefront (Vite + React + Tailwind + shadcn/ui). Currently
frontend-only: cart, favorites and auth are mocked in
`src/context/StoreContext.tsx` (persisted to `localStorage`), backed by static
data in `src/data/mockData.ts`. Not yet wired to `api-server` /
`api-client-react`.

## Dev

```
pnpm --filter @workspace/antropic-store run dev        # requires PORT
pnpm --filter @workspace/antropic-store run typecheck
```

## Brand colors gotcha

Brand colors live in two places that must change together:
- HSL tokens in `src/index.css` (consumed by shadcn via `hsl(var(--primary))`).
- Any remaining hardcoded hex arbitrary values in pages/components.

Exception: the garment swatch color map in `src/data/mockData.ts` (Rosa, Coral,
Dorado…) represents physical product colors, not brand identity — never swap it
in a brand-palette change.

## Done (design pass FRON-01 → FRON-04)

- Extended data model: `Product.images[]`, `variants[]` with per-size stock,
  `occasion[]`, `badge?`.
- Migrated ~180 hardcoded hex values to semantic design tokens in `index.css`.
  Palette: white page background, brand pink `#EA4C75` as `--primary` only,
  `--promo` token for promo accents.
- `ProductCard` with `compact` / `showPrice` props.
- Product detail page with image gallery.
- Navbar mega-menu.
- New components: `ProductCarousel` (desktop arrows), `Breadcrumb`,
  `SearchOverlay`, `CategoryPills`.
- Search only via navbar magnifier (`?q=` still supported); removed the long
  inline search input from `/search`.

## Pending

- [ ] Wire state to `api-server` via `api-client-react` (replace mocked
      `StoreContext` + static `mockData`).
- [ ] Real auth (login is currently mocked).
- [ ] Checkout / payments flow (see `detalles_negocio/Antropic-Requerimientos.md`,
      payments section still open).
- [ ] Product data from DB (`lib/db` schema is currently empty).
- [ ] Admin / employee views (out of scope for this storefront package).
- [ ] Replace placeholder product imagery with final assets.
