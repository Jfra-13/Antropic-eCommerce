# Comandos — Antropic Design Studio

Referencia operativa del monorepo. Windows 11 + Git Bash.

> **Regla RTK:** prefijá los comandos con `rtk` (git, pnpm, etc.) si querés salida compacta. Acá van sin prefijo por claridad.

---

## 0. Requisitos previos

`.env` en la raíz del repo (gitignored) con al menos:

```
DATABASE_URL=postgresql://...      # Supabase (pooler)
SUPABASE_URL=https://<ref>.supabase.co
```

- El API (`api-server`) y `db` **requieren** `DATABASE_URL` — tiran error al arrancar si falta.
- `SUPABASE_URL` lo usa el middleware de auth (verificación JWT).
- `PORT` y `BASE_PATH` se pasan por línea de comando (ver más abajo), no viven en `.env`.

---

## 1. Instalación

```bash
pnpm install
```

- Lockfile congelado en CI/post-merge.
- Guard de supply-chain: `minimumReleaseAge: 1440` (1 día). No bajarlo sin razón fuerte.

---

## 2. Base de datos (Drizzle + Supabase)

```bash
# Aplicar schema a la DB (dev). Push-based, sin migraciones versionadas.
pnpm --filter @workspace/db run push

# Igual pero sin prompts (drop/alter directo). Necesario en no-TTY.
pnpm --filter @workspace/db run push-force
```

**Gotcha (rename resolver):** si un cambio en la MISMA tabla suma una columna Y borra otra, `drizzle-kit push` abre un prompt interactivo ("¿es rename?") que **`--force` NO saltea** y que rompe sin TTY. Workaround: partir en dos push — primero solo las adiciones, luego el drop puro.

### Seed del catálogo

```bash
# Carga 20 productos + categorías + ocasiones + variantes talla×color + media placeholder.
# Idempotente: borra las tablas de catálogo (orden FK-safe) y re-inserta.
pnpm --filter @workspace/scripts run seed
```

---

## 3. Contrato spec-first (OpenAPI → Zod + React Query)

```bash
# Fuente de verdad: lib/api-spec/openapi.yaml
# Regenera lib/api-zod (Zod) + lib/api-client-react (hooks). Corre typecheck de libs al final.
pnpm --filter @workspace/api-spec run codegen
```

> Nunca editar a mano nada bajo `generated/`. Editar `openapi.yaml` y re-correr codegen.

---

## 4. Desarrollo (levantar la app)

Necesitás **dos terminales**: API + storefront.

### Terminal A — API (`api-server`)

El script `dev` usa `export`, que falla en Windows (`cmd.exe`). Usá `build` + `start`:

```bash
pnpm --filter @workspace/api-server run build
PORT=4000 pnpm --filter @workspace/api-server run start
```

Esperá `Server listening ... port:4000`. `start` lee `../../.env` para `DATABASE_URL` + `SUPABASE_URL`.

### Terminal B — Storefront (`antropic-store`)

**Git Bash** (con `MSYS_NO_PATHCONV=1` para que no mutile `BASE_PATH=/`):

```bash
MSYS_NO_PATHCONV=1 PORT=5173 BASE_PATH=/ VITE_API_URL=http://localhost:4000 \
  pnpm --filter @workspace/antropic-store run dev
```

**PowerShell** (alternativa, sin el problema de path conversion):

```powershell
$env:PORT=5173; $env:BASE_PATH="/"; $env:VITE_API_URL="http://localhost:4000"
pnpm --filter @workspace/antropic-store run dev
```

- **`VITE_API_URL` es obligatorio en dev**: sin eso el front pega a su propio puerto y no encuentra el API (productos vacíos + error de fetch en consola).
- Sin `MSYS_NO_PATHCONV=1`, Git Bash convierte `/` en la ruta de instalación de Git y Vite sirve en una base incorrecta.

Abrí la URL que imprime Vite (`http://localhost:5173`).

---

## 5. Verificación / smoke test

```bash
# API vivo
curl http://localhost:4000/api/healthz                       # {"status":"ok"}
curl "http://localhost:4000/api/products?limit=2"            # items + total:20
curl "http://localhost:4000/api/products?category=denim&limit=100"   # total:2
curl "http://localhost:4000/api/products?occasion=playa&limit=100"   # total:3
curl http://localhost:4000/api/products/jeans-mom-fit        # detalle por slug
curl -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/products/nope  # 404
```

En el navegador: DevTools → Network → filtro `api`. Al cargar Home deben verse 200 a `/api/products`, `/api/categories`, `/api/occasions`.

---

## 6. Calidad (gates)

No hay test runner configurado todavía. Los únicos gates son typecheck y build.

```bash
pnpm run typecheck        # tsc de libs + todos los artifacts + scripts
pnpm run build            # typecheck + build de todos los paquetes

# Por paquete
pnpm --filter @workspace/antropic-store run typecheck
pnpm --filter @workspace/api-server run typecheck
```

Build de producción del storefront (bundle Vite):

```bash
MSYS_NO_PATHCONV=1 PORT=5173 BASE_PATH=/ \
  pnpm --filter @workspace/antropic-store run build
```

---

## 7. Cheat sheet

| Necesito… | Comando |
|---|---|
| Instalar | `pnpm install` |
| Push schema | `pnpm --filter @workspace/db run push-force` |
| Seed catálogo | `pnpm --filter @workspace/scripts run seed` |
| Regenerar API client | `pnpm --filter @workspace/api-spec run codegen` |
| API en dev | `pnpm --filter @workspace/api-server run build && PORT=4000 pnpm --filter @workspace/api-server run start` |
| Store en dev | `MSYS_NO_PATHCONV=1 PORT=5173 BASE_PATH=/ VITE_API_URL=http://localhost:4000 pnpm --filter @workspace/antropic-store run dev` |
| Typecheck todo | `pnpm run typecheck` |
| Build todo | `pnpm run build` |
