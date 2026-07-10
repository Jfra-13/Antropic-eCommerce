# Plan ronda 3 — verificado contra el código, no contra suposiciones

> Estado: **Fases 0–5 completadas** (2026-07-10). Queda la verificación E2E manual en runtime — checklist en `PRE-DEPLOY.md` §3.
> Regla de ejecución: cada fase cierra con `pnpm run typecheck` verde (5/5), build verde y su propio commit convencional. No se avanza de fase con el árbol sucio.

---

## Principio rector: la base de datos es la única fuente de verdad

La arquitectura ya funciona así y esta ronda la completa:

- Toda escritura (admin, cliente, empleado) pasa por la API (`api-server`) → Postgres. No hay estado paralelo.
- Store y admin leen la misma base a través de los hooks generados desde `lib/api-spec/openapi.yaml` (spec-first: primero el contrato, después `codegen`, nunca editar `generated/` a mano).
- Los problemas reportados eran restos **hardcodeados en el frontend** (mapa de cupones — ya eliminado —, diccionario de colores, textos del hero, ranking de búsqueda). Esta ronda elimina los restantes.
- Al cierre, lo único no administrado por la base será el ranking "top clicked" del buscador (stand-in deliberado, ver Diferidos).

## Hallazgos verificados que definen el alcance

Lo que **ya existe** y no hay que construir:

| Capacidad | Evidencia |
| --- | --- |
| Editar producto (nombre, precio, categoría, descripción, fit, badge, destacado, ocasiones) | `PATCH /admin/products/:id` — `openapi.yaml` (UpdateProductInput), `catalog/queries.ts` (`updateProductTx`) |
| Emails por estado del pedido (pago confirmado, en preparación, enviado, entregado, recojo) | `payments/service.ts:96`, `orders/service.ts:224`, `notifications/service.ts:11-18` |
| Crear ticket de devolución (backend) | `POST /returns` — `returns/service.ts:58`, notifica al backoffice |
| Columnas de perfil (nombre, teléfono, dirección) | `lib/db/src/schema/profiles.ts:13-16` — sin uso todavía |
| Notificación de reposición de stock (lado de envío) | `notifyStockAvailable` — tabla, detección de reposición y email funcionan |
| Filtro de productos activos en catálogo público | `catalog/queries.ts:48,102` — el catálogo NO muestra productos desactivados |

Causas raíz confirmadas de los síntomas reportados:

1. **"Producto desactivado se sigue viendo"**: no es el producto, es la **categoría huérfana**. `GET /categories` lista categorías aunque no tengan productos activos; el tile del buscador toma la imagen del primer producto (sin productos → tile sin imagen, `SearchOverlay.tsx:19-24`) y `CategoryPills` muestra el botón en todas las vistas.
2. **Círculo de color plomo**: el front mapea nombre→hex en un diccionario local de 7 colores con fallback gris (`store/src/lib/product.ts:10-22`). Cualquier color nuevo ("Rojo") cae al gris.
3. **Constancia se envía sin confirmación**: el upload dispara al seleccionar el archivo (`OrderDetail.tsx:152-196`).
4. **Sin vista de devoluciones**: falta la UI y falta un `GET` para que el cliente vea sus tickets; además hoy cualquier orden propia (incluso sin pagar) puede abrir ticket.
5. **Datos de perfil invisibles para el admin**: las colas de pagos y envíos solo exponen `customerEmail` en el contrato; nombre y teléfono solo existen en el DTO de devoluciones.

## Decisiones acordadas (defaults)

- **Devoluciones**: solo pedidos en estado `entregado` o `recogido`. Sin foto en v1 (la conversación sigue por WhatsApp). Sin ventana de días en v1 — definir con negocio más adelante.
- **Eliminar producto**: si tiene ventas (`order_items`) → `409 REFERENCED`, se desactiva en su lugar (el historial de órdenes y reportes no se rompe). Si nunca se vendió → borrado real en transacción. Así no se acumulan filas de productos sin historia.
- **Color de variante**: columna `color_hex` en la base; el admin la define con `<input type="color">` nativo (picker visual + hex, sin librerías). El nombre textual se mantiene para mostrar.
- **Perfil obligatorio para comprar**: el server exige nombre + teléfono al crear la orden (`PROFILE_INCOMPLETE`). El front guía, el server manda.
- **Textos configurables**: hero (título, subtítulo) + texto de franja promocional. NO se construye un CMS genérico de textos; la estructura KV de `settings` permite agregar claves después sin rediseñar.
- **"Avísame cuando haya stock"**: se cierra en esta ronda (solo falta el endpoint de suscripción).
- **Ranking "top clicked"**: diferido hasta tener tráfico real que medir.

---

## Fase 0 — Proteger el trabajo pendiente ✅ COMPLETADA

Todo el trabajo de la ronda anterior quedó commiteado en `main`, typecheck 5/5 verde:

| Commit | Contenido |
| --- | --- |
| `78588a6` | feat(api-spec): `/me` + `freeShippingThreshold` en el contrato + codegen |
| `c5886b6` | feat(api-server): umbral de envío gratis + timeouts a Supabase/Resend |
| `372c89e` | feat(store): flujo de compra completo (carrito por variante, checkout, detalle de orden, auth sin contraseña) |
| `0c8d359` | feat(admin): campo de envío gratis en Configuración |
| `206ade4` | docs: PRE-DEPLOY + capturas de Resend |

---

## Fase 1 — Contrato + base de datos (un solo codegen)

Todo cambio de contrato de la ronda entra junto, se corre `codegen` UNA vez y se verifica typecheck.

**`lib/api-spec/openapi.yaml`:**

1. `PATCH /me` — `UpdateMeInput { fullName?, phone?, shippingAddress? }`; extender `MeUser` con esos tres campos (email inmutable, no entra al input).
2. `GET /returns` — tickets propios del autenticado, filtro opcional `?orderId=`. Respuesta: lista de `ReturnTicket`.
3. `POST /returns` — documentar regla de elegibilidad: `422 NOT_ELIGIBLE` si la orden no está `entregado`/`recogido`; `409 ALREADY_OPEN` si ya existe ticket abierto para la orden.
4. `DELETE /admin/products/{id}` — `204` si se borró; `409 REFERENCED` si tiene ventas (mensaje: desactivar en su lugar). Solo admin.
5. `Variant.colorHex` (nullable) + `colorHex` en `CreateVariantInput` y `UpdateVariantInput` (patrón `^#[0-9a-fA-F]{6}$`).
6. Config: `hero { title, subtitle }` y `promoText` en `AdminConfig`, `PublicConfig` y `UpdateConfigInput`.
7. Colas admin: `customerName` y `customerPhone` (nullable) en los ítems de `/admin/payments/queue` y `/admin/shipments`.
8. `POST /stock-alerts` — `{ variantId, email? }`; autenticado usa el email del perfil, invitado debe enviar email. `201`; idempotente (la tabla ya tiene unique `variant+email`).
9. `GET /categories?includeEmpty=true` — sin el flag, solo categorías con ≥1 producto activo (nuevo default público); con el flag, todas (lo usa el admin).

**`lib/db`:**

- `product_variants.color_hex` — `text`, nullable. Aplicar con `pnpm --filter @workspace/db run push`.

**Cierre**: `pnpm --filter @workspace/api-spec run codegen` → typecheck → commit `feat(api-spec): round-3 contract (profile, returns, product delete, colorHex, hero config, stock alerts)`.

## Fase 2 — api-server

1. **`routes/me.ts`**: `PATCH /me` → actualiza `profiles.fullName/phone/shippingAddress` del autenticado; responde el perfil actualizado validado contra el schema generado.
2. **`orders/service.ts`**: al crear orden, validar perfil completo (nombre + teléfono) → `422 PROFILE_INCOMPLETE`.
3. **`returns/`**: elegibilidad en `createReturn` (orden `entregado`/`recogido`, sin ticket abierto previo) + `getMyReturns(userId, orderId?)` + ruta `GET /returns`.
4. **`catalog/`**:
   - `deleteProduct(id)`: si alguna variante está en `order_items` → `409 REFERENCED`. Si no, transacción que borra `product_occasions`, `product_media`, `stock_alerts`, `cart_items`, `wishlists`, `product_variants` y el producto; borrado best-effort de los objetos de Storage (fallo de Storage no revierte la transacción, se loguea).
   - `selectCategories(includeEmpty)`: `EXISTS (SELECT 1 FROM products WHERE category_id = c.id AND active)` cuando `includeEmpty=false`.
   - `colorHex` en create/update de variantes y en los mappers público y admin.
5. **`config/service.ts`**: claves KV `hero` y `promo_text`; mapeo a `PublicConfig`/`AdminConfig`; merge parcial en `updateConfig` (mismo patrón que Yape).
6. **`stock-alerts`**: `POST /stock-alerts` con `onConflictDoNothing` (unique variant+email); variante debe existir y tener stock 0 (si tiene stock, `409 IN_STOCK`).
7. **Colas admin**: joins a `profiles` para `customerName`/`customerPhone` en pagos y envíos (el join por `userId` ya existe en las queries).
8. **Backfill de colores**: script one-off en `scripts/` que setea `color_hex` para los 7 colores del seed (Rosa `#F29CBD`, Coral `#EF7853`, Dorado `#FCC261`, Fucsia `#EA4C75`, Blanco `#FFFFFF`, Negro `#2b2b2b`, Denim `#4a6fa5`).

**Cierre**: typecheck + build → commit `feat(api-server): round-3 endpoints (profile update, returns eligibility+list, product delete, categories filter, hero config, stock alerts)`.

## Fase 3 — Admin (antropic-admin)

