# Antes de subir al servidor

Checklist de pendientes previos al despliegue a producción.

## 1. Configuración / variables de entorno

- [ ] **Email del negocio** — completar en el panel de Configuración (número Yape, QR) y setear las env vars de correo:
  - `RESEND_API_KEY` — API key de Resend.
  - `RESEND_FROM` — remitente con dominio verificado (ej. `Antropic <noreply@antropic.pe>`).
  - `ADMIN_NOTIFICATION_EMAIL` — casilla que recibe alertas del backoffice (nueva constancia, nueva devolución).
  - Sin estas variables el envío de email es un no-op logueado (la app no falla, pero **no manda correos**).
- [ ] `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` en el servidor de la API.
- [ ] Buckets de Supabase Storage creados: `public-media` (público) y `payment-proofs` (privado).
- [ ] CORS: whitelist con el dominio real de Vercel (no `*`).

## 2. Autenticación

- [ ] **Arreglar inicio de sesión con Google** — configurar el proveedor Google OAuth en Supabase Auth (client ID/secret) y los redirect URIs del dominio de producción.
- [ ] Verificar que el JWT de Supabase llega al API y el middleware lo valida contra JWKS.
- [ ] Probar los 4 roles (visitante, cliente, empleado, admin) y que la matriz de permisos §6.0 se respeta.

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
