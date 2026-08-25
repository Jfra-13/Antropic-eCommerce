# Comandos — Antropic Design Studio

Referencia operativa del monorepo. Windows 11 (PowerShell o Git Bash).

> **RTK:** prefijá con `rtk` (ej. `rtk pnpm ...`) si querés salida compacta. Acá van sin prefijo.
>
> **Puerto del API:** no hay default. `PORT` es obligatorio (el server tira error si falta). El `3000` de esta guía es solo un ejemplo — usá el que quieras, pero tiene que coincidir con `VITE_API_URL` del front.

---

## 1. Setup inicial (una sola vez)

### 1.1. `.env` de la raíz (gitignored)

Lo lee el API. Mínimo:

```
DATABASE_URL=postgresql://...              # Supabase (pooler)
SUPABASE_URL=https://<ref>.supabase.co     # verificación JWT en el middleware de auth
SUPABASE_SERVICE_ROLE_KEY=eyJ...           # solo si usás el admin. NUNCA en el front
```

`PORT` y `BASE_PATH` se pasan por línea de comando, no van en `.env`.

### 1.2. `.env` del admin (`artifacts/antropic-admin/.env`)

Lo lee Vite en el navegador:

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...             # anon/public key, NO la service_role
VITE_API_URL=http://localhost:3000        # puerto del API
```

> **Por qué dos claves Supabase:** el navegador es público → front usa `anon` key (permisos limitados). El backend usa `service_role` (poderes de admin), que jamás sale del server.
>
> Dónde sacarlas — Supabase dashboard → **Project Settings → API**: Project URL (`SUPABASE_URL`), key `anon`/`public` (`VITE_SUPABASE_ANON_KEY`), key `service_role` (`SUPABASE_SERVICE_ROLE_KEY`), Settings → Database → Connection string URI (`DATABASE_URL`).

### 1.3. Instalar

```bash
pnpm install
```

Lockfile congelado en CI/post-merge. Guard de supply-chain: `minimumReleaseAge: 1440` (1 día), no bajarlo sin razón fuerte.

### 1.4. Primer admin

Auth por Supabase (magic link / Google OAuth); el rol sale de `profiles.role` (default `customer`). No hay usuario/contraseña. Solo un admin promueve a otros, pero al inicio no existe ninguno → el primero se setea a mano.

1. Levantá API + admin (sección 4) y abrí `http://localhost:5174`.
2. Login con **magic link**: meté tu correo → "enviar link" → revisá la casilla (mirá spam) → clic. Esto crea tu `auth user` + `profile` con `role='customer'`.
3. Promoveté — Supabase dashboard → **SQL Editor → New query**:

   ```sql
   UPDATE profiles SET role = 'admin' WHERE email = 'TU_CORREO';
   ```

4. Refrescá `http://localhost:5174` → entrás como admin.

De acá en más, los demás empleados se crean desde la UI de **Usuarios** del panel.

> Google OAuth falla con `provider is not enabled` si no lo activaste (Authentication → Providers → Google). No hace falta para el primer admin. El email default de Supabase tiene rate limit bajo (~3-4/hora).

---

## 2. Base de datos (Drizzle + Supabase)

El esquema es **migration-based**: los archivos de `lib/db/drizzle/` están versionados y son la
única fuente de verdad de cómo llega una base a su estado actual.

```bash
# Poner al día una base (crea las tablas que falten, en orden). Idempotente.
pnpm --filter @workspace/db run migrate

# Seed catálogo: 20 productos + categorías + ocasiones + variantes + media placeholder.
# Idempotente (borra tablas de catálogo FK-safe y re-inserta).
pnpm --filter @workspace/scripts run seed
```

### Cambiar el esquema

```bash
# 1. Editar lib/db/src/schema/*.ts
# 2. Generar el archivo de migración a partir del diff. NO toca ninguna base.
pnpm --filter @workspace/db run generate
# 3. Revisar el SQL generado en lib/db/drizzle/ y commitearlo junto al cambio de schema.
# 4. Aplicarlo.
pnpm --filter @workspace/db run migrate
```

El paso 3 no es burocracia: el SQL es lo que se va a ejecutar en producción, y es la última
oportunidad de ver un `DROP COLUMN` antes de que se lleve datos por delante.

### Base que ya existía antes de las migraciones — una sola vez

Una base creada con `push` tiene las tablas pero no el registro de migraciones, así que
`migrate` intentaría crear lo que ya está y falla. Hay que marcarle la línea base primero:

```bash
pnpm --filter @workspace/scripts run baseline-migrations   # marca sin ejecutar SQL
pnpm --filter @workspace/db run migrate                    # a partir de acá, normal
```

Se corre **una vez por base** (local, staging, producción). Se niega a ejecutarse contra una
base vacía: ahí lo correcto es `migrate` directo. Una base nueva nunca lo necesita.

### `push` — solo para prototipar

```bash
pnpm --filter @workspace/db run push          # con prompts
pnpm --filter @workspace/db run push-force    # sin prompts
```

Sirve para tantear un cambio de esquema contra una base **desechable** antes de decidir el
diseño. **Nunca contra una base compartida**: `push` diffea contra lo que esa base tenga en ese
momento, así que dos entornos que reciben el mismo `push` en momentos distintos terminan
distintos, y no queda registro de qué se aplicó. Cuando el diseño esté firme: `generate`.

> **Gotcha (rename resolver):** si un cambio en la MISMA tabla suma una columna Y borra otra, `drizzle-kit push` abre un prompt interactivo ("¿es rename?") que `--force` NO saltea y que rompe sin TTY. Con `generate` el prompt también aparece, pero se contesta una vez y queda resuelto en el archivo commiteado — CI corre `migrate`, que no pregunta nada. Es una razón más para no usar `push` fuera de una base desechable.

---

## 3. Contrato spec-first (OpenAPI → Zod + React Query)

```bash
# Fuente de verdad: lib/api-spec/openapi.yaml
# Regenera api-zod (Zod) + api-client-react (hooks). Corre typecheck de libs al final.
pnpm --filter @workspace/api-spec run codegen
```

> Nunca editar a mano nada bajo `generated/`. Editar `openapi.yaml` y re-correr codegen.

---

## 4. Levantar la app (día a día)

**4 comandos, una terminal por app, dejalas abiertas.** El API son 2 comandos (build + start); storefront y admin, 1 cada uno.

### Regla de oro — el orden NO se puede cruzar

**El API (back) va SIEMPRE primero. El front y el admin le pegan por HTTP.** Arrancá el front antes de que el back diga `Server listening` y vas a ver pantallas vacías.

> El script `dev` del API usa `export` (sintaxis bash) y rompe en PowerShell. Por eso corremos `build` + `start`, que hace lo mismo. `start` corre lo que haya en `dist/` — **si tocaste código del API, el `build` es obligatorio antes del `start`**, si no servís código viejo.

### Terminal A — API (primero, siempre)

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

`start` lee el `.env` de la raíz para `DATABASE_URL` + `SUPABASE_*`. **Esperá `Server listening ... port:3000` antes de seguir.**

Chequeo rápido (otra terminal): `curl http://localhost:3000/api/healthz` → `{"status":"ok"}`.

### Terminal B — Storefront (`http://localhost:5173`)

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

- **`VITE_API_URL` es obligatorio en dev.** Sin eso el front pega a su propio puerto → productos vacíos + error de fetch en consola.
- Sin `MSYS_NO_PATHCONV=1`, Git Bash convierte `/` en la ruta de instalación de Git y Vite sirve en base incorrecta.

### Terminal C — Admin (`http://localhost:5174`)

Requiere el `.env` de la sección 1.2.

**PowerShell:**

```powershell
$env:PORT=5174; $env:BASE_PATH="/"
pnpm --filter @workspace/antropic-admin run dev
```

**Git Bash:**

```bash
MSYS_NO_PATHCONV=1 PORT=5174 BASE_PATH=/ pnpm --filter @workspace/antropic-admin run dev
```

- `PORT` y `BASE_PATH` los exige el `vite.config.ts`. Para dev local, `BASE_PATH="/"`.
- Su `VITE_API_URL` sale de `artifacts/antropic-admin/.env` y tiene que apuntar al puerto de la Terminal A.

### Síntomas frecuentes

| Síntoma | Causa | Arreglo |
|---|---|---|
| Storefront en blanco / productos vacíos | API no está arriba, o `VITE_API_URL` no apunta al puerto del API | Arrancá el API primero. Verificá que `VITE_API_URL` = puerto del API |
| Admin: "no se conecta al servidor" | Igual: API caído o `VITE_API_URL` mal en `artifacts/antropic-admin/.env` | Arrancá el API. Revisá el `.env` del admin y reiniciá su server |
| Cambié código del API y no toma | `start` sirve el `dist/` viejo | Ctrl+C, `build` de nuevo, `start` |
| Cambié un `.env` y no toma | Vite lee el `.env` al arrancar | Reiniciá el server de esa app |

