---
name: ANTROPIC store color architecture
description: Where brand colors live in the antropic-store artifact and which hexes must never be touched by a palette refresh.
---

Brand colors in `artifacts/antropic-store` live in two separate layers that must both be updated together for any palette change:
1. HSL theme tokens in `src/index.css` (`:root` and `.dark`), which shadcn/ui components (Select, Dialog, etc.) consume via `hsl(var(--primary))` etc.
2. Hardcoded hex Tailwind arbitrary values (e.g. `text-[#EA4C75]`) scattered across pages/components — these do NOT inherit from the CSS tokens and must be swapped separately (mechanical find/replace works well since each brand hex is unique).

**Why:** Only updating index.css leaves the majority of the UI (which uses raw hex arbitrary values, not token classes) unchanged — a partial refresh looks broken/inconsistent.

**How to apply:** When asked to change the brand palette, grep for both the CSS custom properties and the raw hex codes across `src/`. Convert new hex → HSL manually (or via computation) for the token file.

**Exception — do not touch:** `src/data/mockData.ts` contains a `C = {...}` map of *product* swatch colors (Rosa, Coral, Dorado, Fucsia, Blanco, Negro, Denim) that a shopper picks per garment. Some of these hex values coincidentally match old brand colors (e.g. fucsia swatch reused the old primary pink `#EA4C75`), but they represent real garment colors, not brand identity, and must be excluded from any brand-palette swap.
