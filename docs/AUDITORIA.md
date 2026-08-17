# Auditoría pre-lanzamiento — Antropic

Adaptación del checklist genérico de ecommerce Perú al stack **real** de este repositorio.

**Stack real:** Vite + React (SPA) · Express 5 · Drizzle sobre `pg.Pool` · Supabase (solo Auth y
Storage) · Resend · verificación manual de Yape/Plin.

**Estado de esta pasada:** revisión de código del 2026-08-17 sobre `main`. Todo ítem marcado `[x]`
se verificó leyendo el código y se cita el archivo. Los ítems sin cita no se verificaron.

> **Convención:** `[x]` hecho y verificado · `[~]` parcial · `[ ]` pendiente · `n/a` no aplica a
> este stack (con la razón).
> Los ítems **🔴 BLOQUEANTE** no deben lanzarse sin resolver.
> Los **⚖️ LEGAL** requieren validación de un abogado o contador peruano. Este documento es
> orientativo, no asesoría legal.

---

## 0. Por qué este documento existe

El checklist de origen está escrito para **Next.js · Vercel/Cloudflare · Izipay**. Antropic no es
eso. Auditar contra el documento original produce falsos positivos (ítems que "fallan" porque
describen APIs que no usamos) y falsos negativos (riesgos propios de una SPA que el documento no
contempla). Esta es la traducción.

### 0.1 Qué del documento original no aplica

| Bloque original | Traducción a este stack |
|---|---|
| §4 ISR, Server Components, `next/image`, `next/font`, `<Suspense>`, `revalidateTag` | `n/a`. SPA sin SSR. Se sustituye por §4 de este documento: code-splitting por ruta, caché de React Query, `<img>` con `loading`/`sizes`/dimensiones explícitas |
| §6 Izipay: webhook, firma, idempotencia de eventos, conciliación diaria | `n/a` **hoy**. No hay pasarela. El flujo real es constancia Yape/Plin → cola de verificación manual. Ver §6 de este documento |
| §3.1 RLS como control principal | Degradado a defensa en profundidad. El navegador nunca habla con Postgres: pega al Express, que verifica JWT y consulta con credenciales de servidor. Sigue siendo obligatorio porque PostgREST está expuesto sobre la misma base |
| §10.3 Server Actions, CSRF de Server Actions | `n/a`. Routers Express con bearer token en cabecera, no cookies de sesión → sin superficie CSRF clásica |
| §10.4 Migraciones con Supabase CLI | `n/a` como está escrito. Aquí es `drizzle-kit push` **sin migraciones versionadas** — es un hueco real, ver §10.4 |
| §10.2 `supabase gen types typescript` | Sustituido por codegen desde `lib/api-spec/openapi.yaml` (Orval), que cumple el mismo objetivo |
| §12 pregunta 8 ("¿qué pasa con Yape manual?") | No es una pregunta abierta: **es la arquitectura de pagos vigente** |

### 0.2 Decisiones de alcance tomadas

- **Pagos:** no se integra pasarela en este ciclo. Se prepara la arquitectura para que el flujo
  manual y una pasarela futura convivan tras la misma máquina de estados.
- **Clonación:** la segunda marca será **repo separado y base de datos separada**. Prioridad: sacar
  toda la identidad de marca a configuración antes del fork.
- **SEO:** meta dinámicos por ruta + `sitemap.xml` + JSON-LD, **sin** migrar a SSR. Consecuencia
  aceptada: las vistas previas de WhatsApp e Instagram no renderizarán por producto.

---

## 1. Repositorio y rebranding

### 1.1 Higiene del repositorio

- [x] `.gitignore` cubre `.env`, `node_modules`, `dist`, `.DS_Store` y `*.har` — `.gitignore`
- [x] `README.md` con requisitos, instalación, variables y comandos
- [x] GitHub Actions con typecheck + build en cada PR — `.github/workflows/ci.yml`
- [x] Licencia acordada — `LICENSE`
- [ ] `main` protegida: sin push directo, PR obligatorio
- [ ] Dependabot activado
- [ ] Rama de staging y despliegue automático por entorno

### 1.2 🔴 BLOQUEANTE — Secretos en el historial

