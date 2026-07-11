# Plan ronda 5 — contenido de tienda configurable + backoffice operable a escala

> Estado: **pendiente de ejecución**.
> Regla de ejecución (igual que rondas 3/4): cada fase cierra con `pnpm run typecheck` verde, build verde y su propio commit convencional. No se avanza de fase con el árbol sucio.

---

## Hallazgos verificados (qué es bug, qué falta, qué ya existe)

1. **Footer: todos los links de "Ayuda" están muertos** (`Footer.tsx:14-22`, `href="#"`), el WhatsApp está hardcodeado (`51999999999`, `Footer.tsx:27`) e Instagram/TikTok apuntan a `#`. No existe página de devoluciones, FAQ ni ubicaciones.
2. **El flujo de devoluciones YA existe completo**: `OrderDetail.tsx:321` (`ReturnSection`) crea tickets cuando el pedido está entregado/recogido, y el admin los gestiona en `/returns`. Solo falta la página pública de política + puerta de entrada desde el footer.
3. **Los puntos de recojo YA son públicos**: el checkout los lista vía `GET /pickup-points` (solo activos). Mostrarlos en una página pública no expone nada nuevo.
4. **Banner superior del navbar hardcodeado** (`Navbar.tsx:32`). El patrón para hacerlo editable ya existe: `promoText` (franja bajo el hero, `settings` KV → `PublicConfig` → `useStoreConfig`).
5. **Navbar desalineado con el catálogo — causa raíz del bug de Accesorios**: `ROPA_CATEGORIES` hardcodeado (`Navbar.tsx:17`) y links estáticos a Sale/Novedades/Accesorios (desktop `Navbar.tsx:72-128`, mobile `163-166`). El backend está bien: la API pública devuelve solo categorías activas (`catalog/queries.ts:38`). Al desactivar una categoría, sus productos desaparecen pero el link del navbar queda.
6. **"Sale" y "Novedades" solo funcionan si existen como categorías en la DB**: `Search.tsx:44` filtra contra nombres reales de categorías; si no existen, esos links muestran todo el catálogo sin filtrar. El modelo de producto no tiene precio-tachado ni fecha-novedad — "Sale/Novedades" como concepto real no existe todavía.
7. **Favicon**: la store usa un `favicon.svg` genérico; el admin no tiene ninguno (`antropic-admin/index.html`). Hay un `logo_antropic.png` sin commitear en la raíz del repo.
8. **Sidebar del admin no queda fija**: `Layout.tsx:59` usa `min-h-screen` en flujo normal — con contenido largo (kanban, inventario) hay que scrollear hasta el fondo para cerrar sesión.
9. **Kanban de envíos acumula sin límite**: `Shipments.tsx:41` trae `limit: 100` y las columnas terminales (Entregados/Recogidos) crecen para siempre. Ya hay un comentario `ponytail:` que anticipa la paginación.
10. **No existe listado admin de pedidos**: solo cola de pagos (`/admin/payments/queue`) y shipments. Usuarios (`Users.tsx`) solo lista clientes con banear/activar — sin acceso a su historial. El sidebar tiene "Pedidos" como placeholder sin `href` (`Layout.tsx:13`).
11. **Inventario y Usuarios sin paginación en UI**: la API ya pagina, pero el front hardcodea `page: 1, limit: 50` (`Inventory.tsx:86`, `Users.tsx:29`).
12. **Gráfico de ventas sin datos legibles**: `SalesBars` (`Reports.tsx:130`) solo tiene el tooltip nativo del browser (`title`). Sin ejes, sin cifras visibles.

## Decisiones (defaults propuestos)

- **Todo lo editable va a la DB** vía el riel existente: `settings` KV (jsonb, sin migración) → `AdminConfig`/`PublicConfig` en el spec → `useStoreConfig` en la store. Una sola fuente de verdad; admin y store nunca divergen.
- **Navbar derivado 100% de `useCategories()`** (opción A): top-level = categorías especiales por slug (`sale`, `novedades`, `accesorios`) solo si están activas; dropdown Ropa = resto de categorías activas por `sortOrder`; ocasiones ya son dinámicas. El CRUD de categorías existente ES el editor del navbar. NO se construye un constructor de menús tipo CMS.
- **Puntos de recojo visibles públicamente** en `/recojo`: ya son públicos vía checkout y un store locator ayuda a la conversión pre-compra.
- **Kanban: nunca se borra historial.** Las columnas terminales muestran solo los últimos N días (param `recentTerminalDays`, default UI 7) + link "ver historial" al módulo Pedidos. Los datos quedan intactos en DB.
- **Módulo Pedidos visible para employee + admin** (mismo gate que Shipments); es herramienta operativa, no reporte.
- **Semántica de visibilidad del banner superior**: igual que `promoText` — `null` oculta el banner (a diferencia del hero, que usa fallback). Tras el deploy hay que cargar el texto una vez en admin (checklist Fase 6).
- **FAQ y política de devoluciones con fallback en la store** (mismo patrón que el hero): si el admin no configuró nada, la store muestra los textos por defecto versionados en código. FAQ default: 5 preguntas (tiempos de envío, pago Yape, cambios/devoluciones, guía de tallas, recojo en tienda).
- **Contacto**: `contact { whatsappNumber, instagramUrl, tiktokUrl }` en config; link vacío → el ícono se oculta. El mismo WhatsApp alimenta el CTA de la página de devoluciones.
- **Favicon estático por app, NO en DB**: los browsers lo cachean agresivamente; favicon dinámico es anti-práctica. Mismo logo en store y admin — se ve igual para todos los roles.
- **Paginación server-side** (la API ya la soporta): paginador clásico compartido en Inventario, Usuarios y Pedidos.
- **Gráfico de reportes sin dependencias nuevas**: se mejora el SVG propio (ejes, tooltip real, promedio). recharts solo si Reportes crece con más gráficos.
- **Sale/Novedades como concepto real (descuentos / recién llegados): fuera de alcance** — decisión de producto pendiente. Corto plazo se tratan como categorías normales; la Fase 6 verifica que existan en el seed.

