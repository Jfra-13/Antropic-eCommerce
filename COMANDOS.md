# Comandos — Antropic Design Studio

Referencia operativa del monorepo. Windows 11 (PowerShell o Git Bash).

> **RTK:** prefijá con `rtk` (ej. `rtk pnpm ...`) si querés salida compacta. Acá van sin prefijo.
>
> **Puerto del API:** no hay default. `PORT` es obligatorio (el server tira error si falta). El `3000` de esta guía es solo un ejemplo — usá el que quieras, pero tiene que coincidir con `VITE_API_URL` del front.

---

## 1. Setup inicial

### 1.1. `.env` de la raíz (gitignored)

Lo lee el API. Mínimo:

```
DATABASE_URL=postgresql://...              # Supabase (pooler)
SUPABASE_URL=https://<ref>.supabase.co     # verificación JWT en el middleware de auth
SUPABASE_SERVICE_ROLE_KEY=eyJ...           # solo si usás el admin. NUNCA en el front
```

`PORT` y `BASE_PATH` se pasan por línea de comando, no van en `.env`.

### 1.2. Instalar

```bash
pnpm install
```

Lockfile congelado en CI/post-merge. Guard de supply-chain: `minimumReleaseAge: 1440` (1 día), no bajarlo sin razón fuerte.

---

## 2. Base de datos (Drizzle + Supabase)

```bash
# Aplicar schema (dev). Push-based, sin migraciones versionadas.
pnpm --filter @workspace/db run push

# Igual pero sin prompts (drop/alter directo). Necesario en no-TTY.
pnpm --filter @workspace/db run push-force

# Seed catálogo: 20 productos + categorías + ocasiones + variantes + media placeholder.
# Idempotente (borra tablas de catálogo FK-safe y re-inserta).
pnpm --filter @workspace/scripts run seed
```

> **Gotcha (rename resolver):** si un cambio en la MISMA tabla suma una columna Y borra otra, `drizzle-kit push` abre un prompt interactivo ("¿es rename?") que `--force` NO saltea y que rompe sin TTY. Workaround: partir en dos push — primero las adiciones, después el drop.

---

## 3. Contrato spec-first (OpenAPI → Zod + React Query)

```bash
# Fuente de verdad: lib/api-spec/openapi.yaml
# Regenera api-zod (Zod) + api-client-react (hooks). Corre typecheck de libs al final.
pnpm --filter @workspace/api-spec run codegen
```

> Nunca editar a mano nada bajo `generated/`. Editar `openapi.yaml` y re-correr codegen.

---

## 4. Desarrollo — levantar la app

Necesitás **dos terminales**: API + front (storefront o admin).

> El script `dev` del API usa `export` (sintaxis bash) y rompe en PowerShell. Por eso corremos `build` + `start`, que hace lo mismo.

### 4.1. API (`api-server`)

**PowerShell:**

```powershell
pnpm --filter @workspace/api-server run build
$env:PORT=3000
pnpm --filter @workspace/api-server run start
```

**Git Bash:**

```bash
pnpm --filter @workspace/api-server run build
PORT=3000 pnpm --filter @workspace/api-server run start
```

Esperá `Server listening ... port:3000`. `start` lee el `.env` de la raíz para `DATABASE_URL` + `SUPABASE_*`.

### 4.2. Storefront (`antropic-store`) — puerto 5173

**PowerShell:**

```powershell
$env:PORT=5173; $env:BASE_PATH="/"; $env:VITE_API_URL="http://localhost:3000"
pnpm --filter @workspace/antropic-store run dev
```

**Git Bash** (`MSYS_NO_PATHCONV=1` evita que mutile `BASE_PATH=/`):

```bash
MSYS_NO_PATHCONV=1 PORT=5173 BASE_PATH=/ VITE_API_URL=http://localhost:3000 \
  pnpm --filter @workspace/antropic-store run dev
```

- **`VITE_API_URL` es obligatorio en dev.** Sin eso el front pega a su propio puerto → productos vacíos + error de fetch en consola. El puerto debe coincidir con el del API.
- Sin `MSYS_NO_PATHCONV=1`, Git Bash convierte `/` en la ruta de instalación de Git y Vite sirve en base incorrecta.

### 4.3. Admin (`antropic-admin`) — puerto 5174

Necesita su propio `.env` en `artifacts/antropic-admin/.env` (lo lee Vite en el navegador):

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...             # anon/public key, NO la service_role
VITE_API_URL=http://localhost:3000
```

**PowerShell:**

```powershell
$env:PORT=5174; $env:BASE_PATH="/"
pnpm --filter @workspace/antropic-admin run dev
```

- `PORT` y `BASE_PATH` los exige el `vite.config.ts`. Para dev local, `BASE_PATH="/"`.
- El `.env` del front lo carga Vite **al arrancar** — si lo editás, reiniciá el server.

> **Por qué dos claves Supabase:** el navegador es público → front usa `anon` key (permisos limitados). El backend usa `service_role` (poderes de admin), que jamás sale del server.
>
> Dónde sacarlas — Supabase dashboard → **Project Settings → API**: Project URL (`SUPABASE_URL`), key `anon`/`public` (`VITE_SUPABASE_ANON_KEY`), key `service_role` (`SUPABASE_SERVICE_ROLE_KEY`), Settings → Database → Connection string URI (`DATABASE_URL`).

---

## 5. Primer admin (una sola vez)

Auth por Supabase (magic link / Google OAuth); el rol sale de `profiles.role` (default `customer`). No hay usuario/contraseña. Solo un admin promueve a otros, pero al inicio no existe ninguno → el primero se setea a mano.

1. Abrí `http://localhost:5174`.
2. Login con **magic link**: meté tu correo → "enviar link" → revisá la casilla (mirá spam) → clic. Esto crea tu `auth user` + `profile` con `role='customer'`.
3. Promoveté — Supabase dashboard → **SQL Editor → New query**:

   ```sql
   UPDATE profiles SET role = 'admin' WHERE email = 'TU_CORREO';
   ```