1. **Inventario — editar producto**: botón "Editar" por fila → modal con nombre, precio, categoría (select), descripción, fit, badge, destacado y ocasiones → `useUpdateProduct` (hook ya existente; hoy solo se usa para el checkbox activo, `Inventory.tsx:131,148-157`).
2. **Inventario — variantes**: panel ampliado: talla, color (texto) + **color visual** (`<input type="color">` → `colorHex`), SKU, precio override, stock, activo.
3. **Inventario — eliminar**: botón con confirmación; ante `409 REFERENCED`, ofrecer desactivar en el mismo diálogo.
4. **Inventario — categorías**: el select de crear/editar producto consume `GET /categories?includeEmpty=true`.
5. **Configuración — secciones**: reorganizar en 4 bloques: **Pagos** (número Yape, QR) · **Envío** (tarifa, envío gratis desde) · **Banners** · **Textos** (hero título, hero subtítulo, franja promo).
6. **Pagos y Envíos**: mostrar `customerName` y `customerPhone` junto al email en cada fila.

**Cierre**: typecheck + build → commit `feat(admin): product edit/delete, variant colors, config sections, customer contact in queues`.

## Fase 4 — Store (antropic-store)

1. **Perfil editable** (`Profile.tsx`): tarjeta con nombre, teléfono y dirección — inputs grises bloqueados, lápiz activa la edición, guardar (`PATCH /me`) vuelve a bloquear. Email fijo, sin lápiz.
2. **Checkout** (`Checkout.tsx`): prefill de dirección y teléfono desde el perfil; si falta nombre/teléfono, inputs inline en el propio checkout (no expulsar al perfil); checkbox "Guardar para próximas compras" (marcado por defecto) → `PATCH /me`; manejar `PROFILE_INCOMPLETE` con mensaje claro.
3. **Constancia con vista previa** (`OrderDetail.tsx`): seleccionar archivo → preview local (`URL.createObjectURL`) + "Confirmar y enviar" / "Elegir otra" → recién ahí sube. Liberar el object URL al desmontar.
4. **Devoluciones** (`OrderDetail.tsx`): con pedido `entregado`/`recogido` → botón "Solicitar cambio o devolución" → formulario (motivo, talla actual, talla deseada) → `POST /returns` → tarjeta con número y estado del ticket (`GET /returns?orderId=`); si ya hay ticket, mostrar estado y no permitir duplicado.
5. **Hero desde config** (`Home.tsx`): título/subtítulo/franja desde `PublicConfig` con fallback a los textos actuales.
6. **Color real** (`lib/product.ts`): usar `colorHex` del DTO; fallback al diccionario local solo si viene null.
7. **"Avísame cuando haya stock"** (`ProductDetail.tsx`): conectar el botón a `POST /stock-alerts` (email del perfil si hay sesión; input de email si es invitado). Eliminar el estado fake `setNotified(true)`.
8. **Buscador**: defensivo — no renderizar tiles de categoría sin imagen (el server ya filtra categorías vacías tras Fase 2).

**Cierre**: typecheck + build → commit `feat(store): editable profile, checkout prefill, proof preview, returns flow, config hero, real swatches, stock alerts`.

## Fase 5 — Plantillas de email + verificación E2E en runtime

1. **Plantillas HTML** (`notifications/service.ts`): layout de marca (logo/nombre, colores), resumen del pedido (ítems, total, código de referencia), link al detalle (`/orders/:id`), para: pago confirmado + cada estado de fulfillment. La lógica de disparo NO se toca — ya funciona.
2. **Checklist E2E manual** (requiere api-server + store + admin corriendo y Resend configurado):
   - [ ] Login (Google y magic link) → agregar producto → checkout → orden creada
   - [ ] Subir constancia con vista previa → email al backoffice
   - [ ] Aprobar pago en admin → email "pago confirmado" → estados enviado/entregado → emails por estado
   - [ ] Crear cupón con fechas en admin → aplicarlo en checkout
   - [ ] Subir QR de Yape en Configuración (verificar que el timeout resolvió el cuelgue)
   - [ ] Desactivar el único producto de una categoría → la categoría desaparece del store y del buscador
   - [ ] Editar precio/categoría de un producto → se refleja en el store
   - [ ] Eliminar producto sin ventas → desaparece; con ventas → 409 y desactivar
   - [ ] Completar perfil (nombre/teléfono/dirección) → visible en colas de pagos y envíos del admin
   - [ ] Pedido entregado → solicitar devolución → ticket visible en admin y en el pedido
   - [ ] Producto sin stock → suscribirse a "avísame" → reponer stock en admin → email de reposición
3. **Cierre de ronda**: commit `feat(emails): branded transactional templates` + actualizar `PRE-DEPLOY.md`.

---

## Fuera de alcance de esta ronda (deliberado)

- **Ranking real de "top clicked"** en el buscador: requiere tabla de eventos + tracking; sin tráfico aún no hay qué medir. El stand-in determinista queda (`SearchOverlay.tsx`).
- **Foto en devoluciones** y **ventana de días de elegibilidad**: decisión de negocio pendiente; el flujo sigue por WhatsApp.
- **Migraciones Drizzle versionadas** (hoy `push`): sigue en `PRE-DEPLOY.md`, requisito antes de producción.
- **`pnpm run build` en la raíz falla por mockup-sandbox** (exige `PORT`): preexistente, no es de esta ronda.
- **CMS genérico de textos**: solo hero + franja promo; más claves cuando el negocio las pida.