---

## 5. Verificación / smoke test

```bash
# API vivo. /healthz solo dice que el proceso responde; /readyz comprueba la base y devuelve
# 503 si no está. El monitor externo va apuntado a /readyz — ver docs/OBSERVABILIDAD.md §3.
curl http://localhost:3000/api/healthz                              # {"status":"ok"}
curl -w " %{http_code}\n" http://localhost:3000/api/readyz          # ...{"database":{"status":"ok"}} 200
curl "http://localhost:3000/api/products?limit=2"                   # items + total:20
curl "http://localhost:3000/api/products?category=denim&limit=100"  # total:2
curl "http://localhost:3000/api/products?occasion=playa&limit=100"  # total:3
curl http://localhost:3000/api/products/jeans-mom-fit               # detalle por slug
curl -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/products/nope  # 404
```

En el navegador: DevTools → Network → filtro `api`. Al cargar Home deben verse 200 a `/api/products`, `/api/categories`, `/api/occasions`.

---

## 5.5. Tareas programadas

Los jobs son procesos aparte, no temporizadores dentro de la API: con más de una instancia
detrás de un balanceador, un `setInterval` en cada una las pondría a competir por el mismo
trabajo. Requieren el build de la API hecho.

```bash
pnpm --filter @workspace/api-server run build

# Caducar pedidos abandonados (72 h por defecto). Sin un scheduler que lo invoque, los pedidos
# que nadie pagó se quedan en `pendiente_pago` para siempre. Ver docs/PAGOS.md §4.
pnpm --filter @workspace/api-server run expire-orders
node ./artifacts/api-server/dist/jobs/expire-orders.mjs 48   # ventana explícita, en horas

# Reintentar los correos que no salieron (cada 5 min). Sin un scheduler, lo que falle una vez
# se queda en la cola. Ver docs/OBSERVABILIDAD.md §4.
pnpm --filter @workspace/api-server run retry-notifications
node ./artifacts/api-server/dist/jobs/retry-notifications.mjs 200   # tamaño de lote explícito
```

Los dos son idempotentes y seguros de interrumpir: `expire-orders` cierra cada pedido en su
propia transacción, y `retry-notifications` reclama las filas con un arriendo, así que una
corrida que muere a mitad las libera en vez de encallarlas.

---

## 6. Calidad (gates)

Cuatro gates, los mismos que corre CI: `typecheck`, `test`, `test:integration` y `build`.

```bash
pnpm run typecheck        # tsc de libs + artifacts + scripts
pnpm run test             # unitarias (dominio puro, sin base de datos)
pnpm run build            # typecheck + build de todos los paquetes

# Integración: Postgres REAL. Truncan tablas — apunta DATABASE_URL a una base desechable
# y aplícale el esquema antes con `migrate`. No hay valor por defecto, a propósito.
DATABASE_URL=postgresql://…/scratch pnpm --filter @workspace/api-server run test:integration

# Por paquete
pnpm --filter @workspace/antropic-store run typecheck
pnpm --filter @workspace/api-server run typecheck

# Build de producción del storefront
MSYS_NO_PATHCONV=1 PORT=5173 BASE_PATH=/ \
  pnpm --filter @workspace/antropic-store run build
```

---

## 7. Cheat sheet

Arranque diario → **sección 4** (no se repite acá para no desincronizarse).

| Necesito… | Comando |
|---|---|
| Instalar | `pnpm install` |
| Push schema | `pnpm --filter @workspace/db run push-force` |
| Seed catálogo | `pnpm --filter @workspace/scripts run seed` |
| Regenerar API client | `pnpm --filter @workspace/api-spec run codegen` |
| Promover primer admin | `UPDATE profiles SET role = 'admin' WHERE email = 'TU_CORREO';` (Supabase SQL Editor) |
| Typecheck todo | `pnpm run typecheck` |
| Build todo | `pnpm run build` |
| Pruebas unitarias | `pnpm run test` |
| Caducar pedidos abandonados | `pnpm --filter @workspace/api-server run expire-orders` |
| Reintentar correos no enviados | `pnpm --filter @workspace/api-server run retry-notifications` |
| ¿Puede servir la API? | `curl -w " %{http_code}\n" http://localhost:3000/api/readyz` |
