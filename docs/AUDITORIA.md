# Auditoría pre-lanzamiento — Antropic

Adaptación del checklist genérico de ecommerce Perú al stack **real** de este repositorio.

**Stack real:** Vite + React (SPA) · Express 5 · Drizzle sobre `pg.Pool` · Supabase (solo Auth y
Storage) · Resend · verificación manual de Yape/Plin.

**Última actualización:** 2026-08-25 (Fase 7b — SEO y rendimiento). Todo ítem marcado `[x]` se verificó leyendo el código —o
ejecutándolo, cuando la sección lo indica— y cita el archivo que lo respalda. Los ítems sin cita no
se verificaron.

> **Convención:** `[x]` hecho y verificado · `[~]` parcial · `[ ]` pendiente · `n/a` no aplica a
> este stack (con la razón).
> Los ítems **🔴 BLOQUEANTE** no deben lanzarse sin resolver.
> Los **⚖️ LEGAL** requieren validación de un abogado o contador peruano. Este documento es
> orientativo, no asesoría legal.

---

## Estado del proyecto — empieza por aquí

Resumen ejecutivo para retomar el trabajo sin leer el documento entero. El detalle de cada punto
está en su sección; la evidencia de ejecución, en §11.

### Hecho (fases 0–7b)

| Fase | Qué entregó | Dónde |
|---|---|---|
| **0** | Este documento: checklist traducido al stack real, con estado y decisiones de alcance | `docs/AUDITORIA.md` |
| **1** | Endurecimiento de la API: allowlist CORS, helmet, rate limiting por niveles, contrato de entorno validado al arranque | §3.1 · `lib/env.ts`, `lib/rate-limit.ts`, `app.ts` |
| **2** | Libro de Reclamaciones completo, textos legales editables, registro de consentimiento | §2.1, §2.2 · `modules/complaints`, `modules/consents` |
| **3** | 35 pruebas unitarias + 19 de integración, bloqueantes en CI | §9.2 · `*.test.ts`, `*.integration.test.ts` |
| **4** | Clonabilidad: identidad de marca como dato en `lib/brand`, `<head>` y manifest generados, procedimiento de fork y prueba que impide que la marca vuelva al código | §1.3, §10 · `lib/brand`, `docs/CLONACION.md` |
| **5** | Migraciones versionadas: línea base commiteada, CI construye la base replicando migraciones, y recuperación de bases preexistentes sin recrearlas | §9.3 · `lib/db/drizzle/`, `scripts/src/baseline-migrations.ts` |
| **6** | Arquitectura de pagos: transacción de liquidación agnóstica de proveedor, interfaz `PaymentProvider`, `payment_events` con idempotencia de webhooks, estados ampliados y caducidad de pedidos abandonados | §6.2 · `docs/PAGOS.md`, `modules/payments/settlement.ts` |
| **7** | Observabilidad: outbox de notificaciones con reintentos y visibilidad en el panel, id de petición extremo a extremo, `/readyz` que sí comprueba la base, pantalla de Operaciones y `ErrorBoundary` en las dos SPA | §5, §8.3 · `docs/OBSERVABILIDAD.md`, `modules/notifications/outbox.ts` |
| **7b** | SEO y rendimiento: metadatos y canónicas por ruta, `robots.txt` y `sitemap.xml` generados, JSON-LD, code-splitting por ruta y presupuesto de tamaño que falla el build | §4, §8.1 · `docs/SEO.md`, `src/lib/seo.ts`, `modules/seo/` |

> **Fusión:** todas las fases hasta la 7 están en `main` (PR #5 la fase 6, PR #6 la fase 7, en
> ese orden y con merge commit para no reescribir la base sobre la que estaba construida la 7).
> `main` vuelve a ser la verdad del proyecto.

**Tres defectos reales encontrados al ejecutar** (no al compilar), todos corregidos: el `skip` de
`/healthz` que no exentaba nada; `writeLimiter` como instancia única compartida por seis rutas; y
`toCents` aceptando entradas que no son dinero. Detalle en §11.1–§11.3.

En la Fase 4 apareció un cuarto, del mismo tipo: la búsqueda de pedidos del backoffice usaba
`parseInt` sobre el término, de modo que `"12abc"` resolvía silenciosamente al pedido 12. Detalle
en §11.4.

Y un quinto en la Fase 6: la guarda de idempotencia de webhooks leía `.code` del error capturado,
pero drizzle envuelve el error del driver y deja el código de Postgres en `.cause`, así que la
guarda **nunca se disparaba**. Compilaba, tenía buena pinta y era inerte. Detalle en §11.6.

Y un sexto en la Fase 7b, del mismo tipo exacto: el plugin de marca leía
`process.env.VITE_PUBLIC_SITE_URL` para generar el `robots.txt`, pero Vite carga los `.env` en
**su** entorno resuelto y nunca en `process.env`. El build salía con el origen dentro del
bundle y un `robots.txt` que decía «sin origen configurado» — es decir, `Disallow: /` sobre una
tienda perfectamente configurada. Compilaba, pasaba typecheck y solo se vio al mirar el archivo
generado. Detalle en §11.8.

La Fase 7 no encontró un sexto defecto de ese tipo en el código existente, pero sí lo encontró en
**una prueba recién escrita**: un caso llamado «se registra como fallido cuando el correo no está
configurado» no comprobaba eso en absoluto —el módulo de entorno se lee una vez al importar y no
se puede reconfigurar a mitad del proceso— sino un 401 cualquiera. Pasaba en verde y mentía sobre
qué estaba cubierto. Se partió en dos: el caso real vive ahora en `lib/notify.test.ts`, donde el
módulo de entorno sí se puede sustituir. Detalle en §11.7.

### Antes de desplegar lo ya hecho

> Esta lista, con el porqué de cada punto y el orden recomendado, está desarrollada en
> **`docs/ANTES-DE-SEGUIR.md`**. Empieza por ahí antes de abrir la Fase 8: incluye el aviso sobre
> el orden de fusión de las ramas 6 y 7, que es lo único de esta lista que empeora solo con el
> tiempo.

1. **Aplicar migraciones**: las tablas `complaints`, `consents`, `payment_events` y
   `notification_deliveries` no existen en ningún entorno todavía. En una base **creada antes de la Fase 5** hay que marcarle la línea base una sola vez
   —tiene las tablas viejas pero no el registro de migraciones, y `migrate` fallaría intentando
   recrearlas—; en una base nueva basta el segundo comando:
   ```
   pnpm --filter @workspace/scripts run baseline-migrations   # solo si la base ya existía
   pnpm --filter @workspace/db run migrate
   ```
2. **Rellenar identidad del proveedor** (razón social, RUC, domicilio) en el panel → pestaña Legal.
   Sin eso la Hoja de Reclamación sale sin identificación del proveedor y no cumple.
3. **`CORS_ORIGINS` es obligatoria en producción**: la API no arranca sin ella, a propósito.
4. **Programar `expire-orders`** (Fase 6): sin un scheduler que lo invoque, los pedidos
   abandonados se quedan en `pendiente_pago` para siempre. Comando en `docs/PAGOS.md` §4.
5. **Programar `retry-notifications`** (Fase 7), cada 5 minutos: sin él, un correo que falle una
   vez se queda en la cola. Comando en `docs/OBSERVABILIDAD.md` §4.
6. **Apuntar el monitor de uptime a `/api/readyz`, no a `/api/healthz`** (Fase 7). El primero
   comprueba la base y devuelve 503 cuando no responde; el segundo solo dice que el proceso está
   vivo, a propósito.

### Pendiente, en el orden que recomiendo

| # | Fase | Por qué en este orden |
|---|---|---|
| 1 | **8 · IGV y base fiscal** | Bloqueada por la confirmación del contador (§2.4). Es el último cambio de esquema que se encarece de verdad con el clon: toca catálogo, pedidos y líneas, y reinterpreta totales ya guardados |
| 2 | **9 · Checkout de invitado** | Modelo ya decidido (§1.4). Va al final justo porque **no** es un acantilado de esquema: el perfil de invitado no obliga a migrar nada, así que cuesta lo mismo antes o después del fork |

La **7b (SEO y rendimiento) está hecha** (§4, §8.1, `docs/SEO.md`). Deja dos cosas abiertas que
no son código y sin las cuales no sirve de nada: **publicar el dominio en `brand.siteUrl`** —
con `null` la tienda es deliberadamente no indexable— y **reescribir `/sitemap.xml` hacia la
API** en el borde.

### Bloqueado por decisiones o trámites tuyos, no por código

- **Textos legales redactados por abogado.** El mecanismo está listo; el contenido no. Mientras
  estén vacíos, la tienda dice que el documento no ha sido publicado — es deliberado.
- **Inscripción del banco de datos ante la ANPD.** Trámite, infracción grave si falta.
- **¿La empresa es afecta a IGV?** El modelo de almacenamiento ya está decidido (§2.4: bruto en el
  catálogo, snapshot fiscal congelado en el pedido). Lo que falta es que **el contador confirme el
  régimen tributario**; sin eso no se escribe el cálculo. Es lo único pendiente que sí se encarece
  con el clon, porque toca `products`, `orders`, `order_items` y todos los totales ya guardados.
- **¿Quién responde los reclamos dentro de los 30 días?** El sistema avisa; alguien tiene que
  contestar.
- **Prueba de RLS**: la sonda está escrita y sin ejecutar (`pnpm --filter @workspace/scripts run
  verify-rls`). Necesita credenciales del proyecto Supabase real. **Es probable que salga roja.**

### Recomendaciones

- **Protege `main`** (§1.1): sin eso, el CI bloqueante que se montó en la Fase 3 se puede saltar
  con un push directo.