**Hallazgo:** `localhost.har` estuvo commiteado en `b63ae08` y se destrackeó en `60182a6`. **Sigue
en el historial** (5.5 MB).

- [x] Historial inspeccionado en busca de credenciales en el HAR: **sin JWTs, sin cabeceras
      `authorization`/`cookie`, sin hosts de Supabase**. Es una captura de assets de localhost. No
      hay fuga de credenciales que obligue a rotar llaves por este motivo
- [x] Sin secretos en el código fuente: `service_role` solo aparece como nombre de variable de
      entorno leída en servidor — `lib/auth-admin.ts:7`, `lib/storage.ts:11`
- [x] `.env.example` presente en raíz y por artefacto
- [ ] Escaneo formal con `gitleaks detect` o `trufflehog` sobre el historial completo
- [ ] Decidido si se purga el HAR del historial (`git filter-repo`) o se acepta el peso muerto.
      **Recomendación: purgarlo al crear el repo del clon**, que arranca de cero de todos modos
- [ ] Rotación de secretos programada y documentada

### 1.3 Rebranding — dónde vive la marca

Esta sección es la que determina si el clon es un cambio de configuración o una cacería.

- [x] Colores de marca centralizados: solo quedan 4 hex arbitrarios en el storefront y son del
      logo de Google (`#4285F4`, `#EA4335`, `#FBBC05`, `#34A853`). La *gotcha* histórica de dos
      fuentes de verdad para el color está resuelta
- [x] Contenido de tienda ya editable desde el backoffice vía tabla `settings`: banners, hero,
      editorial, FAQ, contacto, anuncio, política de devoluciones, umbral de envío gratis
- [~] Textos de interfaz: dispersos en componentes, no centralizados
- [ ] Nombre de marca hardcodeado: `Footer.tsx:19` (`Antropic`), `index.html` de store y admin
- [ ] Favicon, `apple-touch-icon` e imagen Open Graph por marca
- [ ] `manifest.json` (no existe)
- [ ] Plantillas de correo transaccional con identidad parametrizada
- [ ] Remitente y firma de los correos
- [ ] Textos legales (no existen todavía — ver §2)
- [ ] Metadatos del backoffice: título de pestaña y logo del login
- [ ] Descriptor de estado de cuenta de tarjeta — pendiente hasta que haya pasarela

### 1.4 UX que impacta conversión

- [x] Carrito persistente entre sesiones: `localStorage` como invitado, fusión al servidor en el
      login — `StoreContext.tsx`
- [x] Búsqueda con overlay y página dedicada — `SearchOverlay.tsx`, `pages/Search.tsx`
- [x] Filtros por categoría — `CategoryPills.tsx`
- [x] Costo de envío calculado en servidor antes de confirmar — `checkout/service.ts:35`
- [ ] Checkout como invitado: **hoy exige cuenta** (`orders` tiene `user_id NOT NULL`)
- [ ] Indicador de progreso en el checkout
- [ ] Guía de tallas
- [ ] Stock visible tipo "últimas 3 unidades"
- [ ] Contraste WCAG AA verificado
- [ ] Navegación por teclado en el checkout verificada
- [ ] Verificado en móvil real, no solo en el inspector

---

## 2. ⚖️ LEGAL — Cumplimiento peruano

> Todo este bloque necesita validación de abogado. Es el área con mayor exposición y menor avance.

### 2.1 🔴 BLOQUEANTE — Libro de Reclamaciones Virtual

**Estado: no existe.** Solo se menciona en `docs/negocio/FLUJOS-ROLES-Y-MEJORAS.md`. No hay tabla,
ni endpoint, ni página, ni enlace en el footer.

Base normativa: Ley N° 29571 reglamentada por D.S. N° 011-2011-PCM, modificada por la Ley N° 32495
(noviembre 2025) para incluir explícitamente a las plataformas digitales de comercio electrónico.

- [ ] Enlace visible de forma permanente en el footer de todas las páginas
- [ ] Formulario con datos mínimos: identificación del consumidor, identificación del proveedor,
      detalle del bien o servicio, descripción del reclamo o queja, fecha y firma