---

## Fase 1 — Quick wins sin contrato

**Store (`antropic-store`):**

1. **Navbar dinámico** (`Navbar.tsx`): eliminar `ROPA_CATEGORIES`; consumir `useCategories()` (ya usada en Search). Top-level Sale/Novedades/Accesorios por slug solo si activas; dropdown Ropa = resto de activas por `sortOrder`; aplicar también al menú mobile (`163-166`). Mientras cargan las categorías, mantener la estructura del nav (sin parpadeo de menú vacío).
2. **Footer**: "Envíos" → "Mis Envíos" con `href="/profile"` (Profile ya maneja el estado deslogueado con CTA de login).
3. **Favicon**: derivar de `logo_antropic.png` (32px + `apple-touch-icon` 180px) a `public/`, actualizar `<link rel="icon">` en `index.html`.

**Admin (`antropic-admin`):**

4. **Sidebar fija** (`Layout.tsx:59`): `sticky top-0 h-screen` + `overflow-y-auto` en el `<nav>` interno. "Cerrar sesión" siempre visible sin scroll.
5. **Favicon**: mismo logo, mismo tratamiento en `antropic-admin/index.html` (hoy no tiene ninguno).

**Cierre**: typecheck + build → commits `feat(store): dynamic navbar from catalog, footer fixes, favicon` y `feat(admin): sticky sidebar, favicon`.

## Fase 2 — Contrato (un solo codegen)

**`lib/api-spec/openapi.yaml`:**

1. `AdminConfig` / `PublicConfig` / `UpdateConfigInput` — campos nuevos:
   - `announcementText: string | null` (banner superior; null oculta)
   - `contact: { whatsappNumber, instagramUrl, tiktokUrl }` (todos `string | null`)
   - `faq: [{ question: string, answer: string }]` (array; orden = orden de render)
   - `returnsPolicy: string | null` (texto de la página de devoluciones)
2. **`GET /admin/orders`** (nuevo, gate employee+admin): params `q` (número de pedido / nombre / email del cliente), `paymentStatus?`, `fulfillmentStatus?`, `userId?`, `from?`, `to?`, `page`, `limit`. Respuesta paginada con resumen por pedido (número, fecha, cliente, método de entrega, estados, total).
3. **`GET /admin/orders/{id}`** (nuevo): detalle con ítems, dirección/punto de recojo, historial de estados disponible.
4. **`GET /admin/shipments`**: param opcional `recentTerminalDays?: integer` — filtra `entregado`/`recogido` a los últimos N días; omitido = comportamiento actual (sin regresión).

**`lib/db`:** sin cambios — `settings` jsonb y las tablas de pedidos ya soportan todo.

**Cierre**: `codegen` → typecheck → commit `feat(api-spec): round-5 contract (store content config, admin orders, shipments window)`.

## Fase 3 — api-server

1. **config/service.ts**: claves KV nuevas `KEY_ANNOUNCEMENT`, `KEY_CONTACT`, `KEY_FAQ`, `KEY_RETURNS_POLICY`, integradas al `getConfig`/`updateConfig` existentes. Respetar el contrato "null = borrar fila" de `setSetting` (`config/queries.ts:22-29`).
2. **orders**: `listAdminOrders` (joins con perfil de cliente — el patrón ya existe en shipments), filtros + paginación, y `getAdminOrder` (detalle con ítems). Gate con el middleware de staff existente (employee+admin).
3. **shipments**: aplicar `recentTerminalDays` en la query solo sobre estados terminales (las columnas activas siempre completas).

**Cierre**: typecheck + build → commit `feat(api-server): store content settings, admin orders listing, shipments terminal window`.

## Fase 4 — Admin

1. **Config.tsx**:
   - Pestaña **Contenido**: campo "Banner superior (anuncio)" y textarea "Política de cambios y devoluciones".
   - Pestaña nueva **Contacto**: WhatsApp, Instagram, TikTok.
   - Pestaña nueva **FAQ**: lista de pares pregunta/respuesta con agregar, quitar y reordenar (subir/bajar).
   - Cuidado: `ConfigForm` remonta con `key=JSON.stringify(data)` al guardar — los campos nuevos entran al estado inicial del form o se pierden ediciones tras guardar.
