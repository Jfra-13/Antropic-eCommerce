# Plan ronda 4 — verificado contra el código, no contra suposiciones

> Estado: **ejecutado (fases 1-5)**. La **Fase 0 (diagnóstico de emails) quedó diferida** por decisión del 2026-07-10: correrla antes de los ítems de email del checklist E2E de `PRE-DEPLOY.md`.
> Regla de ejecución (igual que ronda 3): cada fase cierra con `pnpm run typecheck` verde, build verde y su propio commit convencional. No se avanza de fase con el árbol sucio.

---

## Hallazgos verificados (qué es bug, qué falta, qué ya existe)

1. **Hero "Nueva colección" / "Verano 2025" YA es editable.** Los strings en `Home.tsx:24-26` son solo *fallback*; el valor real sale de `config.hero.title/subtitle`, editable hoy en Admin → Configuración → Textos. No hay nada que construir aquí.
2. **"Editorial" / "Estilo que habla por ti" están hardcodeados** (`Home.tsx:83-84`), igual que la imagen de esa sección (`modelo_02`, `Home.tsx:79`). Sí hay que hacerlos configurables.
3. **Categorías y ocasiones: solo lectura.** Las tablas ya tienen todo lo necesario (`name`, `slug`, `active`, `sortOrder` en `categories.ts` y `occasions.ts`), pero el contrato solo expone `GET /categories` y `GET /occasions`. No existe ningún endpoint ni UI de admin para crear/editar/eliminar. Por eso "salen como predeterminados": son las filas del seed.
4. **Sidebar del admin: fija, sin colapso, sin responsive.** `Layout.tsx:40` — `w-60` siempre, sin estado de colapso, sin breakpoints, sin menú móvil.
5. **Email "en verificación" al cliente: nunca existió.** `attachProof` (`payments/service.ts:58`) solo notifica al backoffice. No es que falló el envío — la función no está escrita.
6. **Emails de enviado/entregado: el código es correcto** (`orders/service.ts:234` dispara `notifyOrderStatusChanged` en cada transición válida). Si no llegaron, la causa está en el entorno: `sendEmail` (`lib/notify.ts:16-18`) hace *skip silencioso* si faltan `RESEND_API_KEY` o `RESEND_FROM`, y Resend en modo sandbox solo entrega al email del dueño de la cuenta. Todo error se loguea con `logger.warn` y jamás se lanza — hay que mirar logs, no código.
7. **"Estamos preparando tu pedido" no cambia por diseño defectuoso del bloque:** `OrderDetail.tsx:81-90` muestra ese texto siempre que `paymentStatus === "pagado"`, ignorando `fulfillmentStatus`. Enviado o entregado, el texto es el mismo.
8. **Configuración del admin: una sola página de 441 líneas** (`Config.tsx`) con 4 secciones apiladas + puntos de recojo. Funciona, pero ya no escala.

## Decisiones (defaults propuestos)

- **CRUD de categorías/ocasiones vive en Inventario**, no en Configuración: son datos de catálogo, no ajustes de tienda. Configuración queda para pagos/envío/contenido.
- **Eliminar categoría/ocasión con productos asociados → `409 REFERENCED`**, se ofrece desactivar en su lugar (mismo patrón ya establecido para productos). Sin productos → borrado real.
- **Configuración con tabs**: Pagos · Envío · Contenido (banners + textos hero/promo + editorial) · Puntos de recojo. Tabs con estado local, sin router ni librerías.
- **Sidebar**: colapso a solo-íconos (`w-16`) con flecha de pin; preferencia persistida en `localStorage`; en pantallas `< md` arranca colapsada. Sin librerías nuevas.
- **Editorial**: clave KV `editorial { tag, title, imagePath }` en `settings` (mismo patrón que `hero`; el jsonb no requiere migración). NO se construye CMS genérico.
- **Nuevo email al cliente**: "Recibimos tu constancia — en verificación" disparado desde `attachProof`, con la misma plantilla de marca de ronda 3.

---

## Fase 0 — Diagnóstico de emails (antes de escribir una línea)

Los emails de estado ya existen; primero se confirma por qué no llegan.

1. Verificar en el entorno del api-server: `RESEND_API_KEY`, `RESEND_FROM`, `ADMIN_NOTIFICATION_EMAIL`.
2. Revisar logs pino del api-server: buscar `"email skipped (RESEND not configured)"` y `"email send threw"`.
3. Dashboard de Resend: ¿dominio verificado? En sandbox solo entrega al email del dueño de la cuenta.
4. Prueba controlada: aprobar un pago → observar log + bandeja.

**Salida**: causa raíz documentada en este archivo. Si es entorno/dominio, se resuelve sin tocar código y la Fase 2.3 solo agrega el email faltante de "en verificación".