- [ ] Distinción entre **reclamo** (producto/servicio) y **queja** (atención)
- [ ] Hoja de Reclamación imprimible y enviada automáticamente por correo, con constancia
- [ ] Correlativo único por hoja
- [ ] Conservación de registros por 2 años
- [ ] Proceso interno para responder en 30 días calendario
- [ ] Responsable asignado en el negocio
- [ ] Los datos del reclamo **no** alimentan newsletter ni CRM
- [ ] Panel en el backoffice con estado y plazo restante

Referencia de sanción: hasta 200 UIT por incumplir lo ofrecido en el reclamo; una denuncia formal
puede ir de amonestación hasta 450 UIT.

### 2.2 🔴 BLOQUEANTE — Protección de datos (Ley 29733 + D.S. 016-2024-JUS)

El reglamento vigente desde el 30 de marzo de 2025 refuerza consentimiento, cookies, notificación de
brechas y obligaciones del DPO. Sanciones de 0.5 a 100 UIT.

**Estado: nada implementado.** No hay política de privacidad, ni banner de cookies, ni registro de
consentimiento, ni canal ARCOP.

- [ ] Banco de datos personales inscrito ante la ANPD (trámite, no código; infracción grave si falta)
- [ ] Inscritos también los bancos internos: empleados, candidatos, proveedores
- [ ] Política de privacidad publicada
- [ ] Consentimiento previo, informado, expreso y libre — sin checkboxes premarcados
- [ ] Consentimiento **separado** para procesar el pedido y para marketing
- [ ] Consentimiento demostrable: fecha, hora, IP y versión del texto aceptado
- [ ] Banner de cookies con rechazo tan visible como la aceptación
- [ ] Scripts de terceros bloqueados hasta el consentimiento
- [ ] Derechos ARCOP: acceso, rectificación, cancelación, oposición, portabilidad
- [ ] Procedimiento de notificación de brechas en 48 horas, documentado **antes** de lanzar
- [ ] Evaluada la obligación de designar Oficial de Protección de Datos
- [ ] Contratos de encargo de tratamiento: Supabase, Resend, hosting
- [ ] Transferencias internacionales documentadas (los servidores están fuera de Perú)

### 2.3 Información obligatoria al consumidor

- [x] Política de cambios y devoluciones publicada — `pages/Returns.tsx`, editable desde `settings`
- [x] Preguntas frecuentes — `pages/Faq.tsx`
- [x] Canales de atención publicados (WhatsApp, Instagram, TikTok) — `Footer.tsx`
- [x] Precios en soles
- [x] Costo de envío informado antes de cerrar la compra
- [ ] Razón social completa, RUC y domicilio fiscal visibles
- [ ] Términos y condiciones de venta publicados
- [ ] Plazo de entrega informado
- [ ] Confirmado que los precios se muestran con IGV incluido (ver §2.4)

### 2.4 Facturación electrónica SUNAT

**Estado: no existe. Y no hay tratamiento de IGV en ninguna parte del código** — cero coincidencias
de `IGV` o `0.18` en todo el repositorio. Los precios son el valor plano del producto, sin
desagregación de impuesto.

Esta es una decisión de negocio antes que técnica: hay que definir si los precios de catálogo ya
incluyen IGV (y solo falta desagregarlo en el comprobante) o si no lo contemplan en absoluto.

- [ ] Definido el tratamiento del IGV en precios y totales
- [ ] Proveedor de facturación electrónica definido (Nubefact, Bsale, Efact…)
- [ ] Emisión automática de boleta o factura al aprobarse el pago
- [ ] Serie separada para el canal online (ej. B002/F002)
- [ ] Captura de datos de facturación en el checkout: DNI para boleta, RUC + razón social para factura
- [ ] Validación de RUC contra SUNAT
- [ ] Comprobante enviado por correo y descargable desde la cuenta
- [ ] Nota de crédito para devoluciones y anulaciones
- [ ] Comprobantes conservados por el plazo legal

---

## 3. Seguridad

### 3.1 🔴 BLOQUEANTE — Superficie de la API

Estos son huecos de bajo costo y alto riesgo. Son la primera fase de trabajo.

- [ ] **CORS abierto a cualquier origen** — `app.ts:34` es `cors()` sin opciones. Necesita allowlist
      de orígenes por entorno