- **Ejecuta la sonda de RLS pronto.** Es el hueco de seguridad con mayor impacto potencial y el
  único que no se puede cerrar desde el código de la aplicación.
- **El clon arranca sin historial** (§1.2): `git clone --depth 1`, así `localhost.har` no viaja.
  No hay credenciales dentro, pero son 5,5 MB de peso muerto. Procedimiento en `docs/CLONACION.md`.

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
| §10.4 Migraciones con Supabase CLI | `n/a` como está escrito. Aquí son migraciones de `drizzle-kit`, versionadas en `lib/db/drizzle/` y aplicadas con `migrate` — ver §9.3 |
| §10.2 `supabase gen types typescript` | Sustituido por codegen desde `lib/api-spec/openapi.yaml` (Orval), que cumple el mismo objetivo |
| §12 pregunta 8 ("¿qué pasa con Yape manual?") | No es una pregunta abierta: **es la arquitectura de pagos vigente** |

### 0.2 Decisiones de alcance tomadas

- **Pagos:** no se integra pasarela en este ciclo. Se prepara la arquitectura para que el flujo
  manual y una pasarela futura convivan tras la misma máquina de estados.
- **Clonación:** la segunda marca será **repo separado y base de datos separada**. Prioridad: sacar
  toda la identidad de marca a configuración antes del fork.
- **SEO:** meta dinámicos por ruta + `sitemap.xml` + JSON-LD, **sin** migrar a SSR. Consecuencia
  aceptada: las vistas previas de WhatsApp e Instagram no renderizarán por producto.
- **IGV:** precio bruto en el catálogo y snapshot fiscal congelado en el pedido, no derivación en
  tiempo de lectura. Detalle y motivo en §2.4.
- **Invitados:** perfil de invitado sin cuenta de autenticación, no `user_id` nullable. Decidido
  ahora, implementado más tarde. Detalle y motivo en §1.4.

---

## 1. Repositorio y rebranding

### 1.1 Higiene del repositorio

- [x] `.gitignore` cubre `.env`, `node_modules`, `dist`, `.DS_Store` y `*.har` — `.gitignore`
- [x] `README.md` con requisitos, instalación, variables y comandos
- [x] GitHub Actions con typecheck + build en cada PR — `.github/workflows/ci.yml`
- [x] Licencia acordada — `LICENSE`
- [ ] `main` protegida: sin push directo, PR obligatorio
- [x] Dependabot activado — `.github/dependabot.yml`, agrupado y semanal (npm) y mensual
      (actions). Las actualizaciones de seguridad llegan sin agrupar, a propósito
- [ ] Rama de staging y despliegue automático por entorno

### 1.2 🔴 BLOQUEANTE — Secretos en el historial

**Hallazgo:** `localhost.har` estuvo commiteado en `b63ae08` y se destrackeó en `60182a6`. **Sigue
en el historial** (5.5 MB).

- [x] Historial inspeccionado en busca de credenciales en el HAR: **sin JWTs, sin cabeceras
      `authorization`/`cookie`, sin hosts de Supabase**. Es una captura de assets de localhost. No
      hay fuga de credenciales que obligue a rotar llaves por este motivo
- [x] Sin secretos en el código fuente: `service_role` solo aparece como nombre de variable de
      entorno leída en servidor — `lib/auth-admin.ts:7`, `lib/storage.ts:11`
- [x] `.env.example` presente en raíz y por artefacto, documentado variable por variable
- [ ] Escaneo formal con `gitleaks detect` o `trufflehog` sobre el historial completo
- [x] Decidido qué se hace con el HAR al clonar: el repo del clon arranca de un
      `git clone --depth 1` sin historial, así que el peso muerto no viaja. La alternativa con
      `git filter-repo`, para quien quiera conservar el historial, está en `docs/CLONACION.md` §1
- [ ] Decidido si se purga del historial **de este** repositorio o se acepta el peso muerto
- [ ] Rotación de secretos programada y documentada

### 1.3 Rebranding — dónde vive la marca

Esta sección es la que determina si el clon es un cambio de configuración o una cacería.

**Cerrada en la Fase 4.** La identidad de marca es un dato en `lib/brand/src/brand.ts` y una
prueba en CI impide que vuelva al código. El procedimiento completo está en `docs/CLONACION.md`;
la evidencia de ejecución, en §11.4.

- [x] Colores de marca centralizados: solo quedan 4 hex arbitrarios en el storefront y son del
      logo de Google (`#4285F4`, `#EA4335`, `#FBBC05`, `#34A853`). La *gotcha* histórica de dos
      fuentes de verdad para el color está resuelta
- [x] Contenido de tienda ya editable desde el backoffice vía tabla `settings`: banners, hero,
      editorial, FAQ, contacto, anuncio, política de devoluciones, umbral de envío gratis
- [x] Nombre de marca, tagline y zona de reparto salen de `lib/brand`: navbar, pie, login de la
      tienda, barra lateral y login del backoffice, placeholders de `/config`, copy del checkout
- [x] `<title>`, descripción, Open Graph, Twitter Card, favicon, `apple-touch-icon` y
      `theme-color` inyectados en el `<head>` desde `lib/brand` por `brandHtmlPlugin`. Los dos
      `index.html` ya no contienen identidad: una segunda copia del nombre en un archivo
      estático es una segunda cosa que olvidar al clonar
- [x] `manifest.webmanifest` generado en build y servido en desarrollo — antes no existía
- [x] Plantillas de correo transaccional parametrizadas: membrete, color de cabecera, firma y
      referencia del pedido salen de `lib/brand`
- [x] Prefijo de la referencia de pedido (`ANT-`) es configuración, y la construcción y el
      parseo comparten la misma fuente — `orderReference` / `parseOrderReference`
- [~] Remitente de los correos: `RESEND_FROM` está documentado variable a variable en
      `.env.example`, incluida la obligación de que su nombre visible coincida con la marca.
      **SPF, DKIM y DMARC siguen pendientes** (§8.3), y son de infraestructura, no de código
- [x] Textos legales: ya son configuración editable desde el panel, no JSX — listo para el clon
- [x] Metadatos del backoffice: título de pestaña y wordmark del login toman el nombre de marca
- [~] Textos de interfaz genéricos: siguen en los componentes. **Decisión de alcance**, no deuda
      pendiente: la segunda marca también es una tienda de moda peruana en español, así que
      "Agregar al carrito" o "Finalizar compra" son idénticos en las dos. Extraerlos a un módulo
      de cadenas sería un cambio mecánico enorme sin ningún beneficio para el clon. Lo que sí
      cambia entre marcas se sacó, y una prueba lo mantiene fuera
- [ ] Descriptor de estado de cuenta de tarjeta — pendiente hasta que haya pasarela
- [ ] Assets de imagen por marca: `favicon.png`, `apple-touch-icon.png`, `opengraph.jpg` y la
      fotografía de `src/assets/` siguen siendo los de Antropic. Las rutas ya son configuración;
      **los archivos los tiene que aportar el diseño de la marca nueva**

### 1.4 UX que impacta conversión

- [x] Carrito persistente entre sesiones: `localStorage` como invitado, fusión al servidor en el
      login — `StoreContext.tsx`
- [x] Búsqueda con overlay y página dedicada — `SearchOverlay.tsx`, `pages/Search.tsx`
- [x] Filtros por categoría — `CategoryPills.tsx`
- [x] Costo de envío calculado en servidor antes de confirmar — `checkout/service.ts:35`
- [~] Checkout como invitado: **hoy exige cuenta** (`orders` tiene `user_id NOT NULL`). Modelo
      decidido y **aplazado a propósito** — ver la nota al final de esta sección
- [ ] Indicador de progreso en el checkout
- [ ] Guía de tallas
- [ ] Stock visible tipo "últimas 3 unidades"
- [ ] Contraste WCAG AA verificado
- [ ] Navegación por teclado en el checkout verificada
- [ ] Verificado en móvil real, no solo en el inspector

#### Checkout como invitado — decisión tomada (agosto 2026)

**Modelo elegido: perfil de invitado.** Se crea una fila en `profiles` sin cuenta de Supabase
detrás. `orders.user_id` sigue siendo `NOT NULL`.

**Se descartó hacer `user_id` nullable**, que parece el cambio pequeño y es el caro. Hay **cinco
`innerJoin(profiles, eq(orders.userId, profiles.id))`** en el código —entre ellos la cola de
verificación de pagos (`payments/queries.ts`) y el listado de pedidos del backoffice—, y un
`INNER JOIN` sobre un nulo **no devuelve la fila**: un pedido de invitado que suba su constancia
sería invisible para quien tiene que aprobarla. Además `coupon_redemptions.user_id`,
`return_tickets.user_id` y `carts.user_id` son todos `NOT NULL`, así que un invitado no podría
usar cupón, abrir una devolución ni tener carrito de servidor. El coste no está en la migración:
está repartido para siempre en cada consulta que alguien escriba después.

El perfil de invitado **es casi gratis en este esquema** porque `profiles` no tiene ninguna FK a
`auth.users` (verificado: cero coincidencias de `auth.users` en `lib/db/drizzle/0000_initial_schema.sql`).
Una fila de perfil puede existir sin cuenta de autenticación, así que los cinco joins siguen
funcionando sin tocarse.

**Por qué se aplaza, y por qué eso NO contradice la regla del clon:** al no necesitar cambio de
esquema, esta decisión no se encarece con el fork. Es la diferencia con el IGV (§2.4), que sí es un
acantilado. Y hay una razón de negocio para no correr: el pago no se completa en una sola visita
—el cliente se va a Yape y **tiene que volver a subir la constancia**—, así que un invitado
necesita un camino de vuelta por correo con enlace firmado. Parte de la fricción que se ahorra al
no pedir registro se devuelve ahí. En esta tienda la cuenta no es solo un peaje: es el mecanismo
por el que el cliente reencuentra su pedido.

