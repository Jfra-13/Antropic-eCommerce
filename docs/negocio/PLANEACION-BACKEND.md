# Planeación Backend — Análisis

> **Fuentes:** `Antropic-Requerimientos.md` (requerimientos cerrados), estado real del monorepo.
> **Fecha:** 2026-07-07

---

## 1. Estado actual (lo que hay)

- **api-server**: Express 5 + pino, solo `GET /api/healthz`. Esqueleto listo, cero lógica de negocio.
- **db** (Drizzle): schema **vacío** (solo template comentado). Pool pg configurado.
- **api-spec**: pipeline spec-first funcionando (`openapi.yaml` → Zod + React Query hooks vía Orval). Solo tiene health.
- **antropic-store**: frontend completo pero 100% mockeado (`StoreContext` + `mockData.ts` + localStorage). No toca el API.
- **Requerimientos**: `Antropic-Requerimientos.md` cerrado — Supabase (DB + Auth + Storage), Vercel (front), DigitalOcean (API), pago Yape/Plin manual, 4 roles, cupones, delivery/recojo La Molina.

**Conclusión:** base sólida, contrato spec-first ya resuelto. El trabajo real es todo lo de negocio.

---

## 2. Capa Database

**Stack:** PostgreSQL relacional (Supabase administrado) + Drizzle ORM. Decidido.

**Entidades núcleo:**

| Entidad | Rol |
|---|---|
| `profiles` | Extiende `auth.users` de Supabase; incluye `role` (`customer` / `employee` / `admin`) |
| `categories`, `occasions` | Navegación del catálogo |
| `products` | Producto base (nombre, precio, descripción, categoría, ocasión, activo) |
| `product_variants` | Combinación talla × color, SKU, stock por combinación |
| `product_media` | Fotos + videos (paths a Supabase Storage) |
| `carts` + `cart_items` | Carrito persistido por usuario |
| `orders` + `order_items` | Órdenes con snapshot de precios |
| `payment_proofs` | Constancias Yape/Plin subidas |
| `coupons` + `coupon_redemptions` | Cupones con límites de tiempo/uso |
| `wishlists` | Lista de deseos |
| `stock_alerts` | Suscripciones "avísame cuando haya stock" |
| `return_tickets` | Tickets de devolución |
| `pickup_points` | Puntos de recojo La Molina |
| `settings` | Tarifa delivery, número/QR Yape, banners |

**Detalles a cubrir:**

1. **PK/FK**: UUID como PK (compatible con Supabase Auth, no expone conteo de órdenes). FK con `references()` + índice explícito — Postgres NO indexa FKs automáticamente.
2. **Snapshot de precios**: `order_items` copia precio, nombre y variante al momento de compra. Nunca JOIN al producto vivo para históricos — el producto cambia, la orden no.
3. **Constraints en DB, no solo en app**: `CHECK (stock >= 0)`, `UNIQUE(sku)`, `UNIQUE(coupon.code)`, estados como `pgEnum`. La DB es la última trinchera contra oversell.
4. **Índices**: `products(category_id)`, `products(occasion)`, `variants(product_id)`, `orders(user_id, status)`, índice parcial `orders WHERE status = 'en_verificacion'` (la cola de verificación se consulta constantemente).
5. **Transacciones**: aprobar pago = `orden → pagado` + decrementar stock de N variantes en UNA transacción con `SELECT ... FOR UPDATE`. Punto más crítico del sistema.
6. **Migraciones**: hoy es `push`. Antes de producción → `drizzle-kit generate` (migraciones versionadas). Push contra una DB con datos reales = pérdida de datos.
7. **Soft delete en productos**: `active: boolean`, no DELETE — las órdenes históricas referencian productos.
8. **Media**: Supabase Storage guarda archivos; la DB guarda solo paths. Bucket **privado** para constancias de pago (dato sensible), **público** para catálogo.

---

## 3. Capa Data Access (permisos y seguridad)

1. **Todo pasa por el API.** El front NUNCA toca la DB directo. Service role key solo en api-server. RLS de Supabase en modo deny-all como red de seguridad, no como capa de autorización principal — la autorización vive en Express.
2. **Auth**: el front obtiene JWT de Supabase (Google OAuth / Magic Link) → lo manda como Bearer (`custom-fetch.ts` ya lo soporta) → middleware verifica firma JWT server-side con `jose` + JWKS de Supabase. Sin llamada de red por request.
3. **Roles**: columna `role` en `profiles` (`customer | employee | admin`). Middlewares `requireAuth` y `requireRole('admin')`. La matriz de permisos está definida en Requerimientos §6.0.
4. **Ownership**: el cliente solo lee SUS órdenes/wishlist/tickets (`WHERE user_id = jwt.sub` siempre, dentro de la query, no filtrando después).
5. **Connection pooling**: Supavisor de Supabase en transaction mode + pool pg chico (max ~10). DO App Platform escala instancias → cada una abre su pool → Postgres tiene conexiones finitas.
6. **Constancias de pago**: bucket privado + signed URLs con expiración. Solo empleado/admin y el dueño de la orden las ven.
7. **Audit mínimo**: quién aprobó/rechazó cada pago y cuándo (`approved_by`, `approved_at` en la orden). Es dinero — trazabilidad obligatoria.