4. Refrescá `http://localhost:5174` → entrás como admin.

De acá en más, los demás empleados se crean desde la UI de **Usuarios** del panel.

> Google OAuth falla con `provider is not enabled` si no lo activaste (Authentication → Providers → Google). No hace falta para el primer admin. El email default de Supabase tiene rate limit bajo (~3-4/hora).

---

## 6. Verificación / smoke test

```bash
# API vivo
curl http://localhost:3000/api/healthz                              # {"status":"ok"}
curl "http://localhost:3000/api/products?limit=2"                   # items + total:20
curl "http://localhost:3000/api/products?category=denim&limit=100"  # total:2
curl "http://localhost:3000/api/products?occasion=playa&limit=100"  # total:3
curl http://localhost:3000/api/products/jeans-mom-fit               # detalle por slug
curl -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/products/nope  # 404
```

En el navegador: DevTools → Network → filtro `api`. Al cargar Home deben verse 200 a `/api/products`, `/api/categories`, `/api/occasions`.

---

## 7. Calidad (gates)

No hay test runner todavía. Los únicos gates son typecheck y build.

```bash
pnpm run typecheck        # tsc de libs + artifacts + scripts
pnpm run build            # typecheck + build de todos los paquetes

# Por paquete
pnpm --filter @workspace/antropic-store run typecheck
pnpm --filter @workspace/api-server run typecheck

# Build de producción del storefront
MSYS_NO_PATHCONV=1 PORT=5173 BASE_PATH=/ \
  pnpm --filter @workspace/antropic-store run build
```

---

## 8. Cheat sheet

| Necesito… | Comando |
|---|---|
| Instalar | `pnpm install` |
| Push schema | `pnpm --filter @workspace/db run push-force` |
| Seed catálogo | `pnpm --filter @workspace/scripts run seed` |
| Regenerar API client | `pnpm --filter @workspace/api-spec run codegen` |
| API en dev (PowerShell) | `pnpm --filter @workspace/api-server run build; $env:PORT=3000; pnpm --filter @workspace/api-server run start` |
| API en dev (Git Bash) | `pnpm --filter @workspace/api-server run build && PORT=3000 pnpm --filter @workspace/api-server run start` |
| Store en dev | `MSYS_NO_PATHCONV=1 PORT=5173 BASE_PATH=/ VITE_API_URL=http://localhost:3000 pnpm --filter @workspace/antropic-store run dev` |
| Admin en dev (PowerShell) | `$env:PORT=5174; $env:BASE_PATH="/"; pnpm --filter @workspace/antropic-admin run dev` |
| Promover primer admin | `UPDATE profiles SET role = 'admin' WHERE email = 'TU_CORREO';` (Supabase SQL Editor) |
| Typecheck todo | `pnpm run typecheck` |
| Build todo | `pnpm run build` |

---

## 9. Arranque rápido (día a día)

Con el `.env` ya configurado y el schema ya pusheado.

### Regla de oro — el orden NO se puede cruzar

**El API (back) va SIEMPRE primero. El front y el admin le pegan por HTTP.**

1. **Back primero.** El storefront y el admin hacen fetch al API. Si arrancan sin el API arriba → el back todavía no responde.
2. **Front/admin después,** una vez que el back diga `Server listening`.

Cada app va en su **propia terminal, dejala abierta**. El back es un proceso que se queda escuchando; si cerrás esa terminal, se cae y el front/admin dejan de responder.

| Síntoma | Causa | Arreglo |
|---|---|---|
| Storefront en blanco / productos vacíos | API no está arriba, o `VITE_API_URL` no apunta al puerto del API | Arrancá el API primero. Verificá que `VITE_API_URL` = puerto del API |
| Admin: "no se conecta al servidor" | Igual: API caído o `VITE_API_URL` mal en `artifacts/antropic-admin/.env` | Arrancá el API. Revisá el `.env` del admin y reiniciá su server |
| Cambié un `.env` y no toma | Vite lee el `.env` al arrancar | Reiniciá el server de esa app |

### Paso 1 — Terminal A: API (back) — **primero, siempre**

```powershell
pnpm --filter @workspace/api-server run build
$env:PORT=3000
pnpm --filter @workspace/api-server run start
```

**Esperá `Server listening ... port:3000` antes de seguir.** Hasta que no aparezca, no arranques el front ni el admin.

Chequeo rápido (otra terminal): `curl http://localhost:3000/api/healthz` → `{"status":"ok"}`.

### Paso 2 — Terminal B: elegí UNA

Storefront **o** admin. Si querés las dos, abrí una tercera terminal (cada una en puerto distinto). El back de la Terminal A sirve a las dos.

**Opción A — Storefront** (`http://localhost:5173`):

```powershell
$env:PORT=5173; $env:BASE_PATH="/"; $env:VITE_API_URL="http://localhost:3000"
pnpm --filter @workspace/antropic-store run dev
```

**Opción B — Admin** (`http://localhost:5174`):

```powershell
$env:PORT=5174; $env:BASE_PATH="/"
pnpm --filter @workspace/antropic-admin run dev
```

> El admin además necesita `artifacts/antropic-admin/.env` (ver 4.3). `VITE_API_URL` ahí adentro tiene que ser el puerto del API de la Terminal A.

> Solo la primera vez / cuando cambie el schema o el catálogo: `pnpm --filter @workspace/db run push-force` y `pnpm --filter @workspace/scripts run seed`.