Lo que costará cuando se haga: enlazar por correo el perfil de invitado con la cuenta que ese mismo
correo cree después (si no, los pedidos quedan huérfanos), y reutilizar el perfil existente en la
segunda compra — `profiles.email` **no** tiene constraint `UNIQUE` hoy.

---

## 2. ⚖️ LEGAL — Cumplimiento peruano

> Todo este bloque necesita validación de abogado. Es el área con mayor exposición y menor avance.

### 2.1 🔴 BLOQUEANTE — Libro de Reclamaciones Virtual

**Implementado en la Fase 2.** Módulo completo: tabla `complaints`, endpoint público, página en la
tienda, correo de constancia y panel en el backoffice. Verificado en ejecución contra Postgres — la
evidencia está en §11.2.

Base normativa: Ley N° 29571 reglamentada por D.S. N° 011-2011-PCM, modificada por la Ley N° 32495
(noviembre 2025) para incluir explícitamente a las plataformas digitales de comercio electrónico.

- [x] Enlace visible de forma permanente en el footer de todas las páginas, con su propia columna
      "Legal" — `Footer.tsx`
- [x] Formulario con los datos mínimos, en `/libro-de-reclamaciones`. Cada campo de la tabla existe
      porque el reglamento lo exige, no por diseño de producto — `schema/complaints.ts`
- [x] **Accesible sin cuenta.** El endpoint usa `optionalAuth`, no `requireAuth`: exigir registro
      para reclamar sería en sí mismo una obstrucción del derecho a reclamar
- [x] Distinción entre **reclamo** y **queja**, explicada en el formulario y separada en el enum de
      la base, no como texto libre
- [x] Identificación del proveedor (razón social, RUC, domicilio) impresa en cada hoja, tomada de
      `settings` y no almacenada por fila, para que un cambio de domicilio no reescriba el historial
- [x] Validación de menor de edad: declarar un menor sin nombrar al padre, madre o tutor devuelve
      422 `GUARDIAN_REQUIRED`. Se valida en el servidor, porque una casilla de formulario no es un
      control legal
- [x] Hoja de Reclamación enviada automáticamente por correo como constancia, reproduciendo las
      cuatro secciones del formato oficial — `notifications/templates.ts`. Se imprime desde el
      cliente de correo; no se genera PDF
- [x] Correlativo único por hoja (`LR-000001`), derivado de un `serial` para que la secuencia tenga
      una sola fuente de verdad
- [x] **No existe forma de borrar un reclamo.** No hay endpoint DELETE ni consulta de borrado en
      todo el módulo, y así debe seguir: `cerrado` es como termina un expediente, no su eliminación.
      La conservación efectiva a 2 años depende además de la política de respaldos (§3.5)
- [x] Los datos del reclamo **no** alimentan newsletter ni CRM: viven en su propia tabla, sin
      relación con la de consentimientos de marketing, y el formulario lo dice explícitamente
- [x] Panel en el backoffice con estado y plazo restante, ordenado por urgencia legal: abiertos
      primero, vencimiento más cercano arriba, vencidos marcados en rojo — `pages/Complaints.tsx`
- [~] Proceso interno para responder en 30 días calendario: el sistema calcula, muestra y ordena por
      el plazo, pero **el proceso y la persona que responde son decisión del negocio**
- [ ] Responsable asignado en el negocio — trámite organizativo, no código

Referencia de sanción: hasta 200 UIT por incumplir lo ofrecido en el reclamo; una denuncia formal
puede ir de amonestación hasta 450 UIT.

### 2.2 🔴 BLOQUEANTE — Protección de datos (Ley 29733 + D.S. 016-2024-JUS)

El reglamento vigente desde el 30 de marzo de 2025 refuerza consentimiento, cookies, notificación de
brechas y obligaciones del DPO. Sanciones de 0.5 a 100 UIT.

**Mecanismo implementado en la Fase 2; el contenido legal y los trámites siguen pendientes.**
Existe el registro de consentimientos, el banner de cookies y las páginas legales. Lo que falta es
lo que no puede escribir un programador: los textos revisados por abogado y la inscripción ante la
ANPD.

- [x] Consentimiento **separado** por finalidad — tabla `consents`, una fila por propósito. Procesar
      el pedido y recibir marketing no comparten casilla ni registro
- [x] Casilla de marketing en el checkout que **nace desmarcada** — `Checkout.tsx`. Una casilla
      premarcada no es consentimiento bajo el reglamento, es una infracción
- [x] Consentimiento demostrable: fecha, hora, IP, user-agent y versión del texto aceptado. **La IP
      y el user-agent se toman de la petición, nunca del cuerpo** — verificado enviando una IP
      falsa en el JSON y comprobando que se ignora (§11.2)
- [x] Retirar el consentimiento escribe una fila nueva con `granted=false`; nunca un UPDATE. El
      derecho a retirar no significa nada si al ejercerlo se borra la prueba de que existió
- [x] La versión de los textos queda fijada en cada registro. Al publicar textos nuevos cambia la
      versión, el banner vuelve a preguntar y los consentimientos viejos no se arrastran
- [x] Banner de cookies con **rechazar tan visible como aceptar** — mismo tamaño, peso y jerarquía,
      más un panel para elegir por finalidad. Degradarlo es una regresión de cumplimiento, no de
      estilo — `components/CookieBanner.tsx`
- [x] Página de política de cookies, privacidad y términos, con el texto editable desde el panel
- [~] Scripts de terceros bloqueados hasta el consentimiento: **hoy no hay ninguno** (ni GA4 ni
      píxeles). Existe la compuerta `hasConsent()` en `lib/consent.ts` que el primero que se añada
      debe consultar antes de cargarse
- [ ] **Textos legales redactados y revisados por abogado.** El mecanismo está; el contenido no.
      Mientras estén vacíos la tienda dice que el documento no ha sido publicado — **a propósito**:
      un texto inventado que parezca una política real es peor que un hueco visible, porque el
      cliente confiaría en él y el negocio se creería cubierto
- [ ] Banco de datos personales inscrito ante la ANPD (trámite, no código; infracción grave si falta)
- [ ] Inscritos también los bancos internos: empleados, candidatos, proveedores
- [ ] Derechos ARCOP: canal de ejercicio y cumplimiento desde el backoffice
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
- [x] Razón social, RUC y domicilio fiscal visibles en el footer de todas las páginas, editables
      desde el panel (pestaña Legal) — `Footer.tsx`, `pages/Config.tsx`
- [~] Términos y condiciones de venta: la página `/terminos` existe y es editable; **falta el texto**
- [ ] Plazo de entrega informado
- [ ] Confirmado que los precios se muestran con IGV incluido (ver §2.4)

### 2.4 Facturación electrónica SUNAT

**Estado: no existe. Y no hay tratamiento de IGV en ninguna parte del código** — cero coincidencias
de `IGV` o `0.18` en todo el repositorio. Los precios son el valor plano del producto, sin
desagregación de impuesto.

#### Decisión de arquitectura tomada (agosto 2026)

La pregunta original de esta sección —«¿los precios incluyen IGV?»— estaba mal planteada. Para una
tienda B2C en Perú el lado de la **exhibición** no es una elección libre: el precio anunciado debe
ser el precio total que paga el consumidor. Lo que sí era una decisión de ingeniería es **cómo se
almacena**, y es lo que se decidió.

**Modelo elegido: precio bruto en el catálogo + snapshot fiscal congelado en el pedido.**

- `products.price` sigue siendo el precio final que ve el cliente. Cero cambios en la exhibición.
- Al **crear** el pedido se congelan `tax_rate`, `taxable_base` y `tax_amount` en `orders`, y el
  desglose por línea en `order_items`.

**El porqué, que es lo que no debe simplificarse después:** la tasa de impuesto es un dato
histórico, no una constante. Un comprobante emitido en marzo por un pedido de enero tiene que
llevar la tasa de enero. Si el desglose se deriva en tiempo de lectura, cambiar la tasa reescribe
en silencio el desglose de todos los pedidos pasados. Es el mismo principio que este esquema ya
aplica al cupón —«coupon code + amounts are snapshotted», `schema/orders.ts`— y por la misma razón.

Se descartó guardar el precio **neto** en el catálogo: obligaría a multiplicar en cada render de
cada precio en las dos SPA, y cualquier sitio que se olvide muestra un precio que incumple.

> **Invariante de redondeo — obligatorio.** Derivar la base y el impuesto por separado y redondear
> ambos descuadra el total por céntimos, que es el motivo clásico de rechazo de un comprobante. Se
> deriva **uno** y el otro sale por resta, sobre los enteros de céntimos que ya usa `lib/money.ts`:
>
> ```
> base_cents = round(bruto_cents * 100 / (100 + tasa))
> igv_cents  = bruto_cents - base_cents      // restado, NUNCA redondeado aparte
> ```
>
> Así `base + impuesto` es idénticamente igual al bruto por construcción, siempre.

#### ⚖️ Pendiente de confirmación del contador — bloquea la implementación

**¿La empresa es afecta a IGV?** Depende del régimen tributario, y de eso depende si hay algo que
desagregar. Este documento **no** asume la respuesta: la arquitectura de arriba está decidida, su
aplicabilidad no. Sin esa confirmación no se escribe el cálculo.

- [x] Definido el modelo de almacenamiento del IGV (bruto + snapshot fiscal en el pedido)
- [ ] Confirmado por el contador el régimen tributario y si la empresa es afecta a IGV
- [ ] Implementado el cálculo y las columnas fiscales (bloqueado por lo anterior)
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