---

## 4. Capa Services

1. **Módulos por dominio**: `catalog`, `cart`, `orders`, `payments`, `coupons`, `shipping`, `returns`, `users`, `admin` (reports/config). Cada módulo = 3 archivos: `router.ts` (HTTP), `service.ts` (lógica), `queries.ts` (Drizzle). Sin más capas.
2. **Spec-first por módulo**: cada módulo agrega sus paths a `openapi.yaml` → codegen → el front consume hooks generados. El contrato ES la frontera entre módulos.
3. **Idempotencia donde hay dinero**: aprobar un pago dos veces = un solo decremento de stock (chequear estado actual antes de transicionar). Crear orden con idempotency key del cliente (doble click en "Continuar" no crea dos órdenes).
4. **Notificaciones**: servicio propio, email vía Resend (free tier suficiente). Envío best-effort con retry simple — si el email falla, la orden NO falla.
5. **Integraciones aisladas**: WhatsApp = deep link `wa.me` (cero API). n8n = un webhook endpoint `POST /api/payments/webhook` con secret compartido, para la fase de automatización. Recomendador de Paolo = diferido, sin endpoint todavía.
6. **Import Excel/CSV**: parse server-side (`papaparse` para CSV; xlsx después si hace falta), validación fila por fila con Zod, upsert por SKU, respuesta con errores por fila.

---

## 5. Capa Business Logic

1. **Máquina de estados de orden** (el corazón): pago: `pendiente_pago → en_verificacion → pagado | rechazado`; envío: `en_preparacion → enviado → entregado` / `recojo_pendiente → recogido`. Mapa explícito de transiciones válidas — una función `canTransition(from, to)`; cualquier otra transición = HTTP 409.
2. **Totales SIEMPRE server-side**: subtotal + envío − cupón se calcula en el backend al crear la orden. El front solo muestra. Jamás confiar en montos del cliente.
3. **Reglas de cupón**: vigencia (fechas), límite de usos (contador con `UPDATE ... WHERE uses < max_uses` atómico), monto mínimo, un cupón por orden. Validación al aplicar Y al crear la orden (pudo expirar entre medio).
4. **Stock — decisión de negocio tomada**: se decrementa al APROBAR el pago (no al crear la orden). Riesgo: dos clientas pagan la última talla M mientras ambas órdenes están `en_verificacion` → al aprobar la segunda, stock insuficiente. Mitigación mínima: la aprobación valida stock dentro de la transacción y avisa al empleado si no alcanza. Reserva temporal de stock = fase posterior, solo si duele.
5. **Código de referencia** `ANT-{orderNumber}` generado al crear la orden — llave del match automático de pagos Yape (el riesgo de colisión por monto está documentado en Requerimientos).
6. **Merge de carrito**: el invitado arma carrito en localStorage → al loguearse se fusiona con su carrito persistido (suma cantidades, respeta stock).
7. **"Avísame cuando haya stock"**: al reponer stock de una variante agotada → disparar notificación a los suscritos y marcar como enviada (no spamear en cada update de stock).

---

## 6. Capa Presentation (API + clientes)

1. **REST spec-first** (decidido; no GraphQL/gRPC — un solo cliente, payloads simples). Recursos por módulo, verbos correctos, códigos HTTP bien usados (201 crear orden, 409 transición inválida, 422 cupón vencido).
2. **Paginación obligatoria** en catálogo y listas admin: `?page=&limit=`. Offset simple alcanza a esta escala; cursor cuando haya miles de órdenes.
3. **Errores con shape único**: `{ code, message }` — `ApiError` en custom-fetch ya lo parsea. Códigos de negocio (`COUPON_EXPIRED`, `OUT_OF_STOCK`) para que el front traduzca a UX.
4. **CORS**: whitelist explícita (dominio Vercel + localhost). Nunca `*` con credenciales.
5. **Rate limiting**: `express-rate-limit` en endpoints sensibles (subir constancia, aplicar cupón, webhook). Token bucket en memoria alcanza — una instancia.
6. **Sin versionado de API todavía**: un solo cliente que se despliega junto al API. Regla: cambios aditivos solamente; versionar recién cuando exista un cliente externo.
7. **"Pago exitoso" en tiempo real**: **polling** cada 5s desde la pantalla "en verificación" (React Query `refetchInterval`). WebSockets = complejidad injustificada para un evento que ocurre una vez por compra.
8. **Backoffice — DECIDIDO: artifact separado** (`artifacts/antropic-admin`). Razones: el bundle del storefront no carga código admin, deploy independiente (romper el backoffice no tumba la tienda), frontera de permisos más limpia, y el monorepo ya soporta el patrón (`artifacts/*` + libs compartidas como `api-client-react`). Costo: duplicar setup Vite/Tailwind una vez. Cuidado: componentes compartidos van a una lib del workspace, no copy-paste.