- [ ] **Sin cabeceras de seguridad**: falta `Content-Security-Policy`, `Strict-Transport-Security`,
      `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (no hay helmet)
- [ ] **Sin rate limiting** en ningún endpoint: ni login, ni checkout, ni búsqueda, ni subida de
      constancias
- [ ] **Variables de entorno sin validación centralizada al arranque**: `process.env` se lee disperso
      en `lib/auth.ts`, `lib/auth-admin.ts`, `lib/storage.ts`, `lib/notify.ts`, `index.ts`. Algunas
      fallan al arrancar (`auth.ts:15`), otras solo al usarse (`notify.ts:13`) — una var faltante
      puede reventar a mitad de un checkout
- [ ] Captcha o equivalente en formularios públicos
- [ ] Endpoints revisados uno por uno para IDOR

### 3.2 🔴 BLOQUEANTE — Supabase RLS

Aquí RLS no es el control principal, pero **PostgREST está expuesto sobre la misma base de datos**
y la anon key es pública por diseño. Sin RLS, cualquiera puede leer las tablas directamente sin
pasar por el Express.

- [ ] RLS habilitado en todas las tablas, verificado tabla por tabla
- [ ] Probado con la anon key desde fuera de la app (curl/Postman) que no se puede leer nada
- [ ] `SUPABASE_SERVICE_ROLE_KEY` nunca en el bundle del cliente — verificar en el build de store y
      admin, no solo en el código fuente
- [ ] Vistas y funciones RPC revisadas

### 3.3 🔴 BLOQUEANTE — Integridad de precios y stock

**Este bloque está resuelto y es la parte más sólida del sistema.**

- [x] El precio se recalcula **siempre** en servidor desde la base — `checkout/service.ts:31-47`
      calcula subtotal, envío, descuento y total; nunca confía en el cliente
- [x] Cupones validados en servidor — `checkout/service.ts:40`
- [x] Montos en enteros (céntimos) — `lib/money.ts`, helpers `toCents`/`fromCents`
- [x] Stock verificado al crear la orden sin decrementar — `orders/service.ts:105-111`
- [x] Stock decrementado dentro de transacción atómica al aprobar el pago, con `SELECT … FOR UPDATE`
      sobre la orden y `UPDATE … WHERE stock >= cantidad` — `payments/queries.ts:123-152`. Dos
      clientes no pueden comprar la última unidad
- [x] Idempotencia en la creación de pedidos: `idempotency_key` con constraint `UNIQUE` —
      `schema/orders.ts`. Un doble clic en "Continuar" no crea dos pedidos
- [ ] Liberación automática de stock si el pago no se completa en X minutos — no aplica igual que en
      una pasarela (el stock no se reserva al crear la orden), pero **sí falta caducar los pedidos
      `pendiente_pago` abandonados**

### 3.4 Autenticación y sesiones

- [x] Contraseñas gestionadas por Supabase Auth; el login es magic link y Google OAuth, sin
      contraseña propia — `pages/Login.tsx`
- [x] JWT verificado en servidor contra el JWKS de Supabase, con `issuer` y `audience` validados —
      `lib/auth.ts:71-95`. El JWKS se cachea, sin llamada de red por petición
- [x] Un token presente pero inválido devuelve 401 en vez de degradar a invitado — `lib/auth.ts:117`
- [x] Cuentas bloqueables: `profile.blocked` corta el acceso en el middleware — `lib/auth.ts:99`
- [x] Roles verificados en servidor en cada petición — `requireRole` en `lib/auth.ts:127`
- [ ] Rate limiting en login y recuperación
- [ ] Expiración de sesión y rotación de refresh token revisadas

### 3.5 Datos, respaldos y operación

- [x] No se almacenan datos de tarjeta en ninguna parte
- [x] Constancias de pago en bucket **privado**, servidas con URL firmada que expira en 1 hora —
      `lib/storage.ts:79-83`. La imagen sensible no queda pública de forma permanente
- [x] Logs sin datos personales: el serializador solo registra método, URL sin query e id —
      `app.ts:14-27`
- [x] Errores del servidor no exponen stack traces ni internos — `app.ts:44-52`
- [ ] Point-in-Time Recovery activado en Supabase (requiere plan de pago)
- [ ] Restauración de respaldo probada de verdad, no solo configurada
- [ ] 2FA obligatorio en los dashboards de Supabase y hosting
- [ ] Dependencias sin vulnerabilidades críticas (`pnpm audit` en CI)

---

## 4. Rendimiento (reescrito para SPA)

La §4 original asume renderizado en servidor. Estos son los equivalentes reales.

- [x] Compresión y minificación por defecto de Vite en build de producción
- [x] Fuente única (Inter) con `display=swap` y `preconnect` — `index.html`
- [ ] Code-splitting por ruta con `React.lazy` — hoy todas las rutas entran en el bundle inicial
- [ ] Análisis del bundle (`rollup-plugin-visualizer`) y presupuesto de tamaño
- [ ] Imágenes: formatos modernos, `loading="lazy"`, `sizes` correcto, dimensiones explícitas
      para evitar CLS
- [ ] Imágenes servidas desde CDN, no desde el origen
- [ ] Fuente autoalojada en vez de Google Fonts (evita una dependencia de terceros y mejora LCP)
- [ ] Objetivos medidos en campo: LCP < 2.5 s en 4G, INP < 200 ms, CLS < 0.1, TTFB < 600 ms
- [ ] Probado en un móvil de gama media con red móvil real de Perú

---

## 5. Escalabilidad e infraestructura

- [x] Pool de conexiones gestionado por `pg.Pool` en un servidor de larga vida — `lib/db/src/index.ts`.
      El riesgo de agotamiento del pool que mata a las apps serverless **no aplica aquí**: Express
      mantiene un pool estable, no una conexión por invocación
- [x] Índices en las columnas que se filtran: `orders_user_status_idx` y un índice parcial para la
      cola de verificación — `schema/orders.ts`
- [ ] Conexión vía pooler de Supabase (Supavisor) confirmada para producción
- [ ] `EXPLAIN ANALYZE` sobre las 5 consultas más frecuentes
- [ ] Paginación por cursor en listados grandes (hoy es paginación por página)
- [ ] Plan de Supabase de pago — el gratuito pausa el proyecto por inactividad y no tiene PITR
- [ ] Alertas de consumo antes de llegar al tope
- [ ] Sentry o equivalente capturando errores de cliente y servidor
- [ ] Monitor de uptime con alerta al responsable
- [ ] Dashboard operativo: pedidos por hora, tasa de aprobación, errores 5xx
- [ ] Prueba de carga básica

---

## 6. Pagos — flujo manual Yape/Plin

El documento original describe una integración con pasarela que aquí no existe. Este es el flujo
real y lo que le falta.

### 6.1 Cómo funciona hoy

Cliente crea pedido → ve el QR de Yape y el código de referencia `ANT-{orderNumber}` → paga fuera de
la plataforma → sube la constancia → el pedido pasa a `en_verificacion` → un empleado contrasta la
imagen contra el Yape recibido y aprueba o rechaza → al aprobar se decrementa stock y arranca el
fulfillment.

- [x] Máquina de estados de pago explícita, sin transiciones imposibles — `lib/order-state.ts:10-15`
- [x] Máquina de estados de fulfillment separada por vía (delivery vs recojo), con estados
      terminales — `lib/order-state.ts:26-33`
- [x] Aprobación y rechazo en transacción con bloqueo de fila — `payments/queries.ts:123`
- [x] Auditoría del dinero: `approved_by` y `approved_at` en la orden — `schema/orders.ts`
- [x] Cola de verificación en el backoffice — `pages/PaymentVerification.tsx`
- [x] Notificación al backoffice de constancia nueva y confirmación al cliente —
      `payments/service.ts:56-58`
- [x] Un pedido rechazado puede volver a verificación con una constancia nueva
- [ ] **Historial de cambios de estado con timestamp y autor**: solo existe para la aprobación del
      pago. Los cambios de fulfillment no dejan rastro de quién los hizo
- [ ] Caducidad de pedidos `pendiente_pago` abandonados
- [ ] Reembolsos totales y parciales
- [ ] Conciliación diaria: pedidos aprobados vs. movimientos reales de la cuenta Yape
- [ ] Reporte exportable para el contador

### 6.2 Preparación para pasarela futura

Decisión tomada: **no se integra pasarela en este ciclo, pero se prepara la arquitectura.**

- [ ] Abstraer el proveedor de pago tras una interfaz, de modo que "constancia manual" sea una
      implementación más y no el único camino cableado
- [ ] Estados de pago revisados para admitir los de una pasarela (`autorizado`, `expirado`,
      `reembolsado`) sin romper los existentes
- [ ] Tabla de eventos de pago con `event_id` único, lista para idempotencia de webhooks
- [ ] Documentado el contrato que tendrá que cumplir el webhook cuando llegue: firma verificada,
      monto y moneda contrastados contra la orden, respuesta 200 rápida, endpoint fuera del
      middleware de autenticación

---

## 7. Backoffice

### 7.1 Acceso y seguridad

- [x] `noindex, nofollow` en el backoffice — `artifacts/antropic-admin/index.html:7`
- [x] Verificación de rol en el servidor en cada petición, no solo ocultando botones —
      `requireRole` en `lib/auth.ts:127`
- [x] Roles diferenciados con acceso gestionado desde el panel — `pages/Users.tsx`
- [ ] 2FA obligatorio para cuentas administrativas
- [ ] **Registro de auditoría inmutable** (quién cambió qué, cuándo, desde qué IP). Hoy solo se
      audita la aprobación de pago. Cambios de precio, de stock y de configuración no dejan rastro
- [ ] Cierre de sesión automático por inactividad
- [ ] Rate limiting en el login administrativo

### 7.2 Funcionalidad

- [x] Catálogo: productos, variantes con SKU y stock propios, medios, categorías, ocasiones
- [x] Pedidos con listado, detalle y cambio de estado — `pages/Orders.tsx`
- [x] Inventario con importación CSV — `pages/Inventory.tsx`
- [x] Cupones — `pages/Coupons.tsx`
- [x] Envíos y devoluciones — `pages/Shipments.tsx`, `pages/Returns.tsx`
- [x] Reportes con exportación — `pages/Reports.tsx`
- [x] Configuración de contenido de tienda sin tocar código — `pages/Config.tsx`
- [x] Alertas de stock — tabla `stock_alerts`
- [ ] Ajuste manual de stock con motivo obligatorio registrado en auditoría
- [ ] Panel del Libro de Reclamaciones (bloqueado por §2.1)
- [ ] Cumplimiento de solicitudes ARCOP desde el panel (bloqueado por §2.2)
- [ ] Impresión de packing slip o etiqueta
- [ ] Manual de uso para el equipo del cliente
- [ ] Verificado que funciona bien en celular — el dueño revisará pedidos desde el teléfono

---

## 8. SEO, analítica y correo

### 8.1 SEO — el hueco más grande del frontend

La tienda es una SPA con un `index.html` estático: **las 12 rutas comparten un único `<title>`**
("ANTROPIC Store") y una única descripción. Un producto compartido a WhatsApp se ve como la home.

- [x] `robots` correcto en el backoffice (`noindex, nofollow`)
- [x] Open Graph y Twitter Card presentes a nivel de sitio — `index.html:9-13`
- [ ] Meta título y descripción dinámicos por ruta
- [ ] `sitemap.xml` generado incluyendo productos
- [ ] `robots.txt` bloqueando carrito, checkout y cuenta
- [ ] URLs canónicas
- [ ] JSON-LD: `Product`, `Offer`, `BreadcrumbList`, `Organization`
- [ ] Google Search Console verificado
- `n/a` Vistas previas ricas en WhatsApp/Instagram por producto — requieren HTML pre-renderizado;
  descartado por decisión de alcance

### 8.2 Analítica

- [ ] GA4 configurado y disparándose solo tras consentimiento (bloqueado por §2.2)
- [ ] Eventos de ecommerce: `view_item`, `add_to_cart`, `begin_checkout`, `purchase`

### 8.3 🔴 BLOQUEANTE — Entregabilidad de correo

Si esto falla, las confirmaciones caen en spam y explotan los reclamos.

- [x] Proveedor transaccional real (Resend), no SMTP casero — `lib/notify.ts`
- [x] Envío best-effort que no bloquea la respuesta de la petición — `payments/service.ts:56`
- [ ] **SPF, DKIM y DMARC** configurados en el dominio y verificados
- [ ] Remitente en dominio propio, no en Gmail
- [ ] Probado en Gmail, Outlook y Hotmail
- [ ] Plantillas completas: confirmación, pago recibido, enviado, entregado, hoja de reclamación
- [ ] Reintentos con backoff — hoy un fallo de Resend se pierde en silencio

---

## 9. Ingeniería y estándares

### 9.1 Lo que ya cumple

- [x] **Cero `any`** en código de producción (verificado en todo `artifacts` y `lib`)
- [x] Tipos compartidos entre front y back generados desde una única fuente
      (`openapi.yaml` → Orval → `api-zod` + `api-client-react`), no duplicados a mano
- [x] Validación de entrada con esquemas Zod generados del contrato
- [x] Lógica de negocio fuera de los componentes: precios y totales viven en el servicio del
      servidor, no en React
- [x] Un único lugar donde se calcula el total — `checkout/service.ts`
- [x] Logging estructurado en JSON con id de petición — `lib/logger.ts`, `app.ts:14`
- [x] Manejo centralizado de errores — `app.ts:44`
- [x] Montos en céntimos, nunca coma flotante — `lib/money.ts`
- [x] Enums de estado definidos en la base — `schema/enums.ts`
- [x] Convención de nombres consistente y `created_at`/`updated_at` vía helper — `schema/helpers.ts`
- [x] CI bloqueante con typecheck y build

### 9.2 🔴 BLOQUEANTE — Testing

**No hay ni un solo test en el repositorio. No hay runner configurado.**

Esto no es solo una brecha de calidad: hace **imposible** producir la evidencia de auditoría de §11.
Sin tests no se puede demostrar que RLS funciona, que el webhook (futuro) es idempotente, ni que dos
compras simultáneas de la última unidad se resuelven bien.

Prioridad: cobertura total de lo que mueve dinero, sin exigencia en componentes visuales.

- [ ] Runner configurado (vitest) y añadido al pipeline como bloqueante
- [ ] Unitarias de dominio: totales, envío, cupones, transiciones de estado, conversión de céntimos
- [ ] **Prueba de concurrencia de stock**: dos aprobaciones simultáneas de la última unidad; solo una
      debe completarse. El código ya está escrito para ganar este test — falta demostrarlo
- [ ] **Prueba de RLS**: leer pedidos de otro usuario con la anon key **debe fallar**
- [ ] Integración de la cola de verificación: aprobar dos veces, aprobar un pedido ya pagado,
      rechazar y volver a subir constancia
- [ ] E2E con Playwright: navegar → carrito → checkout → constancia → aprobación → pedido pagado
- [ ] Pruebas contra base de datos efímera, nunca contra desarrollo compartido ni producción
- [ ] Cada bug de producción incorpora un test que lo reproduce

### 9.3 Base de datos

- [x] Convención consistente: plural, `snake_case`, `<tabla>_id`
- [x] Claves foráneas declaradas
- [x] Enums en la base, no texto libre
- [x] Índices justificados por consultas reales, incluido un índice parcial
- [x] Diagrama entidad-relación versionado — `docs/negocio/DATABASE-SCHEMA.dbml`
- [x] Script de seed idempotente — `scripts`
- [ ] **Migraciones versionadas.** Hoy es `drizzle-kit push`, sin historial ni rollback. Con una sola
      base de desarrollo se aguanta; con local + staging + producción es una fuente garantizada de
      divergencia. Es el cambio estructural más importante antes de tener entornos separados
- [ ] Restricciones `CHECK` en la base (precios ≥ 0, cantidades > 0), no solo en la aplicación
- [ ] Borrado lógico en productos y clientes; prohibición física de borrar pedidos

### 9.4 Herramientas y entornos

- [ ] ESLint configurado (hay directivas `eslint-disable` en el código pero no hay configuración)
- [ ] Prettier con configuración única
- [ ] Husky + lint-staged
- [ ] Detección de código muerto y dependencias huérfanas (`knip`)
- [ ] Tres entornos reales con bases separadas: local, staging, producción
- [ ] Staging con datos anonimizados, nunca con datos reales de clientes
- [ ] Escaneo de secretos en cada PR (gitleaks como Action)
- [ ] `pnpm audit` en el pipeline
- [ ] Rollback probado y documentado paso a paso

### 9.5 Accesibilidad

- [x] Primitivas de UI basadas en Radix, que traen semántica y foco correctos de base
- [ ] Auditoría con `axe` integrada en E2E
- [ ] Checkout completable solo con teclado
- [ ] Contraste WCAG AA verificado, incluido el estado deshabilitado
- [ ] Sin información transmitida solo por color
- [ ] `prefers-reduced-motion` respetado

---

## 10. Preparación para el clon

Sección que el documento original no contempla y que aquí es central: Antropic es la implementación
de referencia y va a ser forkeada a una segunda marca con repo y base de datos separados.

**Regla:** todo lo que se vaya a duplicar debe ser configuración antes del fork. Lo que quede
hardcodeado se convierte en una cacería de find-replace en cada clon, y en deuda que se paga dos
veces.

- [ ] Inventario completo de identidad de marca: qué es configuración y qué está en el código
- [ ] Identidad movida a `settings` o a tokens: nombre, logo, favicon, meta, colores
- [ ] Textos de interfaz centralizados en un módulo, no dispersos en componentes
- [ ] Plantillas de correo parametrizadas por marca
- [ ] Textos legales como contenido editable, no como JSX
- [ ] `.env.example` documentado variable por variable, con su propósito
- [ ] Procedimiento de fork documentado: qué se cambia, en qué orden, cómo se verifica
- [ ] Decidido si el historial se purga al crear el repo del clon (ver §1.2)

---

## 11. Evidencia entregable

Un checklist no es una auditoría. Esto es lo que convierte lo anterior en evidencia. **Todo está
pendiente**, y la mayor parte está bloqueada por §9.2 (no hay tests).

- [ ] Reporte de cobertura de pruebas
- [ ] Reporte de la suite E2E pasando
- [ ] Reporte de Lighthouse móvil de home, categoría, producto y checkout
- [ ] Resultado del escaneo de secretos y del audit de dependencias
- [ ] Evidencia de la prueba de RLS fallando correctamente con la anon key
- [ ] Evidencia de la prueba de concurrencia de stock
- [ ] Reporte de conciliación de un día real: pedidos aprobados vs. movimientos Yape
- [ ] Evidencia de una restauración de respaldo ejecutada de verdad
- [ ] Constancia de inscripción del banco de datos ante la ANPD
- [ ] Revisión legal firmada por un abogado
- [ ] Revisión de seguridad por alguien externo

---

## 12. Preguntas abiertas

Actualizadas respecto al documento original, descartando las que ya tienen respuesta en el código.

1. **¿Quién responde los reclamos dentro del plazo legal?** El sistema puede estar perfecto y aun así
   hay multa si nadie contesta en 30 días.
2. **¿Está inscrito el banco de datos ante la ANPD?** Es trámite, no código, y se olvida hasta la
   fiscalización.
3. **¿Los precios del catálogo incluyen IGV?** Bloquea §2.4 entera y afecta a todos los totales ya
   calculados.
4. **¿El checkout debe permitir invitados?** Hoy exige cuenta (`orders.user_id` es `NOT NULL`).
   Cambiarlo después del clon es tocar el esquema en dos bases.
5. **¿Quién concilia los Yape recibidos contra los pedidos aprobados, y con qué frecuencia?** Es el
   punto ciego del flujo manual: un pedido aprobado por error no lo detecta nadie.
6. **¿El stock de la web es el mismo que el de la tienda física?** Si sí, quién actualiza qué y cada
   cuánto.
7. **¿Qué courier y cómo se calcula el envío a provincias?**
8. **¿Qué pasa si el producto llega dañado?** Definir la política antes de que ocurra.
9. **¿Quién carga productos y fotos?** Un catálogo pobre hunde el lanzamiento más que cualquier bug.
10. **¿Hay presupuesto mensual de infraestructura?** Supabase de pago, hosting, Resend y facturación
    electrónica suman, y el plan gratuito de Supabase no es viable en producción.
11. **¿Quién mantiene el sitio después de la entrega?**

---

**Última revisión de código:** 2026-08-17 · **Normativa citada:** vigente a agosto de 2026.
Verificar cada punto legal con un abogado antes de lanzar.