**Cerrado en la Fase 1** salvo los dos últimos ítems. Cada punto se verificó ejecutando el servidor,
no solo compilándolo; la evidencia está en §11.1.

- [x] **Allowlist de CORS** por entorno vía `CORS_ORIGINS` — `app.ts`. Producción falla al arrancar
      si la lista no está puesta: un origen sin declarar es un error de configuración, no permiso
      para aceptar a todo el mundo. Desarrollo acepta cualquier puerto de localhost porque los
      servidores de dev reciben el puerto por línea de comandos. `credentials` queda en `false`:
      la autenticación es bearer en cabecera, nunca cookie, así que no hay autoridad ambiental que
      otro origen pueda aprovechar
- [x] **Cabeceras de seguridad** con helmet — `app.ts`. Verificadas en respuesta real:
      `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`,
      `Referrer-Policy`, `Cross-Origin-Opener-Policy`, `X-Frame-Options`, y `X-Powered-By`
      eliminado. Se sobrescribe un solo default: `crossOriginResourcePolicy` pasa a `cross-origin`
      porque `same-origin` (el default de helmet) impide a la tienda y al backoffice leer las
      respuestas al correr en otro origen
- [x] **Rate limiting en tres niveles** — `lib/rate-limit.ts`. Techo global de 600/5 min; 30/5 min
      en mutaciones de cliente (`/orders`, `/checkout`, `/returns`, `/stock-alerts`); 15/15 min en
      la creación de URLs firmadas, que es la que quema cuota de Supabase Storage. `/healthz` queda
      exento para no estrangular a los monitores de uptime. Las rutas de `/admin` se excluyen a
      propósito: el backoffice hace trabajo masivo legítimo y ya está detrás de un rol verificado
- [x] **Contrato de entorno único y validado al arranque** — `lib/env.ts`. Es el único módulo del
      servidor que lee `process.env`; los demás importan de él. Reporta **todos** los problemas de
      una vez en lugar de uno por reinicio. `SUPABASE_SERVICE_ROLE_KEY` pasa a ser obligatorio al
      arrancar: descubrir que falta cuando un admin pulsa "subir" es estrictamente peor que
      descubrirlo al iniciar
- [x] `TRUST_PROXY` explícito y documentado. Sin esto el rate limiting detrás de un proxy mete a
      todos los visitantes en un mismo cubo y un solo cliente ruidoso bloquea a todos; con `true`
      a ciegas, un atacante forja `X-Forwarded-For` y estrena cubo en cada petición
- [ ] Captcha o equivalente en formularios públicos
- [ ] Endpoints revisados uno por uno para IDOR

**Hallazgo lateral de la Fase 1:** `STORE_URL` se usaba en `modules/notifications/templates.ts` sin
estar documentada en ningún `.env.example`. Ya está en el contrato como opcional.

### 3.2 🔴 BLOQUEANTE — Supabase RLS

Aquí RLS no es el control principal, pero **PostgREST está expuesto sobre la misma base de datos**
y la anon key es pública por diseño. Sin RLS, cualquiera puede leer las tablas directamente sin
pasar por el Express.

- [ ] RLS habilitado en todas las tablas, verificado tabla por tabla
- [~] Probado con la anon key desde fuera de la app. **La sonda está escrita y sin ejecutar**:
      `pnpm --filter @workspace/scripts run verify-rls` interroga a PostgREST para saber qué tablas
      expone (en vez de partir de una lista fija, que se queda obsoleta en cuanto se añade una) y
      prueba cada una con la anon key. Sale con código 1 si alguna devuelve filas. Requiere
      credenciales del proyecto real, que no están disponibles en el entorno de desarrollo; hay que
      correrla contra Supabase y guardar la salida como evidencia
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
- [x] Liberación automática de stock si el pago no se completa — no aplica igual que en una
      pasarela (el stock no se reserva al crear la orden). Lo que sí faltaba, caducar los pedidos
      abandonados, se cerró en la Fase 6: job `expire-orders`, §6.1

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

**Cerrada en la Fase 7b** salvo lo que exige infraestructura o un móvil real.
`docs/SEO.md` §5 es la referencia; las cifras medidas, en §11.8.

- [x] Compresión y minificación por defecto de Vite en build de producción
- [x] Fuente única (Inter) con `display=swap` y `preconnect` — `index.html`
- [x] Code-splitting por ruta con `React.lazy` — `App.tsx`. La home se importa de forma ansiosa
      a propósito (es donde aterriza la mayoría); las otras 15 rutas salieron del paquete
      inicial. Carga inicial: **211,6 → 188,7 kB gzip**, y desaparece el aviso de Vite de
      chunks > 500 kB
- [x] Presupuesto de tamaño **que falla el build**, no un aviso —
      `artifacts/antropic-store/scripts/bundle-budget.mjs`, encadenado a `build` y por tanto
      bloqueante en CI. Mide el gzip de la carga inicial contra un tope de 225 kB e imprime el
      desglose por chunk, que es el análisis que pedía este ítem sin añadir una dependencia
      (`rollup-plugin-visualizer`) que solo corre a mano
- [x] Imágenes: `loading="lazy"` y `decoding="async"` salvo el *hero*, que es el elemento LCP y
      lleva `fetchPriority="high"`. CLS: los banners promocionales usaban `max-h-72`, que no
      reserva espacio hasta que la imagen llega — el contenido de abajo saltaba en cada carga
- [ ] Imágenes servidas desde CDN, no desde el origen — infraestructura. La imagen más pesada
      del repositorio pesa 1,25 MB
- [ ] Fuente autoalojada en vez de Google Fonts — mete binarios en `public/` y toca las dos
      SPA; se dejó fuera para no mezclarlo con esta revisión
- [ ] Objetivos medidos en campo: LCP < 2.5 s en 4G, INP < 200 ms, CLS < 0.1, TTFB < 600 ms —
      exige el sitio desplegado
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
- [~] Sentry o equivalente capturando errores de cliente y servidor — **la costura sí, el
      proveedor no**. `lib/observability.ts` concentra el reporte de errores del servidor y de
      los jobs, y cada SPA tiene su `ErrorBoundary` con su punto de enganche. No se montó el SDK
      porque no hay cuenta ni DSN y este entorno no puede ejercitarlo: una integración inerte es
      el defecto que esta auditoría lleva seis fases quitando. Ver `docs/OBSERVABILIDAD.md` §6
- [x] Sonda de disponibilidad que comprueba sus dependencias — `GET /api/readyz` devuelve 503
      con la base caída. Antes `/healthz` respondía 200 con Postgres apagado, así que un monitor
      habría reportado la tienda sana mientras cada petición devolvía 500 (§11.7)
- [ ] Monitor de uptime con alerta al responsable — servicio externo; apúntalo a `/api/readyz`
- [~] Dashboard operativo: pedidos por hora, tasa de aprobación, errores 5xx — pantalla
      **Operaciones** en el panel con la espera de la cola de verificación, la tasa de aprobación
      a 7 días y el estado del envío de correos. La tasa de 5xx queda fuera: contarla bien
      necesita un backend de métricas, y un contador en memoria mentiría con más de una instancia
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
- [x] **Historial de cambios de estado de pago con timestamp y autor** — tabla `payment_events`,
      append-only, visible en el panel (`GET /admin/orders/{id}/payment-events`). Antes el único
      rastro era `orders.approved_by`, que la siguiente decisión sobreescribía. Fase 6, §11.6
- [~] Historial de cambios de **fulfillment**: sigue sin autor. `payment_events` cubre el pago;
      preparación y envío necesitan su propia forma (no comparten idempotencia ni montos)
- [x] Caducidad de pedidos abandonados — job `expire-orders`, 72 h por defecto, sobre
      `pendiente_pago` y `rechazado`. **Nunca** sobre `en_verificacion`: ahí puede haber dinero
      real que nadie ha mirado. Fase 6, §11.6
- [ ] Reembolsos totales y parciales — el estado `reembolsado` y su transición existen; el
      endpoint y la decisión sobre si el stock vuelve al estante, no
- [ ] Conciliación diaria: pedidos aprobados vs. movimientos reales de la cuenta Yape
- [ ] Reporte exportable para el contador

### 6.2 Preparación para pasarela futura

Decisión tomada: **no se integra pasarela en este ciclo, pero se prepara la arquitectura.**

**Cerrada en la Fase 6.** El detalle completo está en `docs/PAGOS.md`; la evidencia, en §11.6.

- [x] Proveedor de pago tras una interfaz — `modules/payments/providers/`. La transacción
      crítica se extrajo a `settlement.ts`, agnóstica de proveedor, y `manual_yape` pasó a ser
      una implementación alcanzada por un registro `Record<PaymentMethod, PaymentProvider>` que
      **no compila** si se añade un método sin implementación. La columna
      `orders.payment_method` dice de quién es cada pedido en vez de dejarlo a deducción
- [x] Estados de pago ampliados con `autorizado`, `expirado` y `reembolsado`, con sus
      transiciones declaradas antes de que exista código que las produzca. Las prohibiciones
      existentes siguen intactas: no hay arista de `pendiente_pago` a `pagado`, y `pagado` solo
      sale hacia `reembolsado`
- [x] Tabla `payment_events` con `UNIQUE (provider, event_id) WHERE event_id IS NOT NULL`, y el
      insert **dentro** de la transacción que cambia el estado — separarlos es exactamente lo
      que deja que un webhook reintentado liquide dos veces