---

## 7. Orden de desarrollo recomendado

Para un ecommerce con contrato spec-first, el orden es **datos → contrato → slices verticales**. No se construye "toda la capa de datos, luego todos los services" — se construye por módulo, de punta a punta:

| # | Fase | Por qué en este orden |
|---|---|---|
| 1 | **Schema Drizzle completo** + wiring Supabase Auth (middleware JWT + profiles/roles) | Todo depende de las entidades. Auth es transversal. |
| 2 | **Catálogo read-only** (spec → endpoints → conectar storefront, eliminar `mockData.ts`) | El slice más simple; valida TODO el pipeline (DB → API → codegen → front) sin dinero de por medio. |
| 3 | **Carrito + Wishlist** persistidos | Depende del catálogo. Introduce ownership y merge invitado → logueado. |
| 4 | **Checkout: órdenes + pagos + cupones + envío** | El núcleo. Llega con el pipeline ya probado por las fases 2 y 3. |
| 5 | **Backoffice** (`antropic-admin`): verificación de pagos, inventario, import CSV, envíos | Necesita que existan órdenes. |
| 6 | **Notificaciones + reportes + devoluciones** | Consumen todo lo anterior. |

Coincide con el cronograma de Requerimientos §5, pero en vertical: cada fase entrega algo usable.

---

## 8. "Usar en módulos" — arquitectura, patrones y paradigmas

- **Topología: monolito modular.** Ya existe Express. Microservicios con un equipo de 1-2 personas y una tienda local = suicidio operativo. La escalabilidad se logra con módulos bien delimitados — si un día hace falta extraer `payments` a un servicio propio, los límites ya existen.
- **Estructura por módulo**: `router → service → queries`. Hexagonal-lite: la lógica de negocio vive en `service.ts` como funciones puras que reciben datos y devuelven decisiones; Drizzle queda encerrado en `queries.ts`. Inversión de dependencias sin interfaces ceremoniales — TypeScript + convención alcanza.
- **DDD**: solo el lenguaje ubicuo (orden, variante, constancia, verificación — los mismos nombres en DB, API, código y UI) y los bounded contexts como carpetas de módulo. Nada de aggregates/repositories formales.
- **Patrones GoF que sí aplican**: **State** (transiciones de orden, implementado como mapa de datos, no clases), **Strategy** solo si la tarifa de delivery se vuelve por-zona (hoy: una función). Nada de Factory/Singleton ceremonial — los módulos ES ya son singletons.
- **Paradigma**: funcional-procedural con TypeScript estricto. Funciones, no clases. Zod en las fronteras (request, CSV, webhook), tipos inferidos hacia adentro.
- **Comunicación**: 100% sincrónica (REST). Sin colas de mensajes — el único "async" real (verificación de pago) es un humano, no un broker.

---

## 9. Consideraciones de arquitectura backend — selección

### Usamos

Monolito modular · trade-offs explícitos · límites de módulo (acoplamiento/cohesión) · DDD-lite (lenguaje ubicuo + bounded contexts) · ACID/transacciones · niveles de aislamiento (solo en aprobación de pago) · estrategias de indexación · connection pooling · rate limiting · REST · códigos de estado HTTP · CORS · JWT/OAuth2 (Supabase) · idempotencia · paginación y filtrado · OWASP Top 10 · TLS (incluido con Supabase/Vercel/DO) · timeouts + retry solo hacia servicios externos (email) · separación de entornos dev/prod · clean code · pirámide de tests (empezando por unit tests en los services de dinero: cupones, totales, transiciones de estado).

### Descartamos (YAGNI a esta escala — revisar si el negocio explota)

Microservicios · arquitectura orientada a eventos · gRPC/GraphQL · CAP theorem/sharding/replicación multi-líder · batch vs stream · Redis/CDN propio (React Query + `Cache-Control` alcanzan) · WebSockets · circuit breakers/bulkheads · Kubernetes · Infraestructura como Código · tracing distribuido (OpenTelemetry) · blue/green y canary releases · métricas DORA.

Cada uno resuelve un problema que este proyecto NO tiene: son para decenas de servicios y millones de usuarios, no para lanzar una tienda en La Molina. Agregarlos hoy = pagar el costo sin recibir el beneficio.

---

## 10. Decisiones registradas

- [x] Backoffice → **artifact separado** (`artifacts/antropic-admin`).
- [x] Monolito modular sobre Express 5 existente; módulos por dominio (`router/service/queries`).
- [x] Stock se decrementa al aprobar pago, dentro de transacción con validación de stock.
- [x] Autorización en el API (Express), no en RLS; RLS deny-all como red de seguridad.
- [x] Polling (no WebSockets) para el estado de pago.
- [x] Sin versionado de API por ahora; solo cambios aditivos.
- [ ] Pendiente config (no bloqueante): tarifa exacta de delivery La Molina — la define el negocio en el panel.