2. **Página Pedidos** (nueva, `/orders`): tabla paginada con búsqueda (número/cliente), filtros de estado y fechas, y detalle por pedido. Dar `href` al placeholder "Pedidos" del sidebar (`Layout.tsx:13`), visible para employee+admin (sin `adminOnly`).
3. **Usuarios → historial**: en cada fila de cliente, acción "Ver pedidos" → navega a `/orders?userId={id}`.
4. **Shipments**: pasar `recentTerminalDays: 7`; en el header de las columnas terminales, link "Ver historial completo" → `/orders?fulfillmentStatus=...`.
5. **Paginación compartida**: componente paginador (‹ 1 2 3 › + "mostrando X de Y") aplicado a Inventario, Usuarios y Pedidos.
6. **Reports — `SalesBars`**: eje Y con 2-3 marcas (0 / mitad / max), fechas de inicio/fin en el eje X, tooltip propio al hover con fecha + monto + pedidos, y línea/leyenda de promedio del período. Sin dependencias nuevas.

**Cierre**: typecheck + build → commit `feat(admin): orders module, config content/contact/faq, pagination, chart axes`.

## Fase 5 — Store

1. **Rutas nuevas** en `App.tsx`: `/faq`, `/devoluciones`, `/recojo` — públicas (accesibles para anónimos).
2. **`/faq`**: accordion (ya existe `ui/accordion.tsx`) con `config.faq`; fallback a las 5 preguntas por defecto si está vacío.
3. **`/devoluciones`**: política (`config.returnsPolicy` con fallback), pasos del proceso, CTA "Ir a mis pedidos" → `/profile` y contacto WhatsApp desde `config.contact`.
4. **`/recojo`**: lista de puntos activos vía `useListPickupPoints` (hook ya usado en Checkout).
5. **Navbar**: banner superior desde `config.announcementText` (null = oculto); reservar altura para evitar salto de layout al cargar.
6. **Footer**: links reales — "Cambios y devoluciones" → `/devoluciones`, "Preguntas frecuentes" → `/faq`, "Ver ubicaciones" → `/recojo`; bloque de contacto desde `config.contact` (íconos ocultos si el link está vacío); año del copyright dinámico.

**Cierre**: typecheck + build → commit `feat(store): faq/returns/pickup pages, configurable announcement and contact`.

## Fase 6 — Verificación E2E manual

- [ ] Verificar en la DB que "Sale" y "Novedades" existen como categorías activas con slugs `sale`/`novedades`; si no, crearlas desde el admin
- [ ] Desactivar "Accesorios" en admin → desaparece del navbar (desktop y mobile), de las pills y del search; reactivar → vuelve
- [ ] Cambiar `sortOrder` de una categoría → el dropdown Ropa refleja el orden
- [ ] Configurar banner superior en admin → visible en store; vaciarlo → el banner desaparece sin dejar hueco
- [ ] Configurar WhatsApp/Instagram/TikTok → footer los usa; vaciar TikTok → ícono oculto
- [ ] Editar FAQ en admin (agregar/reordenar) → `/faq` lo refleja; sin config → muestra las 5 por defecto
- [ ] Editar política de devoluciones → `/devoluciones` la refleja; CTA lleva a perfil y el flujo de ticket existente funciona
- [ ] `/recojo` lista solo puntos activos; desactivar uno en admin → desaparece
- [ ] Footer "Mis Envíos" → perfil con pedidos (logueado) / CTA login (anónimo)
- [ ] Favicon visible en pestañas de store y admin
- [ ] Sidebar admin fija con kanban largo; "Cerrar sesión" visible sin scroll
- [ ] Shipments: columnas terminales muestran solo 7 días + link a historial; columnas activas completas
- [ ] Pedidos: buscar por número, filtrar por estado, paginar; "Ver pedidos" desde un cliente en Usuarios filtra correcto
- [ ] Como **employee**: ve Pedidos pero NO Reportes/Usuarios/Config/Cupones; endpoints admin-only devuelven 403
- [ ] Inventario y Usuarios paginan (crear >50 productos de prueba o bajar `limit` temporalmente para verificar)
- [ ] Gráfico de reportes: ejes con cifras, tooltip con fecha/monto/pedidos, promedio visible

**Cierre de ronda**: commit `docs: round-5 plan executed` + actualizar `PRE-DEPLOY.md` (cargar texto del banner y contacto en admin tras deploy).

---

## Fuera de alcance (deliberado)

- Sale/Novedades como concepto real (precio tachado, descuentos, "recién llegados" por fecha) — requiere decisión de producto y cambios de modelo.
- Constructor de menús tipo CMS (tabla `nav_items`, drag & drop) — el CRUD de categorías cubre la necesidad actual.
- Tabla dedicada para FAQ — el KV jsonb basta; migrar solo si algún día piden categorías de FAQ o edición colaborativa.
- recharts en el admin — el SVG propio alcanza para una serie diaria.
- Recordatorios automáticos de carritos abandonados y analítica web (pendientes previos, sin cambios).