- [x] Contrato del webhook documentado — `docs/PAGOS.md` §5: firma verificada sobre el cuerpo
      crudo, monto y moneda contrastados contra el pedido, 200 rápido, ruta fuera de
      `requireAuth` con su propio rate limit, `event_id` obligatorio. **Sin endpoint todavía, a
      propósito:** una ruta pública que aún no verifica ninguna firma es una puerta abierta

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
- [x] Pantalla de **Operaciones**: espera real de la cola de verificación, tasa de aprobación y
      estado del envío de correos, con reintento manual de los que fallaron — `pages/Operations.tsx`
- [ ] Ajuste manual de stock con motivo obligatorio registrado en auditoría
- [ ] Panel del Libro de Reclamaciones (bloqueado por §2.1)
- [ ] Cumplimiento de solicitudes ARCOP desde el panel (bloqueado por §2.2)
- [ ] Impresión de packing slip o etiqueta
- [ ] Manual de uso para el equipo del cliente
- [ ] Verificado que funciona bien en celular — el dueño revisará pedidos desde el teléfono

---

## 8. SEO, analítica y correo

### 8.1 SEO — el hueco más grande del frontend

**Cerrada en la Fase 7b**, con una dependencia externa explícita: nada de esto se activa
hasta que el dominio esté decidido. `docs/SEO.md` es la referencia.

- [x] `robots` correcto en el backoffice (`noindex, nofollow`), ahora también con su propio
      `robots.txt` (`Disallow: /`): un rastreador que nunca pide la página tampoco lee su meta
- [x] Open Graph y Twitter Card presentes a nivel de sitio — inyectados desde `lib/brand`
- [x] Meta título y descripción dinámicos por ruta — `src/lib/seo.ts`, las 16 rutas
- [x] `sitemap.xml` generado incluyendo productos — `GET /api/sitemap.xml`, desde la base y no
      desde el build, porque el build congelaría la lista en el último despliegue
- [x] `robots.txt` bloqueando carrito, checkout, cuenta, favoritos, login y detalle de pedido —
      generado por el plugin de marca. `/libro-de-reclamaciones` queda fuera de la lista a
      propósito: la ley exige que sea accesible, así que que se encuentre es parte de cumplir
- [x] URLs canónicas, con la navegación por facetas canonicalizada (`docs/SEO.md` §2): la
      búsqueda con término va `noindex`, la categoría tiene canónica propia, y talla/color/
      orden canonicalizan hacia arriba en vez de acuñar una URL por combinación
- [x] JSON-LD: `Product`, `Offer`, `BreadcrumbList`, `Organization`, `WebSite` —
      `src/lib/structured-data.ts`. La disponibilidad del `Offer` sale del stock real
- [ ] 🔴 **Publicar el dominio en `brand.siteUrl`.** Con `null` la tienda es deliberadamente no
      indexable: `Disallow: /`, sin canónicas, sin JSON-LD y sitemap en 503. Es una línea, y
      hasta que se escriba nada de lo anterior tiene efecto
- [ ] Reescritura `/sitemap.xml → /api/sitemap.xml` en el borde. Sin ella el documento es
      correcto pero nadie lo pide, porque el `robots.txt` lo anuncia en el origen de la tienda
- [ ] Google Search Console verificado — trámite externo, requiere el dominio
- `n/a` Vistas previas ricas en WhatsApp/Instagram por producto — sus rastreadores no ejecutan
  JavaScript, así que los metadatos por ruta no las arreglan; requieren HTML pre-renderizado,
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
- [x] Reintentos con backoff — outbox `notification_deliveries` + job `retry-notifications`
      (1, 5, 15, 60, 240 min, seis intentos). `docs/OBSERVABILIDAD.md` §4
- [x] Un fallo de envío deja de perderse en silencio: cada mensaje es una fila con su estado,
      sus intentos y el error del proveedor, visible y reencolable desde el panel. Incluye el
      caso «sin `RESEND_API_KEY`», que antes descartaba el correo sin dejar rastro

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

**Implantado en la Fase 3**: 35 pruebas unitarias y 19 de integración, todas en CI como puerta
bloqueante. La Fase 4 sumó 9 unitarias más (44 en total) para la clonabilidad. Siguen faltando el
E2E y la prueba de RLS, que dependen de servicios externos.

Prioridad aplicada: cobertura total de lo que mueve dinero, sin exigencia en componentes visuales.

- [x] Runner configurado (vitest) y en el pipeline como bloqueante — `.github/workflows/ci.yml`
      corre `typecheck → test → push del esquema → test:integration → build`
- [x] Unitarias de dominio: conversión de céntimos, máquinas de estado de pago y fulfillment,
      descuentos de cupón y aritmética del plazo legal. El costo de envío queda cubierto por
      integración, no por unitarias: lee tarifas de `settings`
- [x] **Prueba de concurrencia de stock**: dos compradores simultáneos por la última unidad (solo
      uno gana), cinco compradores por tres unidades (el stock aterriza en 0, nunca en negativo),
      doble aprobación del mismo pedido (decremento único) y reversión completa cuando una línea de
      varias no tiene stock. **Verificadas por mutación**: al quitar la guarda condicional fallan
      exactamente esas 3 pruebas y siguen pasando las 2 que cubren otros mecanismos
- [x] Integración de la cola de verificación: aprobar dos veces (idempotente), aprobar un pedido que
      nunca pasó por verificación (rechazado por la máquina de estados), reversión atómica
- [x] Integración del Libro de Reclamaciones y del registro de consentimiento: correlativo sin
      huecos, plazo de 30 días persistido, validación de menor de edad sin escritura parcial,
      historial append-only y contexto no falsificable
- [x] Pruebas contra base de datos efímera. **El arnés se niega a ejecutarse contra cualquier host
      que no sea local** (`src/test/db.ts`), porque truncan tablas; sin `DATABASE_URL` no hay valor
      por defecto, a propósito
- [x] Datos de prueba con factories, no fixtures copiados a mano — `src/test/factories.ts`
- [x] **Prueba estructural de clonabilidad** (Fase 4): la marca no puede volver al código sin
      romper CI — `lib/brand/src/no-hardcoded-brand.test.ts`. Verificada por mutación (§11.4).
      El paso de CI dejó de filtrarse a `api-server` y corre `pnpm run test` sobre todo el
      workspace, para que una suite nueva en cualquier paquete sea bloqueante por defecto
- [ ] **Prueba de RLS**: leer pedidos de otro usuario con la anon key debe fallar. La sonda está
      escrita (§3.2) pero necesita credenciales de Supabase; no se puede ejecutar en CI todavía
- [ ] E2E con Playwright del flujo completo. El login depende de Supabase (magic link / OAuth), que
      es externo y no reproducible en CI sin un proyecto de pruebas dedicado. Los tramos sin sesión
      (catálogo, Libro de Reclamaciones) sí serían automatizables hoy
- [ ] Cobertura mínima acordada en la capa de dominio
- [ ] Cada bug de producción incorpora un test que lo reproduce — proceso, no entregable

**Bug encontrado al escribir las pruebas** (corregido): `toCents` aceptaba entradas que no son
dinero y devolvía un número plausible en vez de fallar — `""` y `" "` daban `0`, `"1.2.3"` daba
`120`, `"-5.00"` daba `-500` (que `fromCents` luego recortaba a `"0.00"`, borrando el rastro) y
`"1e3"` daba `100000`. Ninguna ruta actual llega a alimentarlo con esos valores, pero un parser de
dinero que inventa una cifra es peor que uno que lanza: el número equivocado llega a un total y no
se descubre hasta que alguien lo paga.

### 9.3 Base de datos

- [x] Convención consistente: plural, `snake_case`, `<tabla>_id`
- [x] Claves foráneas declaradas
- [x] Enums en la base, no texto libre
- [x] Índices justificados por consultas reales, incluido un índice parcial
- [x] Diagrama entidad-relación versionado — `docs/negocio/DATABASE-SCHEMA.dbml`
- [x] Script de seed idempotente — `scripts`
- [x] **Migraciones versionadas.** Implantado en la Fase 5. `generate` escribe el SQL a partir del
      diff del esquema y se commitea junto al cambio; `migrate` reproduce lo que a cada base le
      falte, con el registro en `drizzle.__drizzle_migrations`. **CI construye la base de pruebas
      replicando las migraciones**, no diffeando el esquema, así que una migración ausente o mal
      formada falla ahí y no en producción. La línea base es `0000_initial_schema.sql`. Evidencia
      en §11.5
- [x] Base preexistente recuperable sin recrearla: `pnpm --filter @workspace/scripts run
      baseline-migrations` marca la línea base sin ejecutar su SQL. Se niega a correr contra una
      base vacía, donde marcar migraciones como aplicadas sin crear nada sería un desastre
      silencioso que solo aparecería como *relation does not exist* en producción
- [~] `push`/`push-force` siguen existiendo, degradados a prototipar contra una base **desechable**
      y documentados como tales. Diffean contra lo que la base tenga en ese momento, así que dos
      entornos que reciben el mismo push en momentos distintos terminan distintos
- [ ] Restricciones `CHECK` en la base (precios ≥ 0, cantidades > 0), no solo en la aplicación
- [ ] Borrado lógico en productos y clientes; prohibición física de borrar pedidos

### 9.4 Herramientas y entornos

- [x] `.env.example` documentado variable por variable en los tres paquetes que lo necesitan
      (raíz, tienda, panel), con el propósito de cada una y qué pasa si falta
- [ ] ESLint configurado. **Corrección respecto de revisiones anteriores de este documento:** no
      hay configuración *ni* directivas `eslint-disable`; se buscó en `artifacts`, `lib` y
      `scripts` y no aparece ninguna referencia a eslint. El hueco es real, pero no hay deuda
      previa que desactivar
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

**Cerrada en la Fase 4.** Evidencia de ejecución en §11.4.

