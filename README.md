<p align="center">
  <img src="logo_antropic.png" alt="ANTROPIC" width="180">
</p>

<h1 align="center">Antropic Design Studio</h1>

<p align="center">
  Plataforma de e-commerce de indumentaria: storefront, panel de administración y API,
  en un monorepo TypeScript con contrato OpenAPI como fuente de verdad.
</p>

---

## Contenido

- [Qué es](#qué-es)
- [Stack](#stack)
- [Estructura del monorepo](#estructura-del-monorepo)
- [Contrato spec-first](#contrato-spec-first)
- [Puesta en marcha](#puesta-en-marcha)
- [Variables de entorno](#variables-de-entorno)
- [Scripts](#scripts)
- [Documentación](#documentación)
- [Estado del proyecto](#estado-del-proyecto)
- [Licencia](#licencia)

## Qué es

Tres aplicaciones desplegables sobre una misma base de datos y un mismo contrato de API:

| Aplicación | Qué hace | Puerto (dev) |
| --- | --- | --- |
| **Storefront** | Catálogo público, carrito, favoritos, checkout, seguimiento de pedidos | `5173` |
| **Admin** | Gestión de catálogo, pedidos, envíos, devoluciones, usuarios y contenido | `5174` |
| **API** | REST bajo `/api`, validación por Zod generado, auth por JWT de Supabase | `3000` |

La autenticación es por Supabase (magic link y Google OAuth). El rol de cada persona sale de
`profiles.role`, con `customer` por defecto; sólo un administrador puede promover a otro.

## Stack

**Runtime** — Node 24 · pnpm 11 (workspaces) · TypeScript 5.9

**Frontend** — React · Vite · Tailwind CSS · shadcn/ui · wouter · TanStack Query

**Backend** — Express 5 · Drizzle ORM · PostgreSQL (Supabase) · pino

**Contrato** — OpenAPI 3 · Orval (genera Zod + hooks de React Query)

**Servicios** — Supabase (base de datos, auth, storage) · Resend (correo transaccional)

## Estructura del monorepo

Dos raíces de paquetes con ciclos de vida distintos: `artifacts/` son aplicaciones desplegables,
`lib/` son librerías internas que las aplicaciones consumen vía `workspace:*`.

```
.
├── artifacts/                 # aplicaciones desplegables
│   ├── antropic-store/        # storefront (Vite + React)
│   ├── antropic-admin/        # panel de administración (Vite + React)
│   ├── api-server/            # API Express 5
│   └── mockup-sandbox/        # laboratorio de mockups (no se despliega)
├── lib/                       # librerías internas
│   ├── api-spec/              # openapi.yaml + configuración de Orval
│   ├── api-zod/               # esquemas Zod generados
│   ├── api-client-react/      # hooks de React Query generados
│   └── db/                    # esquema Drizzle + pool de Postgres
├── scripts/                   # scripts puntuales (seed, backfills)
├── docs/                      # runbook operativo y documentación de negocio
└── .github/workflows/         # integración continua
```

El API se organiza por módulos, uno por dominio: `catalog`, `cart`, `wishlist`, `checkout`,
`orders`, `payments`, `returns`, `config` y `admin`, más `health` y `me`. Cada módulo expone su
propio router y `src/routes/index.ts` los compone.

Las versiones de las dependencias compartidas están fijadas una sola vez en el `catalog:` de
`pnpm-workspace.yaml`; los paquetes las referencian como `"catalog:"` en lugar de repetir el número.

## Contrato spec-first

`lib/api-spec/openapi.yaml` es la fuente de verdad. Un solo comando regenera cliente y validación:

```
openapi.yaml  ──[ orval ]──┬──▶  lib/api-zod/src/generated/          (Zod + tipos, los usa el API)
                           └──▶  lib/api-client-react/src/generated/ (hooks, los usa el front)
```

```bash
pnpm --filter @workspace/api-spec run codegen
```

> **Nunca edites a mano lo que esté bajo `generated/`.** Modificá `openapi.yaml` y volvé a correr
> el codegen. La única excepción es `custom-fetch.ts`, que está escrito a mano: es el mutator de
> Orval y resuelve la URL base, el bearer token y el parseo de errores.

## Puesta en marcha

```bash
git clone https://github.com/Jfra-13/Antropic-eCommerce.git
cd Antropic-eCommerce
pnpm install

cp .env.example .env                                        # completar con credenciales reales
cp artifacts/antropic-admin/.env.example artifacts/antropic-admin/.env
cp artifacts/antropic-store/.env.example artifacts/antropic-store/.env

pnpm --filter @workspace/db run push-force                   # aplicar el esquema
pnpm --filter @workspace/scripts run seed                    # catálogo de ejemplo
```

Para levantar las tres aplicaciones, seguí [`docs/COMANDOS.md`](docs/COMANDOS.md) §4. La regla que
no se puede saltear: **el API arranca siempre primero**, porque el storefront y el admin le pegan
por HTTP y sin él muestran pantallas vacías.

## Variables de entorno

Ninguna tiene valor por defecto: las aplicaciones fallan al arrancar si falta alguna. Los archivos
`.env` están fuera del control de versiones; usá los `.env.example` como plantilla.

| Archivo | Lo consume | Contiene |
| --- | --- | --- |
| `.env` (raíz) | API | conexión a la base, claves de servicio de Supabase, Resend |
| `artifacts/antropic-admin/.env` | Vite (navegador) | URL del proyecto Supabase, clave anónima, URL del API |
| `artifacts/antropic-store/.env` | Vite (navegador) | URL del proyecto Supabase, clave anónima, URL del API |

> **Por qué hay dos claves de Supabase.** El navegador es público, así que el frontend usa la clave
> `anon`, de permisos limitados. El backend usa `service_role`, que tiene privilegios de
> administrador y **nunca** debe salir del servidor ni terminar en un bundle de Vite.

`PORT` y `BASE_PATH` se pasan por línea de comandos, no van en los archivos `.env`.

## Scripts

Desde la raíz del repositorio:

| Comando | Qué hace |
| --- | --- |
| `pnpm install` | Instala dependencias del workspace |
| `pnpm run typecheck` | Verifica tipos de librerías, aplicaciones y scripts |
| `pnpm run build` | Typecheck y build de todos los paquetes |
| `pnpm --filter @workspace/api-spec run codegen` | Regenera el cliente y los esquemas desde OpenAPI |
| `pnpm --filter @workspace/db run push-force` | Aplica el esquema Drizzle a la base |
| `pnpm --filter @workspace/scripts run seed` | Carga el catálogo de ejemplo (idempotente) |

El detalle de cada comando de arranque, con sus variantes de PowerShell y Git Bash, está en
[`docs/COMANDOS.md`](docs/COMANDOS.md).

## Documentación

| Documento | Para qué |
| --- | --- |
| [`docs/COMANDOS.md`](docs/COMANDOS.md) | Runbook operativo: setup, base de datos, arranque diario, smoke test y síntomas frecuentes |
| [`docs/TUNELES.md`](docs/TUNELES.md) | Exponer la app por Cloudflare Tunnel para una demo con cliente |
| [`docs/negocio/`](docs/negocio/) | Requerimientos, esquema físico de la base, flujos por rol y guía de estilos |
| [`CLAUDE.md`](CLAUDE.md) | Contexto del repositorio para asistentes de código |

## Estado del proyecto

En desarrollo activo. Lo que conviene saber antes de tocar el código:

- **No hay test runner configurado.** Los únicos gates de calidad son `typecheck` y `build`, y son
  los que corre la integración continua.
- **El esquema se aplica con `push`, no con migraciones versionadas.** No hay archivos de migración
  en el repositorio; la fuente de verdad del esquema es `lib/db/src/schema/`.
- **Los colores de marca viven en dos lugares** que hay que actualizar juntos: los tokens HSL de
  `src/index.css` y los valores hexadecimales embebidos en clases de Tailwind repartidos por
  páginas y componentes. Cambiar sólo el CSS deja la interfaz inconsistente.
- **`pnpm-workspace.yaml` exige que un paquete de npm tenga al menos un día de publicado**
  (`minimumReleaseAge: 1440`). Es una defensa contra ataques a la cadena de suministro: no bajes
  ese valor sin una razón fuerte.

## Licencia

[MIT](LICENSE)