## Fase 1 — Contrato (un solo codegen)

**`lib/api-spec/openapi.yaml`:**

1. `POST /admin/categories` · `PATCH /admin/categories/{id}` · `DELETE /admin/categories/{id}` (`204`; `409 REFERENCED` si tiene productos). Input: `{ name, slug?, active?, sortOrder? }`.
2. Mismo trío para `/admin/occasions` (`409 REFERENCED` si está en `product_occasions`).
3. `AdminConfig`, `PublicConfig`, `UpdateConfigInput`: bloque `editorial { tag, title, imagePath/imageUrl }` (nullable, mismo trato que `hero`).

**`lib/db`:** sin cambios — tablas y KV ya soportan todo.

**Cierre**: `codegen` → typecheck → commit `feat(api-spec): round-4 contract (category/occasion CRUD, editorial config)`.

## Fase 2 — api-server

1. **catalog**: `createCategory` / `updateCategory` / `deleteCategory` (guard: `EXISTS products WHERE category_id`) y equivalentes de occasion (guard: `EXISTS product_occasions`). Slug autogenerado desde el nombre si no viene.
2. **config/service.ts**: clave KV `editorial` (mismo merge parcial que `hero`); upload de imagen editorial reutilizando el patrón del QR/banners.
3. **payments/service.ts** `attachProof`: agregar `void notifications.notifyProofReceived(order)` al cliente.
4. **notifications/service.ts**: `notifyProofReceived` — plantilla de marca, asunto "Recibimos tu constancia", cuerpo "tu pago está en verificación".

**Cierre**: typecheck + build → commit `feat(api-server): category/occasion CRUD, editorial config, proof-received email`.

## Fase 3 — Admin

1. **Inventario — pestaña "Categorías y ocasiones"**: dos listas con crear (nombre), renombrar inline, activar/desactivar, `sortOrder` numérico y eliminar con confirmación; ante `409 REFERENCED`, ofrecer desactivar en el mismo diálogo.
2. **Config.tsx — tabs**: Pagos · Envío · Contenido · Puntos de recojo. "Contenido" agrupa banners, textos (hero título/subtítulo, franja promo) y el nuevo bloque editorial (tag, título, imagen).
3. **Layout.tsx — sidebar colapsable**: estado `pinned` en `localStorage`; colapsada = `w-16` solo íconos (con `title` como tooltip); flecha SVG que rota según estado y desaparece el "cuerpo" al desanclar; `< md` colapsada por defecto. El `main` ya es `flex-1`, fluye solo.

**Cierre**: typecheck + build → commit `feat(admin): category/occasion management, tabbed config, collapsible sidebar`.

## Fase 4 — Store

1. **OrderDetail.tsx**: el bloque post-pago mapea `fulfillmentStatus` → mensaje: `en_preparacion` "Estamos preparando tu pedido" · `enviado` "Tu pedido está en camino" · `entregado` "¡Gracias por tu compra!" · `recojo_pendiente` "Listo para recoger" · `recogido` "¡Gracias por tu compra!". Los labels de `lib/orders.ts` ya existen para los títulos.
2. **Home.tsx**: sección editorial (tag, título, imagen) desde `PublicConfig` con fallback a los valores actuales — mismo patrón que el hero.

**Cierre**: typecheck + build → commit `feat(store): status-aware order messaging, configurable editorial section`.

## Fase 5 — Verificación E2E manual

- [ ] Crear categoría en admin → aparece en el select de producto; al asignarle producto activo aparece en el store
- [ ] Renombrar / desactivar / eliminar categoría (con productos → 409 y desactivar; sin productos → borrado)
- [ ] Ídem ocasiones
- [ ] Subir constancia → email al cliente "en verificación" + email al backoffice
- [ ] Aprobar pago → email; marcar enviado → email; entregado → email; el texto de OrderDetail cambia en cada estado
- [ ] Editar editorial (tag/título/imagen) en Config → Home lo refleja
- [ ] Editar hero en Config → Home lo refleja (ya existía; confirmar)
- [ ] Sidebar: anclar/desanclar persiste tras recargar; en móvil arranca colapsada; admin usable en tablet y celular

**Cierre de ronda**: commit `docs: round-4 plan executed` + actualizar `PRE-DEPLOY.md`.

---

## Fuera de alcance (deliberado)

- Reordenar categorías con drag & drop — input numérico `sortOrder` basta en v1.
- CMS genérico de textos/secciones — solo editorial; más claves cuando el negocio las pida.
- Se mantienen los diferidos de ronda 3 (ranking real del buscador, migraciones versionadas, foto en devoluciones).