La identidad vive en tres capas con tres ciclos de vida distintos, y la frontera entre ellas es
la decisión de diseño que sostiene todo lo demás:

| Capa | Qué contiene | Quién la cambia | Cuándo tiene efecto |
|---|---|---|---|
| `lib/brand/src/brand.ts` | Nombre, tagline, zona de reparto, prefijo de pedido, `<head>`, colores de correo | Un desarrollador, en un commit | Al compilar |
| Assets y tokens por artefacto | `public/*.png`, tokens HSL y fuentes en `src/index.css` | Un desarrollador, en un commit | Al compilar |
| Tabla `settings` | Razón social, RUC, domicilio, textos legales, contacto, banners, hero, FAQ, tarifas | El negocio, desde el backoffice | Al instante |

Va en `lib/brand` lo que hace falta **antes de que la API conteste** (el `<title>` y el favicon
se sirven con el HTML) o lo que vive donde el panel no llega (correo, referencia de pedido). Va
en `settings` **todo lo que el negocio tiene que poder corregir sin un desarrollador** — la
identidad legal en particular: una empresa que no puede arreglar su domicilio fiscal sin abrir
un ticket termina emitiendo Hojas de Reclamación incorrectas.

- [x] Inventario completo de identidad de marca: qué es configuración y qué está en el código —
      la tabla de arriba, desarrollada en `docs/CLONACION.md` §0
- [x] Identidad movida a configuración: nombre, tagline, zona de reparto, prefijo de pedido,
      meta, iconos, manifest y colores de correo
- [x] Plantillas de correo parametrizadas por marca
- [x] Textos legales como contenido editable, no como JSX (venía de la Fase 2)
- [x] `.env.example` documentado variable por variable, con su propósito — raíz, tienda y panel
- [x] Procedimiento de fork documentado: qué se cambia, en qué orden, cómo se verifica —
      `docs/CLONACION.md`, incluido lo que el clon **hereda sin arreglar**
- [x] **Prueba que impide la regresión**: `lib/brand/src/no-hardcoded-brand.test.ts` recorre
      `artifacts/`, `lib/` y `scripts/` y falla si el nombre, el tagline, la zona de reparto o
      el prefijo de pedido aparecen escritos a mano. Bloqueante en CI. Los términos prohibidos
      los lee de la propia configuración, así que después del clon vigila las palabras nuevas.
      Sacar la marca del código una vez es fácil; lo difícil es que siga fuera, y eso no lo
      sostiene una convención
- [x] Decidido si el historial se purga al crear el repo del clon: **sí**, arrancando de un
      `git clone --depth 1`. Comandos y alternativa con `git filter-repo` en `docs/CLONACION.md` §1
- [~] Textos de interfaz centralizados en un módulo: **descartado con motivo**, ver §1.3
- [ ] Nombres de paquetes y carpetas (`artifacts/antropic-store`, `@workspace/antropic-*`):
      siguen llevando la marca original. Son identificadores internos que ningún cliente ve, y
      por eso la prueba los ignora a propósito. Renombrarlos es cosmético y opcional; los
      comandos están en `docs/CLONACION.md` §2.6

---

## 11. Evidencia entregable

### 11.1 Recogida en la Fase 1

Verificación de comportamiento en ejecución, no de compilación:

| Comprobación | Resultado |
|---|---|
| Entorno incompleto | Los 5 problemas reportados juntos; el proceso no arranca |
| Cabeceras de helmet | Presentes; `Cross-Origin-Resource-Policy: cross-origin`; sin `X-Powered-By` |
| CORS, origen permitido | `Access-Control-Allow-Origin` devuelto |
| CORS, origen ajeno | Sin `ACAO` (el navegador bloquea la lectura), respuesta 200 y no un 500 opaco |
| CORS, preflight | 204 con `Authorization` permitido y caché de 24 h |
| CORS en desarrollo | Cualquier puerto de localhost permitido; `https://atacante.com` bloqueado |
| Límite de escritura | Primer 429 en la petición 31 de 30 permitidas |
| Límite de URL firmada | Primer 429 en la petición 16 de 15 permitidas |
| Forma del 429 | `{"code":"RATE_LIMITED","message":"…"}`, igual que el resto de errores |
| `/healthz` exento | 700 peticiones seguidas, todas 200, pese al techo global de 600 |
| `TRUST_PROXY=1` | Cliente A agotado (429) sin afectar al cliente B en otra IP |
| Sin regresión | `/healthz` y el 404 estructurado responden igual que antes |
| Puertas de calidad | `typecheck` y `build` en verde |

> Durante esta fase el `skip` de `/healthz` no funcionaba: montado a nivel de app, `req.path` vale
> `/api/healthz` y la comparación era contra `/healthz`. Compilaba y pasaba typecheck; solo lo
> delató ejecutar el servidor. Es el argumento entero a favor de §9.2.

### 11.2 Recogida en la Fase 2

Módulo legal verificado en ejecución contra un PostgreSQL real, no solo compilado:

| Comprobación | Resultado |
|---|---|
| Presentar un reclamo sin cuenta | 201 con correlativo `LR-000001` y plazo a 30 días exactos |
| Correlativo correlativo | Segundo registro → `LR-000002`, sin huecos |
| Menor sin tutor | 422 `GUARDIAN_REQUIRED`; con tutor, 201 |
| Campos obligatorios ausentes | 400 |
| Plazo legal persistido | `due_at - created_at = 30 días` en la base |
| Detección de vencimiento | Retrasando `due_at` 3 días → `daysRemaining = -3` |
| Orden del panel | Tras responder uno, el abierto sube y el resuelto baja |
| Respuesta del proveedor | Estado, `responded_at` y `responded_by` registrados |
| Clave foránea de auditoría | Un `responded_by` inexistente es rechazado por la base |
| Sin borrado | Cero rutas DELETE en el módulo; retención estructural |
| Rutas de administración | 401 sin autenticación |
| Hoja de Reclamación | Las 4 secciones del formato, con razón social, RUC y aviso INDECOPI |
| Identidad del proveedor | Round-trip por `settings`; la config pública la refleja al instante |
| Consentimiento demostrable | IP y user-agent tomados de la petición |
| **IP falsificada en el cuerpo** | Se envió `"ipAddress":"1.2.3.4"`; se guardó `127.0.0.1` — ignorada |
| Consentimiento append-only | Otorgar y retirar → dos filas; la primera intacta |
| Casilla de marketing | Nace desmarcada (`useState(false)`) |
| Límites por endpoint | Cubos independientes: agotar `/complaints` no afecta a `/orders`, `/consents` ni `/checkout` |
| Puertas de calidad | `typecheck` y `build` en verde |

> Durante esta fase el banco de pruebas destapó que `writeLimiter` era **una sola instancia**
> montada en seis rutas, de modo que todas compartían un mismo cubo: agotar el formulario de
> reclamaciones dejaba sin presupuesto al checkout y al consentimiento. Detrás de un NAT —habitual
> en las redes móviles peruanas— eso significa que una persona podía bloquear la compra de otra sin
> ninguna relación entre ambas. Cada grupo tiene ahora su propio limitador.

### 11.3 Recogida en la Fase 3

| Comprobación | Resultado |
|---|---|
| Suite unitaria | 35 pruebas, sin base de datos, ~1 s |
| Suite de integración | 19 pruebas contra Postgres real, ~3,5 s |
| Última unidad, dos compradores | Exactamente un `ok` y un `out_of_stock`; stock final 0 |
| Cinco compradores, tres unidades | 3 ganan, 2 rechazados, stock final 0 (nunca negativo) |
| Doble aprobación del mismo pedido | Ambas `ok`, decremento aplicado una sola vez |
| Reversión atómica | Con una línea sin stock, la línea abundante queda intacta |
| **Verificación por mutación** | Al quitar `gte(stock, cantidad)` fallan 3 pruebas y pasan 2 |
| Correlativo | `LR-000001`, `LR-000002`, sin huecos tras `restart identity` |
| Plazo legal | 30 días exactos entre `created_at` y `due_at` |
| Menor sin tutor | Rechazado **y sin fila escrita** |
| Consentimiento append-only | Otorgar y retirar deja dos filas; la primera intacta |
| Arnés contra host remoto | Se niega a ejecutarse, salida 1 |
| Arnés sin `DATABASE_URL` | Falla con mensaje claro, salida 1 |
| Arnés sin esquema | Indica `push-force`, salida 1 |
| Pipeline de CI completo | Simulado contra una base nueva: los 5 pasos en verde |

> Las tres salvaguardas salen con código 1. Importa: si alguna saliera con 0 al no encontrar
> pruebas, CI pasaría en verde **sin haber ejecutado ninguna**, que es la peor forma de fallo
> posible en una puerta de calidad.

### 11.4 Recogida en la Fase 4

Clonabilidad verificada **cambiando la marca de verdad y compilando**, no leyendo el código. Se
sustituyó `lib/brand/src/brand.ts` por una segunda marca ficticia («Lunaria», Miraflores, prefijo
`LUN`, azul), se reconstruyeron los tres artefactos y se revisó la salida:

