# Antes de subir al servidor

Checklist de pendientes previos al despliegue a producción.

## 1. Configuración / variables de entorno

> **Valores sensibles (keys, password, connection string) → `.local/PRE-DEPLOY.secrets.md` (gitignored).** Nunca escribir secretos en este archivo: está versionado en git.

- [x] **Email del negocio (Resend)** — dominio `send.antropic.page` verificado (DKIM+SPF+DMARC en verde).
  - `RESEND_API_KEY` — ✅ obtenido → ver `.local/PRE-DEPLOY.secrets.md` (rotar antes de prod).
  - `RESEND_FROM` = `Antropic <noreply@send.antropic.page>` ✅
  - `ADMIN_NOTIFICATION_EMAIL` = `mariacasasc16@gmail.com` ✅
  - Pendiente negocio: número Yape + QR se cargan en el panel de Configuración (no es env var).
  - Sin estas variables el envío de email es un no-op logueado (la app no falla, pero **no manda correos**).
- [x] `SUPABASE_URL` = `https://jmshmsnuicqzurndqvtm.supabase.co` (proyecto `antropic-ecommerce`) ✅
  - `SUPABASE_SERVICE_ROLE_KEY` — ✅ obtenido → `.local/PRE-DEPLOY.secrets.md` (solo server, rotar antes de prod).
  - `DATABASE_URL` — ✅ obtenido (Session pooler, puerto 5432) → `.local/PRE-DEPLOY.secrets.md`.
- [x] Buckets de Supabase Storage creados: `public-media` (público) ✅ y `payment-proofs` (privado) ✅.
- [ ] **Env vars del storefront (Vercel)** — el front las lee en build (`lib/supabase.ts`, `main.tsx`):
  - `VITE_SUPABASE_URL` = mismo `SUPABASE_URL`.
  - `VITE_SUPABASE_ANON_KEY` — ⬜ **falta juntar** la **anon** key (Supabase → Settings → API Keys → `anon public`). NO es la service_role.
  - `VITE_API_URL` = URL pública del api-server (DigitalOcean) — se sabe post-deploy.
- [ ] CORS: whitelist con el dominio real de Vercel (no `*`). — post-deploy (falta dominio Vercel).

## 2. Autenticación

- [x] **Google OAuth configurado en Supabase** — proveedor Google activado con Client ID/Secret (proyecto Google Cloud `antropic`), callback `…supabase.co/auth/v1/callback`. Credenciales en `.local/PRE-DEPLOY.secrets.md`.
  - Pendiente prod: agregar dominio Vercel a Supabase → URL Configuration (Site URL + Redirect URLs) y **publicar** la app en Google OAuth consent (hoy solo entran test users).
- [ ] **SMTP propio para emails de Auth (Magic Link)** — los envía Supabase Auth, no nuestro Resend. Free tier limita ~3-4/hora y cae en spam. Configurar SMTP custom en Supabase → Auth → SMTP (usar credenciales SMTP de Resend). Bloqueante para que el Magic Link sea usable en prod.
- [x] JWT Keys en Supabase migradas a **asimétrico (ECC P-256)** — requisito de `auth.ts` (JWKS). Legacy HS256 quedó como previous key.
- [x] Schema (22 tablas) verificado en la DB de Supabase (`drizzle-kit push` → "No changes detected", 2026-07-09).
- [x] Bearer JWT → API verificado por código: `main.tsx` registra `setAuthTokenGetter` con `supabase.auth.getSession().access_token`.
- [ ] **Login del front desalineado (EN CURSO)** — hoy usa email+password (`signInWithPassword`/`signUp` en `StoreContext.tsx`). Lo decidido es **Google OAuth + Magic Link, sin contraseñas** (§1 requerimientos). Migrar `login`/`register` a `signInWithOAuth({provider:'google'})` + `signInWithOtp({email})` y ajustar la UI de login.
- [ ] Verificar en runtime que el JWT llega al API y valida contra JWKS. — código listo; falta correr el stack y hacer login real.
- [ ] Probar los 4 roles: **3 en DB** (`customer`/`employee`/`admin`, enum `role`) + visitante = sin sesión. Para probar admin/employee hay que promover un `profiles.role` a mano (nacen como `customer`). Validar matriz §6.0.

## 3. Validación funcional del flujo completo

- [ ] Catálogo: filtros, ficha de producto, media (fotos + video).
- [ ] Carrito + wishlist: persistencia y merge invitado → logueado.
- [ ] Checkout: cotización, cupón, orden, subir constancia Yape.
- [ ] Backoffice: verificar pago (aprobar/rechazar + stock), envíos, inventario, media de productos, CSV, cupones, devoluciones, usuarios, config, dashboard, reportes.
- [ ] Notificaciones: confirmar que llegan los emails (pago aprobado, cambio de estado, stock disponible, alertas admin).

## 4. Diferido (documentado, no bloquea el core pero falta)

- [ ] **Recordatorios automáticos de carrito abandonado** — requieren un scheduler (cron externo o n8n). Hoy la data se ve en dashboard/reportes, pero el envío automático no existe.
- [ ] **Analítica web / tráfico** — la "conversión" actual es un proxy carrito→compra, no sobre visitas. Falta integrar analítica (Plausible/GA) para tráfico real.
- [ ] **Migraciones versionadas** — hoy es `drizzle-kit push`. Antes de producción con datos reales → `drizzle-kit generate`.
- [ ] **Libro de Reclamaciones + páginas legales** (obligatorio Indecopi Perú).
- [ ] SEO, imágenes WebP/lazy-load, reseñas con foto.

## 5. Gates actuales

- `pnpm run typecheck` y `pnpm run build` en verde son los únicos gates automáticos.
- **No hay test runner configurado** (`msw` está presente pero sin scripts de test).

---

### ¿Playwright puede validar los módulos en UI/UX?

**Parcialmente.** Playwright valida el **flujo funcional** end-to-end: navega, hace click, llena formularios y verifica que la UI responde (que un módulo "funciona"). Sirve para regresión y humo.

**No** juzga UX/estética (jerarquía visual, si algo "se siente bien"): eso es criterio humano.

Requiere trabajo previo: instalar Playwright, levantar API + front con datos de prueba, y escribir los specs (hoy no hay ninguno). No es gratis, pero es la mejor red para el punto 3.