| Comprobación | Resultado |
|---|---|
| Rebranding completo desde un archivo | `<title>`, meta, Open Graph, `theme-color`, manifest, navbar, pie, login, backoffice y correo cambian los tres builds |
| Rastros de la marca anterior en el build | Ninguno, salvo la ruta absoluta del directorio de compilación que inyecta `esbuild-plugin-pino` |
| `manifest.webmanifest` en build | Emitido con `name`, `short_name`, `theme_color` y `background_color` de la marca |
| `manifest.webmanifest` en desarrollo | `200 application/manifest+json` servido desde memoria por el plugin |
| `<head>` inyectado en dev | `curl` a la raíz devuelve título, OG, iconos y `link rel=manifest` |
| Correo transaccional | Membrete, color de cabecera, firma y referencia (`ANT-1234`) tomados de `lib/brand`, comprobado renderizando la plantilla |
| Ida y vuelta de la referencia | `ANT-1234`, `ant1234` y `1234` resuelven al pedido 1234; `12a`, `maria` y `""` no resuelven |
| Configuración de marca inválida | Un color mal formado o un prefijo fuera de rango rompen la compilación con la lista completa de problemas |
| **Prueba de identidad, por mutación** | Inyectada una línea con nombre, zona y referencia en `pages/Home.tsx`: fallan exactamente 3 pruebas, con archivo y línea; al revertir, las 9 en verde |
| Suite unitaria | 44 pruebas (35 de dominio + 9 de marca), sin base de datos |
| Suite de integración | 19 pruebas contra Postgres real, en verde tras el cambio |
| Puertas de calidad | `typecheck`, `test`, `test:integration` y `build` en verde |

> **Defecto encontrado al ejecutar** (corregido): la búsqueda de pedidos del backoffice hacía
> `Number.parseInt(q.replace(/^ANT-?/i, ""))`, y `parseInt` se queda con el prefijo numérico de
> cualquier cadena. Buscar `"12abc"` devolvía el pedido 12 como si fuera una coincidencia exacta.
> `parseOrderReference` exige que lo que queda tras el prefijo sean solo dígitos, así que ahora no
> resuelve y el término cae en la búsqueda por nombre y correo, que es donde pertenece.
>
> Es el mismo patrón que `toCents` en la Fase 3: un parser que ante una entrada que no entiende
> devuelve un número plausible en lugar de rendirse. Compila, pasa el typecheck y solo aparece
> cuando alguien ejecuta el caso raro.

### 11.5 Recogida en la Fase 5

Migraciones verificadas **aplicándolas contra Postgres real**, no leyendo el SQL generado.

| Comprobación | Resultado |
|---|---|
| **Equivalencia con el esquema** | Dos bases nuevas, una por `migrate` y otra por `push-force`; `pg_dump --schema-only` de ambas: **472 líneas idénticas**, diferencia cero (las únicas dos líneas distintas eran los *nonces* aleatorios que `pg_dump` inserta en cada volcado) |
| `migrate` idempotente | Segunda corrida sobre la misma base: sin cambios, una sola fila en `drizzle.__drizzle_migrations` |
| **Base preexistente sin línea base** | `migrate` contra una base construida con `push` **falla con salida 1** — es exactamente el escenario del Supabase actual, y la razón de que el script de línea base exista |
| Recuperación de esa base | `baseline-migrations` la marca sin ejecutar SQL; `migrate` pasa a ser un no-op limpio |
| `baseline-migrations` idempotente | Segunda corrida: «Nothing to do: this database was already baselined» |
| **Guarda contra base vacía** | Se niega con salida 1 y remite a `migrate`: marcar migraciones como aplicadas sin crear nada solo se descubriría como *relation does not exist* en producción |
| Flujo hacia adelante | Cambio de esquema desechable → `generate` produce **solo el `ALTER`**, no el esquema entero; `migrate` lo aplica sobre la base ya con línea base; la columna aparece y el registro pasa a 2 filas |
| Pipeline de CI completo | Simulado contra una base nueva con el paso `migrate` en lugar de `push-force`: typecheck, 44 unitarias, migrate, 19 de integración y build, los 5 en verde |

> El compromiso deliberado: `push` y `push-force` **no** se eliminaron. Quitarlos obligaría a
> generar una migración para cada tanteo de diseño, que es fricción sin beneficio. Quedan como
> herramienta de prototipado contra una base desechable, y tanto `CLAUDE.md` como
> `docs/COMANDOS.md` dicen por qué no deben tocar una base compartida: `push` diffea contra lo que
> la base tenga en ese momento, así que dos entornos que reciben el mismo push en momentos
> distintos terminan distintos y sin registro de qué se aplicó.

> **Sobre el hallazgo de la Fase 4:** la prueba de identidad de marca volvió a cobrarse su costo.
> El script `baseline-migrations.ts` nació con el nombre de la marca en un comentario y CI lo
> rechazó antes de llegar a revisión. Es la segunda vez en dos fases.

### 11.6 Recogida en la Fase 6

Arquitectura de pagos verificada **ejecutando**: Postgres 16 local, la API levantada de verdad y
el job de caducidad corriendo como binario.

| Comprobación | Resultado |
|---|---|
| **El refactor no movió comportamiento** | `stock.integration.test.ts` (las 5 pruebas de concurrencia, atomicidad e idempotencia del stock) pasa **sin editar una sola línea** después de mover la transacción a `settlement.ts`. Era el criterio de aceptación del refactor |
| Migración incremental | `0001_payment_architecture.sql` aplicada sobre una base ya migrada: `ALTER TYPE … ADD VALUE` dentro de la transacción de drizzle **no dio problema en PG16**, así que no hizo falta partirla en dos archivos |
| Equivalencia con el esquema | `migrate` desde cero vs. `push-force`: `pg_dump --schema-only` idéntico salvo la **posición** de `orders.payment_method` (`ALTER TABLE ADD COLUMN` la añade al final) y los *nonces* de `pg_dump`. Sin diferencia semántica |
| Pipeline de CI completo | Base nueva construida solo con `migrate`: typecheck, 50 unitarias, migrate, 35 de integración y build — los 5 en verde, 2 filas en `drizzle.__drizzle_migrations` |
| Pruebas nuevas | +6 unitarias de la máquina de estados y **+16 de integración**: historial, idempotencia de webhooks y caducidad |
| **Flujo completo por HTTP** | API real levantada contra un JWKS local (firma RS256 verificada por el middleware de auth de verdad, sin bypass): subir constancia → rechazar → reintentar → aprobar → aprobar otra vez. Stock 5→3 (una sola vez), fulfillment en `en_preparacion`, y 4 eventos con autor correcto — la segunda aprobación no registró nada |
| Segunda subida sobre `en_verificacion` | 409 `INVALID_STATE`, no un 200 mudo. Al enrutar la subida por la liquidación, el camino idempotente habría devuelto éxito sin guardar la constancia; el envoltorio lo convierte en conflicto a propósito |
| Job de caducidad | `node dist/jobs/expire-orders.mjs 72` sobre un pedido de 10 días: `pendiente_pago` → `expirado`, evento `expired_unpaid` con `actor_id` nulo, stock intacto |
| Prohibición estructural | Un pedido en `en_verificacion` con 5000 h de antigüedad **no** caduca. Probado en integración, no solo afirmado |

> **El defecto de esta fase, encontrado al ejecutar.** La guarda de idempotencia comprobaba
> `(e as {code?: string}).code === "23505"` sobre el error capturado. Postgres **sí** rechazaba
> el evento duplicado —el índice único funcionaba— pero drizzle envuelve el error del driver en
> un `DrizzleQueryError` cuyo `code` es `undefined` y cuelga el error de pg de `.cause`. La
> guarda no se disparaba nunca: en vez de devolver «duplicado», la excepción escapaba. Compilaba,
> se leía bien y era inerte. La prueba de integración del reintento la sacó a la primera. Ahora
> se recorre la cadena de `cause`.

> **Sobre el alcance.** `autorizado` y `reembolsado` quedan declarados sin código que los
> produzca, y es deliberado: añadir un valor al enum cuesta una migración hoy y dos bases
> divergentes después del clon. Reembolsos, conciliación diaria contra los movimientos Yape,
> reporte para el contador e historial de *fulfillment* siguen pendientes y están listados como
> tales en `docs/PAGOS.md` §5.

> **Lo que NO se pudo verificar en este entorno:** el render en navegador de las pantallas nuevas
> (historial de pago en el panel, aviso de pedido vencido en la tienda). Ambas SPAs autentican
> contra el proyecto Supabase real, al que este contenedor no llega. Compilan y pasan el build;
> la verificación visual queda pendiente de una sesión con credenciales.

### 11.7 Recogida en la Fase 7

Observabilidad verificada **ejecutando**: Postgres 16 local, la API levantada de verdad, el job
de reintentos corriendo como binario compilado, un proveedor de correo falso, y las dos SPA
abiertas en Chromium con Playwright.

| Comprobación | Resultado |
|---|---|
| **Sonda de disponibilidad con la base caída** | Postgres detenido en caliente: `/api/healthz` sigue devolviendo **200** (es una sonda de vida y no debe tumbar instancias sanas) y `/api/readyz` devuelve **503** `{"status":"degraded"}` en 2 ms. Al volver Postgres, `/readyz` vuelve a 200 sin reiniciar la API |
| **Correlación de extremo a extremo** | Un 500 real (petición a `/api/products` con la base apagada) devolvió `requestId` en el cuerpo, la misma cadena en la cabecera `X-Request-Id`, y **3 líneas de log** con ese id. `Access-Control-Expose-Headers: X-Request-Id` confirmado en la respuesta y en el preflight |
| **Flujo real por HTTP: el correo que no salió** | Reclamo presentado contra la API de verdad (`POST /api/complaints` → 201, `LR-000001`). Con Resend sin configurar, la constancia quedó como fila `fallido` con «RESEND_API_KEY / RESEND_FROM sin configurar» en vez de desaparecer en un `logger.warn`. **El reclamo se registró igual**: la garantía de que el correo no puede tumbar un flujo de negocio sigue en pie |
| **Ciclo completo de reintento** | `POST /api/admin/notifications/{id}/retry` con un JWT RS256 firmado contra un JWKS local (middleware de auth real, sin bypass) → job compilado `dist/jobs/retry-notifications.mjs` contra un servidor que devuelve 500 y luego 200. Corrida 1: `claimed 1, sent 0`. Corrida 2 inmediata: `claimed 0` — **el backoff lo retiene**. Corrida 3 ya vencido: `claimed 1, sent 1`. El proveedor falso registró **exactamente 2 entregas**, ninguna duplicada |
| Endpoints nuevos por HTTP | `/api/admin/ops` y `/api/admin/notifications` respondiendo con token real. `bodyHtml` **no** aparece en la respuesta: el DTO no lo lleva |
| Números de operaciones contra datos reales | Constancia sembrada con 26 h de antigüedad → `oldestWaitingHours: 26`, `pending: 1`. Tras aprobar el pago por HTTP: cola vacía (`null`, no `0`) y `approvalRatePct: 100` |
| **`ErrorBoundary` en navegador** | Chromium sobre los dos dev servers, con un `throw` temporal inyectado en una ruta pública y revertido después. Tienda: pantalla «Algo salió mal» con los colores de marca y el nombre desde `lib/brand`. Panel: «El panel dejó de responder» con el texto del error a la vista. Sin el boundary, ambos casos eran una página en blanco |
| Pruebas nuevas | **+5 unitarias** (calendario de reintentos y clasificación del transporte) y **+13 de integración** (outbox contra Postgres real). Totales: 55 unitarias, 48 de integración |
| Pipeline de CI completo | Base nueva construida solo con `migrate`: typecheck, 55 unitarias, migrate, 48 de integración y build — los 5 en verde, **3 filas** en `drizzle.__drizzle_migrations` |

> **El defecto de esta fase, y esta vez estaba en una prueba nueva.** Un caso de integración
> llamado «se registra como fallido cuando el correo no está configurado» no comprobaba eso:
> `lib/env.ts` se evalúa una sola vez al importar, así que la llamada a `vi.stubEnv` no cambiaba
> nada y el caso terminaba probando un 401 corriente. Verde, y mintiendo sobre qué cubría — la
> peor variante, porque una prueba falsa es peor que ninguna: ocupa el sitio de la que faltaba.
> Se partió en dos: el caso honesto vive ahora en `lib/notify.test.ts`, donde el módulo de
> entorno sí se puede sustituir con `vi.mock`, y el de integración se renombró a lo que de
> verdad prueba.

> **Sobre el alcance: no se montó Sentry.** No hay cuenta ni DSN, y este contenedor no puede
> ejercitarlo. Montar el SDK igualmente habría producido justo el código que estas siete fases
> llevan quitando: compila, se lee bien y es inerte. Lo que sí queda es la costura —
> `lib/observability.ts` en el servidor, `logError` en cada `ErrorBoundary`— con los pasos de
> integración escritos. El ítem de §5 sigue en `[ ]`.

> **Tampoco se montó ingesta propia de errores del navegador.** Un endpoint público sin
> autenticar que acepta cualquier cosa es un blanco de inundación y una tabla que crece sin
> control. Es una decisión, no un olvido: `docs/OBSERVABILIDAD.md` §6.

> **Lo que NO se pudo verificar en este entorno:** la pantalla de **Operaciones** del panel con
> datos reales en el navegador. Sus dos endpoints se probaron enteros por HTTP con un token
> firmado, y el `ErrorBoundary` del panel sí se vio renderizado; lo que falta es el render de la
> tabla y las tarjetas, porque el panel autentica contra el Supabase real al que este contenedor
> no llega. Compila y pasa el build. Igual que en la Fase 6, la verificación visual queda
> pendiente de una sesión con credenciales.

> **Retención pendiente de decisión legal.** `notification_deliveries` guarda el cuerpo
> renderizado, que incluye datos personales. No se implementó purga automática a propósito:
> cuánto se conserva la constancia de un reclamo es una decisión del abogado, no un valor por
> defecto elegido en el código. Ver `docs/OBSERVABILIDAD.md` §5.

### 11.8 Recogida en la Fase 7b

Todo lo de abajo se obtuvo **ejecutando**: build real, Postgres 16 local con el catálogo
sembrado, la API sirviendo, y Chromium conducido por Playwright contra el build servido —
no contra el dev server, porque lo que se despliega es el build.

**Un defecto real, del tipo que compila.** El plugin de marca generaba el `robots.txt` leyendo
`process.env.VITE_PUBLIC_SITE_URL`. Vite **no** carga los `.env` en `process.env`, sino en su
propio entorno resuelto. Resultado: un build con el origen correcto dentro del bundle y, junto a
él, un `robots.txt` que decía «sin origen configurado» y `Disallow: /`. Typecheck limpio, build
limpio, y la tienda entera fuera de Google. Se vio al abrir el archivo generado, no antes.
Corregido leyendo `config.env` en el hook `configResolved`, que es el mismo conjunto de
variables que ve el bundle.

**Un segundo defecto, encontrado en el navegador.** La canónica de una ficha interpolaba el slug
sin codificar. Con un slug que contiene `&` —posible, porque el slug se escribe a mano en el
backoffice y nada lo sanea— la canónica salía
`https://tienda.example/product/blusa&rayas`: el `&` termina la ruta, así que la canónica
apuntaba a una página inexistente. Corregido en los tres sitios que construyen URLs de producto
(canónica, JSON-LD y sitemap), con prueba de regresión en
`modules/seo/sitemap.integration.test.ts`.

**Metadatos por ruta, leídos del DOM en Chromium** (origen configurado a `https://tienda.example`):

| Ruta | `robots` | `<title>` | Canónica |
|---|---|---|---|
| `/` | `index, follow` | `ANTROPIC Store` | `https://tienda.example/` |
| `/search` | `index, follow` | `Catálogo · …` | `…/search` |
| `/search?category=Tops` | `index, follow` | `Tops · …` | `…/search?category=Tops` |
| `/search?q=blusa` | `noindex, nofollow` | `Resultados para "blusa" · …` | ninguna |
| `/product/blusa%26rayas` | `index, follow` | `Bikini Tropical · …` | `…/product/blusa%26rayas` |
| `/libro-de-reclamaciones` | `index, follow` | `Libro de Reclamaciones · …` | `…/libro-de-reclamaciones` |
| `/cart`, `/checkout`, `/login` | `noindex, nofollow` | su propio título | ninguna |
| ruta inexistente | `noindex, nofollow` | `Página no encontrada · …` | ninguna |

En todas: **una sola** `<meta name="description">` y **una sola** `<link rel="canonical">`. Era
el riesgo concreto de escribir en un `<head>` que ya trae etiquetas inyectadas en build; se
comprobó contando nodos, no leyendo el código.

JSON-LD presente y parseable: `Organization` + `WebSite` en la home, `Product` +
`BreadcrumbList` en la ficha, `BreadcrumbList` en el catálogo.

**Sitemap contra la base real** (`GET /api/sitemap.xml`, 20 productos sembrados):

- Sin origen configurado: **503** con `SITE_URL_NOT_CONFIGURED`, no un documento con URLs
  inventadas.
- Con origen: **29 `<url>`** = 9 rutas estáticas + 20 productos, XML válido según
  `xml.etree`, `Content-Type: application/xml`, `Cache-Control: public, max-age=86400`.
- Al desactivar un producto: **28**. Comprobado desactivándolo de verdad y volviendo a pedir el
  documento, no razonando sobre la consulta.
- Slug con `&`: `…/product/blusa%26rayas`, y ningún `&` suelto en el documento.

**La prueba de escapado se verificó por mutación**: rompiendo `escapeXml` a propósito, el caso
falla; restaurado, pasa. Una prueba que no se ha visto fallar no se ha probado.

**Tamaño del paquete, medido en el build:**

| | Antes | Después |
|---|---|---|
| Carga inicial JS | 733,5 kB · **211,6 kB gzip**, un solo archivo | **188,7 kB gzip**, 4 archivos |
| Rutas en el paquete inicial | 16 | 1 (la home, ansiosa a propósito) |
| Aviso de Vite «> 500 kB» | sí | no |

El presupuesto (225 kB gzip) corre encadenado a `build`, así que es bloqueante en CI: no es un
número en un documento.

**Puertas completas en verde**, con Postgres 16 local: `typecheck`, 63 pruebas unitarias
(46 API + 17 marca), 53 de integración y `build` de los cuatro artefactos.

**Lo que este entorno no puede dar, y por eso sigue abierto:** Lighthouse móvil con red 4G real,
métricas de campo (LCP/INP/CLS), y la comprobación de que un buscador realmente indexa —
requiere dominio, despliegue y Search Console.

### 11.9 Pendiente

Un checklist no es una auditoría. Esto es lo que convierte lo anterior en evidencia. **Todo está
pendiente**. La suite de pruebas ya no es el bloqueo (§9.2); lo que falta depende de
credenciales reales, de trámites o de terceros.

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
3. **¿La empresa es afecta a IGV?** *(Reformulada.)* La pregunta original —si los precios incluyen
   IGV— ya tiene respuesta: en B2C peruano el precio exhibido es el total, y el modelo de
   almacenamiento está decidido en §2.4. Lo que queda es **de tu contador**: el régimen tributario
   determina si hay algo que desagregar. Bloquea la implementación de §2.4.
4. ~~**¿El checkout debe permitir invitados?**~~ **Respondida:** sí, con perfil de invitado, y
   aplazada a propósito. Ver §1.4. No es un acantilado de esquema, así que no se encarece con el
   clon.
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

**Última revisión de código:** 2026-08-19 · **Normativa citada:** vigente a agosto de 2026.
Verificar cada punto legal con un abogado antes de lanzar.
