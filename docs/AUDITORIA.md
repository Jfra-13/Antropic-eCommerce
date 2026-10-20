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

### Hecho (fases 0–7b y 9)

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
| **9** | Checkout de invitado: perfil de invitado por pedido, token de acceso en el enlace del correo, subida de constancia sin cuenta, paso de los pedidos a la cuenta presentando el token de cada uno (nunca por correo), contacto del pedido como única fuente de lectura, y aviso «Invitado» en el panel | §1.4 · `modules/orders/guest-access.ts`, `modules/orders/service.ts`, `pages/GuestOrder.tsx` |
| **Seg.** | Revisión de seguridad sin credenciales: tabla ruta → control → prueba de cada endpoint que recibe un id, tres huecos corregidos con su prueba (referencia de pedido inexistente en reclamos, cifras financieras al empleado, filtros de rol sin prueba), prueba de dos clientes por HTTP, y comprobación en el build de que ningún secreto de service role llega al bundle | §3.1, §3.2, §11.11 · `routes/ownership.integration.test.ts`, `modules/admin/roles.integration.test.ts`, `scripts/check-client-bundle.mjs` |

> **Fusión:** todas las fases hechas están en `main` (PR #5 la fase 6, PR #6 la fase 7, PR #7 la
> 7b y PR #21 la 9, con merge commit). La 9 se fusionó tras tres rondas de revisión y una cuarta
> limpia sobre los arreglos de la tercera (§11.10). `main` es la verdad del proyecto.

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

Y en la Fase 9, **la misma familia que la Fase 6, dos veces más**: el `isUniqueViolation` de
pedidos y el `pgErrorCode` del catálogo leían `.code` del error, que drizzle deja en `.cause`.
El doble clic en «Confirmar» con la misma clave de idempotencia respondía **500** en vez de
devolver el pedido, y un slug o SKU duplicado en el backoffice, **500** en vez de 409. Ahora hay
un solo helper que recorre la cadena (`lib/pg-errors.ts`). Al probar la otra intercalación del
mismo doble clic apareció un tercero: si la segunda petición leía el carrito justo después de
que la primera lo vaciara, respondía `EMPTY_CART`. Y un cuarto, de seguridad: la constancia se
adjuntaba con **cualquier** ruta que mandara el cliente, así que un pedido podía «pagarse» con la
constancia subida para otro. Detalle en §11.10.

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

La **9 (checkout de invitado) está hecha** (§1.4, §11.10). Deja dos cosas fuera del código:
**`STORE_URL` pasa a ser imprescindible** —sin ella el correo de confirmación de un invitado sale
sin el botón «Ver mi pedido», y su único camino de vuelta es la memoria del navegador donde
compró— y **probar el enlace de pedidos a la cuenta con un inicio de sesión real**.

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
- **¿Quién responde los reclamos dentro de los 15 días hábiles?** El sistema avisa; alguien tiene que
  contestar.
- **RLS en el proyecto real**: salió roja, y se corrigió el 2026-10-20 (§3.2, evidencia en §11.11).
  Las 19 tablas estaban abiertas a la anon key. Los datos eran de prueba, así que no hubo brecha
  que comunicar según la Ley 29733.
- **No ejecutar `baseline-migrations` en producción todavía.** La base real no tiene `complaints`
  ni `consents`, que crea la `0000`: la línea base la daría por aplicada sin ejecutarla y esas
  tablas no se crearían nunca (§11.11).

### Recomendaciones

- **Protege `main`** (§1.1): sin eso, el CI bloqueante que se montó en la Fase 3 se puede saltar
  con un push directo.
- **Corre `verify-rls` después de cada despliegue que toque el esquema.** La prueba de CI
  garantiza que las migraciones activan RLS; solo la sonda comprueba que la base real las recibió.
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
- [x] Checkout como invitado — **Fase 9**, con el modelo decidido abajo. Detalle de lo que se
      hizo y de dónde se apartó de la nota original en «Implementado» al final de esta sección
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

#### Implementado (Fase 9, octubre 2026)

El modelo es el de arriba: **perfil de invitado**, `orders.user_id` sigue `NOT NULL` y los
`innerJoin(profiles, …)` no se tocaron. Lo que añade y por qué:

- **Migración `0003_guest_checkout`**: `profiles.is_guest` (con índice parcial sobre
  `lower(email)`) y `orders.guest_access_token`. Columnas nuevas con valor por defecto: no
  reinterpretan nada de lo guardado.
- **El camino de vuelta es un token, no una cuenta.** Al crear el pedido se emite un token de 256
  bits que abre **ese** pedido —verlo y subir su constancia— y nada más. Viaja en la cabecera
  `X-Order-Token`, nunca en la URL de la API, y en el correo va en el `#fragmento` del enlace
  (`/pedido/:id#token`), que el navegador no envía a ningún servidor. Cualquier fallo —pedido
  inexistente, pedido de cuenta, token ausente o equivocado— es el mismo 404, para no revelar qué
  pedidos existen.
- **Se guarda tal cual, no como hash**, a propósito: cada correo posterior (constancia recibida,
  pago confirmado, enviado…) tiene que reconstruir el mismo enlace, y un hash no se puede
  deshacer. Protege lo mismo que la fila en la que está.
- **Se apartó de la nota original en un punto: NO se reutiliza el perfil por correo.** Un perfil
  por pedido. El correo es texto escrito en un formulario y el contacto vive en el perfil, así que
  reutilizarlo permitía a cualquiera reescribir el nombre y el teléfono que el personal ve en el
  pedido pendiente de un desconocido, solo con poner su correo. El coste son contactos duplicados,
  que el enlace a la cuenta fusiona después.
- **Enlace a la cuenta (`POST /me/guest-orders/claim`)**: la tienda manda el id y el **token de
  acceso** de cada pedido de invitado que conoce —los guardados en ese navegador al iniciar
  sesión, y el del enlace del correo cuando se abre con la sesión iniciada— y la API mueve a la
  cuenta (`orders.user_id` y `coupon_redemptions`) los que casan y siguen siendo de un invitado.
  **El correo no interviene.** Antes se buscaba por el correo del JWT si `amr` decía
  `otp`/`magiclink`/`oauth`, pero `amr` dice cómo se abrió la sesión, no que el correo *actual*
  esté probado: una sesión puede cambiarlo con `updateUser` y, con la confirmación apagada, el JWT
  refrescado conserva `amr=otp` con el correo de la víctima. El token ya abre el pedido, así que
  no da nada nuevo a quien lo tiene, y no depende de la configuración de Supabase. Costo: un
  pedido hecho en otro dispositivo se vincula al abrir su enlace con la sesión iniciada. Tampoco
  se **copia** el contacto del invitado al perfil de la cuenta (lo escribió quien compró y no
  está verificado). Los perfiles de invitado no se borran: `payment_events.actor_id` los sigue
  señalando como quien subió la constancia.
  Cada pedido guarda además una **copia del contacto** (`orders.contact_name` y `contact_phone`,
  migración `0004`), para que logística no dependa del perfil del dueño actual: tras el enlace, la
  cuenta puede tener el perfil vacío. Los pedidos anteriores a la migración no la tienen y siguen
  leyendo el perfil.
- **Una cuenta bloqueada no se salta comprando como invitado**: el correo de una cuenta bloqueada
  recibe 403.
- **Devoluciones**: siguen exigiendo cuenta. Al invitado se le indica que ingrese con el mismo
  correo; el enlace le trae el pedido y desde ahí puede abrir la solicitud.
- **Panel**: aviso «Invitado» en pedidos y en el detalle (para no mandar a nadie a «inicia
  sesión»), y los perfiles de invitado no aparecen en Usuarios, que es una lista de cuentas.
- **Abuso**: el pedido de invitado comparte los límites del pedido con cuenta (`writeLimiter`,
  `quoteLimiter`, `uploadUrlLimiter`). Manda un correo a la dirección que se escriba, así que no
  podía tener un presupuesto más holgado que el de una cuenta.

---

## 2. ⚖️ LEGAL — Cumplimiento peruano

> Todo este bloque necesita validación de abogado. Es el área con mayor exposición y menor avance.

### 2.1 🔴 BLOQUEANTE — Libro de Reclamaciones Virtual

**Implementado en la Fase 2.** Módulo completo: tabla `complaints`, endpoint público, página en la
tienda, correo de constancia y panel en el backoffice. Verificado en ejecución contra Postgres — la
evidencia está en §11.2.

Base normativa: Ley N° 29571 reglamentada por D.S. N° 011-2011-PCM, modificada por la Ley N° 32495
(noviembre 2025) para incluir explícitamente a las plataformas digitales de comercio electrónico.

**Plazo corregido el 2026-10-20.** La Fase 2 implementó 30 días calendario, el plazo original del
reglamento. La Ley N° 31435 y el D.S. N° 101-2022-PCM (vigente desde agosto de 2022) lo redujeron
a **15 días hábiles improrrogables**. Ahora `complaints/mappers.ts` calcula el fin, en hora de
Lima, del 15.º día hábil siguiente al registro. Cuenta de lunes a viernes **sin descontar
feriados**, a propósito: así la fecha solo puede caer antes que la legal, nunca después. La Hoja,
la página, el aviso al personal y el panel dicen 15 días hábiles. Las tablas de evidencia de la
Fase 2 en §11.2 y §11.3 registran el comportamiento de entonces y no se reescriben.

**Documento para el abogado:** `docs/negocio/LIBRO-RECLAMACIONES.md` describe el Libro tal como
funciona y deja cuatro decisiones abiertas para el asesor: la definición literal de «queja», si
el domicilio es obligatorio, la suspensión del plazo por una oferta de solución, y el responsable
de responder. El documento incluye un bloque de conformidad para firmar.

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
- [~] Proceso interno para responder en 15 días hábiles improrrogables: el sistema calcula, muestra y ordena por
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

**Cerrado en la Fase 1** salvo los dos últimos ítems; la revisión de IDOR se cerró en la revisión
de seguridad (§11.11). Solo queda el captcha. Cada punto se verificó ejecutando el servidor,
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
- [x] Endpoints revisados uno por uno para IDOR — tabla ruta → control → prueba en §11.11. Los
      tres huecos encontrados se corrigieron con su prueba de integración; quedan dos latentes
      documentados (`returns.photo_path`, `consents.email`) que se vuelven hueco con un cambio
      concreto, y una decisión de negocio abierta (quién responde los reclamos)

**Hallazgo lateral de la Fase 1:** `STORE_URL` se usaba en `modules/notifications/templates.ts` sin
estar documentada en ningún `.env.example`. Ya está en el contrato como opcional.

### 3.2 🔴 BLOQUEANTE — Supabase RLS

Aquí RLS no es el control principal, pero **PostgREST está expuesto sobre la misma base de datos**
y la anon key es pública por diseño. Sin RLS, cualquiera puede leer las tablas directamente sin
pasar por el Express.

El 2026-10-19 la sonda contra el proyecto real salió roja: **RLS apagado en las 19 tablas**, sin
políticas, y `anon` con SELECT e INSERT en todas. Corregido el 2026-10-20 en producción y en el
repo (evidencia en §11.11).

- [x] RLS habilitado en todas las tablas, verificado tabla por tabla en el catálogo
      (`pg_class.relrowsecurity`) de producción. En el repo, cada `pgTable` llama a
      `.enableRLS()` y la migración `0006` lo aplica; `rls.integration.test.ts` falla en CI si una
      tabla de `public` queda sin RLS o si aparece una política
- [x] Probado con la anon key desde fuera de la app: `verify-rls` da 0 filas en las 19 tablas y
      sale con 0. Sin políticas, tampoco un usuario autenticado lee ni escribe nada por PostgREST
- [x] `SUPABASE_SERVICE_ROLE_KEY` nunca en el bundle del cliente — verificado sobre el build real
      de store y admin, y bloqueado en CI por `scripts/check-client-bundle.mjs` (evidencia en
      §11.11, Fase E)
- [x] Vistas y funciones RPC revisadas: `public` no tiene vistas ni funciones en producción.
      `verify-rls` falla si aparece una vista o una función ejecutable por `anon`, y la prueba de
      integración falla si aparece una vista

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
      huecos, plazo legal persistido, validación de menor de edad sin escritura parcial,
      historial append-only y contexto no falsificable
- [x] Pruebas contra base de datos efímera. **El arnés se niega a ejecutarse contra cualquier host
      que no sea local** (`src/test/db.ts`), porque truncan tablas; sin `DATABASE_URL` no hay valor
      por defecto, a propósito
- [x] Datos de prueba con factories, no fixtures copiados a mano — `src/test/factories.ts`
- [x] **Prueba estructural de clonabilidad** (Fase 4): la marca no puede volver al código sin
      romper CI — `lib/brand/src/no-hardcoded-brand.test.ts`. Verificada por mutación (§11.4).
      El paso de CI dejó de filtrarse a `api-server` y corre `pnpm run test` sobre todo el
      workspace, para que una suite nueva en cualquier paquete sea bloqueante por defecto
- [x] **Checkout de invitado** (Fase 9): 23 pruebas de integración + 10 unitarias sobre el
      token, el enlace a la cuenta, la idempotencia y la ruta de la constancia, más 2 de regresión
      para las violaciones de unicidad que respondían 500. Las siete guardas nuevas, **verificadas
      por mutación**: rota cada una, falla exactamente su prueba (§11.10)
- [x] **Prueba de RLS**: `rls.integration.test.ts` corre en CI sobre la base que construye
      `migrate` y exige RLS en toda tabla de `public`, cero políticas y cero vistas. Contra el
      proyecto real, `verify-rls` (necesita credenciales, no corre en CI). Ambas verificadas
      plantando el defecto (§11.11)
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

### 11.10 Recogida en la Fase 9

Todo se obtuvo **ejecutando**: Postgres 16 local, migraciones replicadas, catálogo sembrado, la
API construida y sirviendo, el storefront en Chromium conducido por Playwright, y —para lo que
exige sesión— un JWKS local que firma tokens con la forma de los de Supabase, incluido `amr`.

**Cuatro defectos reales, ninguno visible al compilar:**

1. **Doble clic en «Confirmar» → 500.** `isUniqueViolation` en `orders/service.ts` leía `.code`,
   pero drizzle cuelga el error de Postgres de `.cause`: la guarda de idempotencia nunca se
   disparaba y la segunda petición caía al manejador de errores. Es el defecto de la Fase 6, en
   otro archivo. Lo destapó la prueba de concurrencia del pedido de invitado, y se confirmó que el
   pedido **con cuenta** tenía el mismo fallo.
2. **Slug o SKU duplicado en el backoffice → 500 en vez de 409**, por el mismo motivo en
   `catalog/service.ts`. Los dos usan ahora `lib/pg-errors.ts`, que recorre la cadena de causas.
3. **La otra intercalación del mismo doble clic → `EMPTY_CART`.** Si la segunda petición leía el
   carrito después de que la primera lo vaciara, respondía «carrito vacío» en vez del pedido que
   la clave promete. Ahora vuelve a buscar la clave antes de responder eso. La prueba repite la
   carrera cinco veces para que salgan las dos intercalaciones; sin el arreglo falla en cada
   corrida.
4. **Constancia de otro pedido.** `attachProof` guardaba cualquier ruta que enviara el cliente.
   Con eso, un pedido podía «pagarse» con la constancia subida para otro, y el personal la
   revisaría como propia. Ahora la ruta tiene que ser exactamente `{pedido}/{uuid}`, la forma que
   emite el endpoint de subida para ese pedido.

**Verificación por mutación** de las guardas nuevas: cada una se rompió a propósito y se corrió
la suite de invitado. Falla exactamente la prueba que la cubre y ninguna otra.

| Guarda rota | Prueba que falla |
|---|---|
| `provenEmail` en el enlace a la cuenta | «refuses when the session does not prove the email» |
| Ruta de la constancia | «refuses a path that was issued for another order» |
| Comparación del token | «answers the same 404 for a wrong token, …» |
| Correo de cuenta bloqueada | «refuses an email whose account staff have blocked» |
| Correo en la repetición por clave | «will not hand an order and its token to a caller with a different email» |
| No sobrescribir el contacto de la cuenta | «never overwrites what the customer already put in their account» |
| Filtro de invitados en Usuarios | «lists accounts only» |

Y el helper de `.cause`: al revertirlo a la lectura antigua fallan cinco pruebas, entre ellas la
de idempotencia de webhooks de la Fase 6.

**Por HTTP, contra la API construida:**

- Pedido de invitado `201`, mismo cuerpo con la misma clave `200`, correo inválido `400`,
  recojo sin punto `400`.
- `GET /guest/orders/:id` con el token `200`; con token equivocado, sin token o sobre un pedido
  de cuenta, `404` idéntico. La ruta de cuenta sin sesión sigue en `401`.
- El preflight CORS admite `X-Order-Token`.
- El token **no aparece en el log** de la API (se buscó literalmente).
- El correo de confirmación queda en el outbox como `guest_order_placed` con el enlace
  `/pedido/{id}#{token}` (sale «fallido» porque aquí no hay Resend, que es lo esperado).
- Enlace a la cuenta con tokens firmados: sesión de **contraseña → 403**; sesión de **enlace
  mágico → `{"claimed":2}`**, los dos pedidos pasan a `GET /orders`, el perfil vacío **sigue vacío**
  (ya no recibe datos del invitado); un segundo intento → `{"claimed":0}`; y el enlace
  viejo del correo **sigue abriendo** el pedido.
- El panel recibe `customerIsGuest: true` en un pedido de invitado y `false` después del enlace.

**En Chromium (Playwright):** compra completa de invitado desde el carrito, aterrizaje en
`/pedido/:id` con las instrucciones de Yape y el código `ANT-n`, carrito vaciado, recarga que
conserva el pedido; el enlace del correo abierto en otro dispositivo (390 px) abre el pedido y
borra el `#token` de la barra de direcciones; sin token pide el enlace del correo; con token
equivocado lo rechaza; sin desbordamiento horizontal en móvil. Con una sesión inyectada: el
enlace a la cuenta se dispara solo al entrar, «Mis pedidos» muestra el pedido que era de
invitado, y un **checkout con cuenta** completo sigue funcionando después del refactor.

**Un defecto encontrado en el navegador:** pegar el enlace del correo en una pestaña que ya
mostraba `/pedido/:id` sin token solo cambia el fragmento. No hay navegación ni remontaje, así
que la página seguía pidiendo el enlace. Ahora escucha `hashchange`.

**Puertas completas en verde**, con Postgres 16 local: `typecheck`, 74 pruebas unitarias
(56 API + 18 marca), 78 de integración y `build` de los cuatro artefactos. Carga inicial del
storefront: 189,2 kB gzip (presupuesto 225 kB; antes 188,7 kB).

**Lo que este entorno no puede dar:** el enlace a la cuenta con un inicio de sesión de verdad.
Desde la tercera revisión ya no depende de ningún claim del JWT (va por el token de cada pedido),
pero conviene verlo una vez de punta a punta.

**Revisión posterior de la Fase 9 (hallazgos 3 a 9):** corregidos sin cambiar la forma de ninguna
respuesta.

- Clave de consulta de `/pedido/:id` ahora incluye el token: un token nuevo vuelve a pedir el
  pedido en vez de reutilizar un 404 en caché.
- Un pedido reclamado deja de ser reproducible por su clave de idempotencia
  (`profiles.is_guest = true` en la búsqueda); prueba «stops replaying a guest order once it has
  been claimed».
- Una clave ya usada por un pedido de invitado da **409 `IDEMPOTENCY_KEY_REUSED`** en el checkout
  con cuenta, no 500 (tercera revisión: el código aparte `IDEMPOTENCY_KEY_CONFLICT` se fundió con
  este, y solo la restricción `orders_idempotency_key_unique` se lee como choque de clave); el storefront regenera la clave al cambiar de sesión. Prueba de integración.
- Los errores de cotización que no son de cupón ya no aparecen bajo el campo del cupón ni dejan el
  botón bloqueado sin explicación; `OUT_OF_STOCK` enlaza al carrito.
- Un carrito de invitado con líneas que el catálogo ya no conoce **no se convierte en pedido**:
  el checkout lo bloquea y deja quitarlas de forma explícita.
- Índice parcial `profiles_blocked_account_email_idx` (migración `0005`) para `isEmailBlocked`,
  que corre en cada checkout de invitado.
- Comentario de `profiles.is_guest` apuntaba a un archivo inexistente.

**Tercera revisión de la Fase 9** (sobre `d927ecc..0ea4cd8`): diez hallazgos, corregidos en
`7a8e8bb..f3f819b`, un commit por hallazgo.

- **Traspaso por token, no por correo** (seguridad). `amr` dice cómo empezó la sesión, no que el
  correo *actual* esté probado: con la confirmación de correo desactivada, un cambio de correo a
  la dirección de la víctima se llevaba sus pedidos. `POST /me/guest-orders/claim` recibe ahora
  pares `{orderId, accessToken}` y solo mueve los que casan. `provenEmail` desapareció, y con él
  la fila «`provenEmail` en el enlace a la cuenta» de la tabla de mutación de arriba; la cubren
  «ignores the email entirely» y «refuses a wrong token, and a token presented for another order».
- **`0004` rellena el snapshot** de contacto de los pedidos existentes (`UPDATE orders … FROM
  profiles`).
- **El carrito de invitado se resuelve contra la API**, no contra la primera página del catálogo;
  «no cargó» ya no se trata como «no existe», y `/cart` muestra lo mismo que el checkout.
- **Reintento de un pedido ya traspasado**: responde con el pedido colocado, sin devolver el
  token, y nunca crea un duplicado.
- **Un solo código de choque de clave** (`IDEMPOTENCY_KEY_REUSED`), leído solo de la restricción
  `orders_idempotency_key_unique`.
- **Contacto del pedido, una sola fuente.** `orderContactName`/`orderContactPhone`
  (`orders/queries.ts`) son el único fragmento SQL que lee el contacto; los usan las cinco
  columnas que ya lo tenían y las dos que leían solo el perfil: la **cola de verificación** y el
  **tablero de devoluciones**, que tras un traspaso a una cuenta vacía mostraban nombre y
  teléfono en blanco. Prueba «shows the order's contact on the verification queue and the
  returns board too».
- **Regla del contacto (aprobada):** el snapshot del pedido es la única fuente de lectura. Al
  corregir nombre o teléfono —`PATCH /me` o la edición de usuario en el backoffice, que pasan
  por el mismo `updateProfileRow`— el cambio se copia, en la misma transacción, a los pedidos de
  ese usuario que no están `entregado`/`recogido` (incluidos los aún sin pagar, cuyo
  `fulfillment_status` es nulo). Los cerrados conservan el contacto con el que se cerraron.
  Pruebas en `users/queries.integration.test.ts`.

Puertas locales: `typecheck` y 54 pruebas unitarias de la API en verde. Las de integración solo
corren en CI (no hay Postgres en este entorno): run `39218597119` sobre `f3f819b` en verde, con
72 unitarias (54 API + 18 marca), 90 de integración y `build`.

### 11.11 Revisión de IDOR (§3.1)

Cada ruta que recibe el id de un recurso del cliente, en la URL o en el cuerpo: qué la protege y
qué prueba lo demuestra. «Sin prueba» no es un hueco: el control existe y se lee en el código,
pero nada falla si alguien lo quita.

Las pruebas de la Fase D que pasan por HTTP viven en `routes/ownership.integration.test.ts` (un
segundo cliente presenta los ids del primero en cada ruta; cada rechazo va emparejado con el
dueño haciendo lo mismo con éxito, para que una ruta que rechaza a todos no pase por una que
comprueba al dueño) y `modules/admin/roles.integration.test.ts`. Corren sobre el árbol de rutas
real (`test/http.ts`); lo único simulado es la firma del JWT: el rol y el perfil se leen de la
base como en producción.

**Pedidos, constancias e invitado**

| Ruta | Id | Control | Prueba |
|---|---|---|---|
| `GET /orders` | sesión | `listOrdersForUser`: `WHERE user_id = sesión` | «does not list or open another customer's orders» |
| `GET /orders/:id` | URL | `getOrderForUser`: `WHERE id AND user_id = sesión` en la misma consulta; ajeno = 404 | «does not list or open another customer's orders» |
| `POST /orders/:id/payment-proof/upload-url` | URL | `getOrderForUser` antes de firmar; la ruta firmada nace bajo `{orderId}/` | «does not let them upload a constancia to another customer's order» |
| `POST /orders/:id/payment-proof` | URL + `path` | `getOrderForUser`, y `isProofPathForOrder` exige `{orderId}/{uuid}` de ese pedido | ruta ajena: «refuses a path that was issued for another order»; dueño: «does not let them upload a constancia to another customer's order» |
| `GET /guest/orders/:id` | URL + `X-Order-Token` | `requireGuestOrder`: token comparado en tiempo constante; todo fallo = mismo 404 | «answers the same 404 for a wrong token, no token, an account order and a malformed id» |
| `POST /guest/orders/:id/payment-proof[/upload-url]` | URL + token | `requireGuestOrder`; el dueño pasado al servicio es el del propio pedido | mismo middleware que arriba |
| `POST /me/guest-orders/claim` | cuerpo `{orderId, accessToken}` | `claimGuestOrdersTx`: solo pedidos de perfil invitado, token en tiempo constante, nunca por email | «refuses a wrong token, and a token presented for another order», «never takes an order out of another account…» |

Matiz aceptado (Fase 9): un pedido traspasado conserva su token, así que su enlace de invitado
sigue abriéndolo. Quien tiene el token ya podía verlo.

La comprobación de dueño en las constancias ocurre antes de `settlePaymentTx`, no dentro. No es
un hueco: el único cambio de dueño posible es el traspaso invitado → cuenta, y quien sube ya
tenía acceso legítimo al mismo pedido por cualquiera de los dos caminos.

**Devoluciones, reclamos, carrito, favoritos, checkout y consentimientos (Fase B)**

| Ruta | Id | Control | Prueba |
|---|---|---|---|
| `GET /returns?orderId` | query | `requireAuth`; `listMyReturns`: `WHERE user_id = sesión`, el `orderId` solo filtra dentro de lo propio; ajeno = lista vacía | «does not show or open returns on another customer's order» |
| `POST /returns` | cuerpo `orderId` | `getOrderForReturn`: `WHERE id AND user_id = sesión`; ajeno = 404, antes de `hasOpenTicket` (no revela si otro pedido tiene ticket abierto) | «does not show or open returns on another customer's order» (404, no 409, con un ticket abierto del dueño) |
| `POST /returns` | cuerpo `photoPath` | ninguno: texto libre que se guarda y nunca se resuelve a un archivo (no hay subida ni URL firmada; el panel solo pinta «foto adjunta») | **latente**, ver abajo |
| `POST /complaints` | cuerpo `orderId` | ninguno, a propósito: es público y el `orderId` es una referencia declarada. El recibo y los dos correos se construyen solo con la fila del reclamo, nunca leen el pedido. `userId` sale de la sesión (`optionalAuth`), no del cuerpo | `userId`: «attributes the filing when the person happens to be signed in» (servicio). `orderId` inexistente: corregido en la Fase D, «drops an order reference that does not exist, without a 500 or a gap in the correlativo» |
| `GET/POST /cart`, `PATCH/DELETE /cart/items/:variantId`, `POST /cart/merge` | URL / cuerpo `variantId` | `requireAuth`; el carrito se resuelve por `carts.user_id = sesión`, los `cart_items` se filtran por ese `cartId`. `variantId` es catálogo público | «does not show or change another customer's cart» (`GET`, `PATCH`, `DELETE`); `POST /cart/merge`: sin prueba |
| `POST /guest/checkout/cart` | cuerpo `variantId[]` | no aplica: solo lee catálogo activo, no hay recurso de nadie | «reports deactivated variants and products, and unknown ids, as missing» |
| `GET/POST /wishlist`, `DELETE /wishlist/:productId` | URL / cuerpo `productId` | `requireAuth`; `WHERE user_id = sesión`; `productId` es catálogo activo | «does not show or change another customer's wishlist» |
| `POST /checkout/quote` | ninguno | `requireAuth`; carrito por sesión, el cliente no manda importes | sin prueba |
| `POST /guest/checkout/quote` | cuerpo `variantId[]` | no aplica: catálogo | — |
| `POST /orders` | cuerpo `idempotencyKey`, `pickupPointId` | carrito por sesión; `getOrderByIdempotencyKey`: `WHERE user_id = sesión AND key`; clave ajena = 409. `pickupPointId` pasa por `getActivePickupPoint` (catálogo) | «answers 409, not 500, when an account checkout reuses a key spent on a guest order» |
| `POST /guest/orders` | cuerpo `idempotencyKey` | `replayGuestOrder`: solo pedidos con token, no reclamados, mismo email; una clave de cuenta = 409 | «will not hand an order and its token to a caller with a different email», «answers 409, not 500, for a key that belongs to an account order», «reports a claimed order as placed, without handing it back…» |
| `POST /consents` | sesión + cuerpo `email` | `userId` de la sesión; IP y user-agent de la petición. El `email` del cuerpo no se verifica | contexto: «takes the request context from the caller's environment, not from the payload». `email`: **latente**, ver abajo |

Hueco (corregido en la Fase D):

- **`POST /complaints` con un `orderId` que no existe.** `complaints.order_id` tiene FK a
  `orders` y `insertComplaint` no captura `23503`, así que la petición acaba en 500. Y
  `complaint_number` es `serial`: el `nextval` ya consumido no se devuelve en el rollback, de
  modo que cualquiera, sin sesión, puede abrir un salto en el correlativo del Libro de
  Reclamaciones con un uuid inventado. La prueba «issues a gap-free correlativo» no lo ve porque
  solo encadena altas válidas. Leído en el código, no ejecutado (no hay Postgres local): la
  prueba de la Fase D es lo que lo confirma. Rechazar el reclamo no es la salida — el Libro no
  puede exigir nada para recibirlo —; la referencia inválida se descarta antes del `INSERT`.
  Que un reclamo apunte a un pedido ajeno existente sí es aceptable: es lo que el consumidor
  declara, y no devuelve nada del pedido.

  **Corrección:** `insertComplaint` resuelve la referencia dentro del mismo `INSERT`
  (`order_id = (select id from orders where id = $1)`), así que una referencia inexistente se
  guarda como `null` sin que la FK llegue a fallar. Un `SELECT` previo dejaría abierta la ventana
  entre la consulta y la escritura. Prueba: «drops an order reference that does not exist, without
  a 500 or a gap in the correlativo» (tres altas, la del medio con un uuid inventado: LR-000001,
  000002, 000003).

Latentes (no explotables hoy; se vuelven hueco con un cambio concreto):

- **`returns.photo_path`** es una cadena que manda el cliente. El día que el panel la firme para
  mostrar la foto, un cliente podrá apuntarla a la constancia de otro pedido. Cuando se
  construya la subida, debe seguir el patrón de `isProofPathForOrder`: ruta emitida por el
  servidor bajo `{orderId}/`.
- **`consents.email`** lo escribe quien quiera: cualquiera puede registrar un alta o una baja a
  nombre de un correo ajeno. Hoy nada lee `consents`, así que no tiene efecto. Un envío de
  marketing que decida por esa columna necesitaría antes un consentimiento ligado a la sesión o
  a un correo verificado.

Matiz aceptado: en `POST /guest/orders` el secreto es la `idempotencyKey`, no el email (que no
lo es). El contrato no le exige longitud mínima; la tienda la genera con `crypto.randomUUID()`,
y una clave débil solo expone el pedido de quien la eligió.

**Backoffice y operaciones (Fase C)**

En `/admin/*` los ids son de recursos del negocio, no de un cliente, así que la pregunta deja
de ser «¿es tuyo?» y pasa a ser «¿tu rol puede?». La base es una sola línea:
`router.use("/admin", requireAuth, requireRole("employee", "admin"))` en
`modules/admin/router.ts`. `adminRouter` se monta el último y ningún otro router declara rutas
bajo `/admin`, así que no hay ruta que llegue antes que el filtro. El rol se lee de
`profiles.role` en cada petición, no de un claim del JWT: degradar o bloquear a alguien surte
efecto en su siguiente petición, sin esperar a que caduque el token.

| Ruta | Id | Control | Prueba |
|---|---|---|---|
| todas las `/admin/*` | — | `requireAuth` + `requireRole("employee", "admin")`; un `customer` = 403, sin token = 401, bloqueado = 403 | «answers 403 to a customer on every admin route», «answers 401 with no token»; bloqueado: sin prueba |
| `GET /admin/payments/queue`, `POST /admin/orders/:id/{approve,reject}`, `GET /admin/orders/:id/payment-events` | URL | personal (filtro global); el cambio de estado pasa por `settlePaymentTx` | barrido de rutas (ver abajo) |
| `GET /admin/orders[/:id]`, `GET /admin/shipments`, `POST /admin/orders/:id/fulfillment` | URL | personal | barrido de rutas (ver abajo) |
| `GET/POST /admin/products`, `PATCH /admin/products/:id`, `POST /admin/products/:id/{variants,media}`, `POST /admin/products/import`, `PATCH /admin/variants/:id`, `DELETE /admin/media/:id` | URL | personal | barrido de rutas (ver abajo) |
| `POST/PATCH /admin/{categories,occasions}[/:id]` | URL | personal | barrido de rutas (ver abajo) |
| `DELETE /admin/{products,categories,occasions}/:id` | URL | `requireRole("admin")` por ruta; más estricto que la matriz (que deja al empleado editar catálogo), a propósito: borrar no se deshace | barrido de rutas (ver abajo) |
| `GET/POST/PATCH/DELETE /admin/coupons[/:id]` | URL | `adminOnly` | barrido de rutas (ver abajo) |
| `GET/PATCH /admin/returns[/:id]` | URL | personal | barrido de rutas (ver abajo) |
| `GET/PATCH /admin/complaints[/:id]` | URL | personal; responder es un acto legal, ver decisión abierta abajo | barrido de rutas (ver abajo) |
| `GET/POST /admin/users`, `PATCH /admin/users/:id` | URL | `adminOnly`; `updateUser` rechaza cambiar el rol o el bloqueo propios (`SELF_MODIFY`), así que siempre queda al menos el admin que actúa | barrido de rutas (ver abajo) |
| `GET/PUT /admin/config`, `POST /admin/config/media/upload-url`, `GET/POST/PATCH/DELETE /admin/pickup-points[/:id]` | URL | `adminOnly` | barrido de rutas (ver abajo) |
| `GET /admin/reports` | — | `adminOnly` | barrido de rutas (ver abajo) |
| `GET /admin/dashboard` | — | personal; `getDashboard(role)`: `kpis` y `topProducts[].revenue` en `null` salvo para el admin | «keeps sales figures out of an employee's dashboard, and gives them to the admin» |
| `GET /admin/ops`, `GET /admin/notifications`, `POST /admin/notifications/:id/retry` | URL | personal. La lista del outbox no expone el cuerpo renderizado (solo destinatario, asunto, estado); el reintento solo acepta un envío `fallido` | barrido de rutas (ver abajo) |

Las rutas públicas de este bloque (`GET /config`, `GET /pickup-points`, `/sitemap.xml`,
`/healthz`, `/readyz`) no reciben ids ni escriben. `GET /config` devuelve una proyección
(`getPublicConfig`), no la configuración de administración.

Huecos (corregidos en la Fase D):

- **El empleado recibe las cifras financieras del dashboard.** `getDashboard()` no conoce el
  rol: `salesToday`, `salesTodayDeltaPct` y `avgTicket` salen igual para un empleado que para
  el admin. La matriz (requerimientos §6, `FLUJOS-ROLES-Y-MEJORAS.md` §3) da al empleado una
  vista limitada, sin cifras financieras, y pone ventas del día y ticket promedio en el
  dashboard del admin. Ocultarlo en el panel no corrige nada: el dato ya viajó en la respuesta.
  Corrección elegida: la API arma la respuesta según el rol (`getDashboard(role)`), y en el
  contrato `kpis` pasa a ser nulable. Se descartó un endpoint separado por rol, porque obliga a
  duplicar la consulta y cada métrica nueva tendría que decidir a cuál de los dos va.

  **Corrección:** además de los `kpis`, la Fase D encontró `topProducts[].revenue` (ingreso por
  producto), que el panel pintaba junto a las unidades; también pasa a ser nulable y va en `null`
  para el empleado, que sigue viendo qué se vende y cuántas unidades. `GET /admin/reports` usa el
  mismo esquema pero es solo admin. El panel omite la fila de KPIs y la columna de ingreso cuando
  vienen en `null`. Prueba (HTTP, para que un router que pasara el rol equivocado también falle):
  «keeps sales figures out of an employee's dashboard, and gives them to the admin».

  Matiz aceptado (revisión de la Fase F): lo que se le quita al empleado son los **agregados**.
  El total de cada pedido sigue llegándole en `/admin/orders[/:id]` y en la cola de pagos,
  porque aprobar un pago es justamente comparar el monto de la constancia con ese total. Con
  paciencia podría sumarlos; impedirlo le impediría verificar pagos, que es su trabajo.
- **Ningún filtro de rol tiene prueba.** Si alguien borra el `router.use` o un `adminOnly`,
  ninguna prueba falla. La Fase D no añade una prueba por ruta, que se queda vieja con la
  primera ruta nueva. Añade una sola que recorre las rutas registradas en el router de admin y
  exige que cada una esté clasificada como «personal» o «solo admin»: comprueba que un
  `customer` recibe 403 en todas, y un `employee` 403 en las de solo admin. Una ruta nueva sin
  clasificar hace fallar la prueba, así que la decisión de rol no se puede saltar.

  **Corrección:** `modules/admin/roles.integration.test.ts` lee `adminRouter.stack` y lo compara
  con un mapa ruta → «staff» | «admin» en ambos sentidos: «classifies every route registered on
  the admin router, and only those». Luego «answers 403 to a customer on every admin route» y
  «answers 403 to an employee on admin-only routes, and lets them through the staff ones»: la
  segunda mitad detecta también una ruta de personal que quedara solo para admin. Los `:id` se
  sustituyen por un uuid que no existe, así que el barrido no escribe nada.

  Endurecida tras la revisión con contexto limpio (Fase F): la enumeración solo ve rutas
  declaradas directamente en `adminRouter`, así que la prueba ahora rechaza cualquier
  sub-router montado con `use` (sus rutas escaparían del barrido; verificado plantando uno: la
  prueba falla). Y en las rutas de personal exige además `< 500`: una ruta que pasa el filtro
  pero revienta es igual de inservible para el equipo.

Decisión abierta (negocio, no código): **quién responde los reclamos.** Hoy un empleado puede
contestar un reclamo (`PATCH /admin/complaints/:id`), y esa respuesta es la que se le envía al
consumidor como parte de la Hoja de Reclamación. La matriz de roles es anterior al Libro de
Reclamaciones y no lo menciona, y «quién responde en 15 días hábiles» ya figura como trámite pendiente.
Si el negocio lo restringe al admin, el cambio es un `adminOnly` en esa ruta y una línea en la
clasificación de la prueba.

Observación: `PATCH /admin/users/:id` también acepta el id de un perfil de invitado. Cambiarle
el rol o el bloqueo no tiene efecto, porque detrás no hay una cuenta con la que iniciar sesión.
Corregirle el nombre o el teléfono actualiza el contacto de sus pedidos abiertos, que es lo que
se espera cuando el personal arregla un dato.

**Secretos en el bundle del cliente (Fase E, §3.2)**

`scripts/check-client-bundle.mjs` corre al final de `pnpm run build`, así que CI lo ejecuta en
el mismo paso que ya construía. Recorre todos los archivos de `dist/public` de la tienda y del
panel (js, html, mapas, manifest) y falla si encuentra el nombre `SUPABASE_SERVICE_ROLE_KEY`, un
prefijo `sb_secret_` o un JWT cuyo payload decodificado diga `role=service_role`. CI no tiene la
clave real, así que buscar su valor siempre pasaría allí; decodificar caza una clave antigua sea
cual sea su valor. También falla si un `dist` falta o está vacío, para no pasar sin mirar nada.

Verificado en local el 2026-10-19, sobre el build real con los `.env` de desarrollo:

| Caso | Resultado |
|---|---|
| Build limpio | exit 0; 2 JWT encontrados, uno por app, ambos `role=anon` (la anon key real: prueba que el decodificado funciona, no que no encontró nada) |
| Valor literal de la service role key del `.env` raíz buscado en ambos `dist/` (solo en local; CI no la tiene) | 0 coincidencias |
| `VITE_SUPABASE_ANON_KEY` = JWT inventado con `role=service_role` en el build de la tienda | exit 1, «contains a JWT with role=service_role» |
| `VITE_SUPABASE_ANON_KEY` = `sb_secret_…` falso | exit 1, «contains an sb_secret_ key» |
| Línea temporal en `antropic-admin/src/main.tsx` que nombra la variable (revertida) | exit 1, «mentions SUPABASE_SERVICE_ROLE_KEY» |
| `dist` del panel retirado | exit 1, «no build output» |

Límite conocido: una clave partida o codificada a propósito en el código no la ve ningún
escaneo de texto. Lo que cubre es el accidente real: una variable `VITE_` apuntada al valor
equivocado, o código de cliente que intenta leer la variable del servidor.

**RLS en el proyecto Supabase real (§3.2)**

Hallazgo del 2026-10-19: la anon key, que es pública y va en el bundle, leía por PostgREST
`orders`, `order_items`, `profiles`, `payment_proofs`, `coupons`, `coupon_redemptions`, `carts`,
`cart_items`, `return_tickets`, `settings` y las tablas del catálogo. `stock_alerts` y
`wishlists` respondían 200 con 0 filas. Se contaron filas sin leer su contenido. Las escrituras
no se probaron, para no tocar producción.

Catálogo de producción, leído el 2026-10-20 en una transacción `READ ONLY`, solo nombres y
flags:

| Qué | Resultado |
|---|---|
| Tablas en `public` | 19, todas con `relrowsecurity = false` y 0 políticas |
| Permisos de `anon` | SELECT e INSERT en las 19: las escrituras anónimas eran posibles |
| Vistas y funciones en `public` | ninguna, así que no hay RPC expuesta |
| Triggers sobre `auth.users` | ninguno, así que activar RLS no rompe el registro |
| Rol de la API | `postgres`, dueño de las tablas, con `rolbypassrls = true`: RLS no le afecta ni con `FORCE` |
| `drizzle.__drizzle_migrations` | no existe (la base se creó con `push`) |

`stock_alerts` y `wishlists` también tenían RLS apagado: estaban vacías, no protegidas. Por eso
un 200 sin filas no prueba nada, y `verify-rls` ahora lee el flag del catálogo.

**Corrección en producción (2026-10-20, aprobada por el dueño):** `ALTER TABLE … ENABLE ROW
LEVEL SECURITY` en las 19 tablas, en una transacción que solo hacía `COMMIT` si después todas
daban `relrowsecurity = true`. Sin `FORCE` y sin políticas. Rollback: el mismo SQL con
`DISABLE`.

| Comprobación posterior | Resultado |
|---|---|
| Catálogo | `rls = true` en las 19 |
| Sonda con la anon key | HTTP 200 y 0 filas en las 19 |
| Lectura como `postgres` (la API) | conteos no nulos en `products` y `orders`: la API sigue viendo los datos |
| `pnpm --filter @workspace/scripts run verify-rls` | PASS, exit 0 |

**En el repo:** cada `pgTable` llama a `.enableRLS()` y la migración `0006_enable_rls.sql`
(generada) lo aplica a las 23 tablas, incluidas las 4 que producción todavía no tiene. Por tabla
es idempotente (activarlo donde ya está activo no hace nada), pero **exige que existan las 23**:
sobre producción, la `0006` falla en `complaints` mientras la línea base no se resuelva (ver
abajo). Falla dentro de su transacción, así que no deja nada a medias.
`artifacts/api-server/src/test/rls.integration.test.ts` corre en CI sobre la base que construye
`migrate`.

`verify-rls` se reescribió: el descubrimiento por `GET /rest/v1/` ya no servía, porque Supabase
limita ese documento a la service_role key y con la anon key daba 401 antes de probar nada. Ahora
lee el catálogo por `DATABASE_URL` en solo lectura y después sondea cada tabla con la anon key.
Imprime conteos, nunca filas.

Verificado plantando cada defecto en el Postgres de Docker (PostgREST simulado con un servidor
local):

| Caso | Resultado |
|---|---|
| El PostgREST simulado devuelve una fila de `orders` | `verify-rls` exit 1, «orders: returned rows to the anon key» |
| `wishlists` con RLS apagado y vacía (el caso que el script viejo daba por bueno) | `verify-rls` exit 1, «wishlists: RLS disabled»; la prueba de integración falla con `["wishlists"]` |
| Una vista y una función con EXECUTE para `anon` en `public` | `verify-rls` exit 1 con ambas; la prueba falla por la vista |
| `CREATE POLICY … USING (true)` en `orders` | la prueba de integración falla |
| Base limpia | `verify-rls` exit 0; la suite de integración local, 104 pruebas en verde |

**Pendiente, y no es código:**

- **Ley 29733: no aplica.** Las tablas expuestas eran legibles, y quizá escribibles, con una
  clave pública. Pero el dueño confirmó el 2026-10-20 que los perfiles y pedidos de la base son
  de prueba, no de clientes reales, así que no hubo datos personales expuestos que comunicar a la
  ANPD. Si la tienda ya hubiera tenido clientes, esta evaluación habría sido obligatoria.
- **Línea base de producción.** La `0000` crea `complaints` y `consents`, que la base real no
  tiene. `baseline-migrations` marcaría la `0000` como aplicada sin ejecutarla, y esas dos tablas
  no se crearían nunca: el Libro de Reclamaciones fallaría en producción. Antes de la línea base
  hay que crearlas, o hacer la línea base de otra forma.

### 11.9 Pendiente

Un checklist no es una auditoría. Esto es lo que convierte lo anterior en evidencia. **Todo está
pendiente**. La suite de pruebas ya no es el bloqueo (§9.2); lo que falta depende de
credenciales reales, de trámites o de terceros.

- [ ] Reporte de cobertura de pruebas
- [ ] Reporte de la suite E2E pasando
- [ ] Reporte de Lighthouse móvil de home, categoría, producto y checkout
- [ ] Resultado del escaneo de secretos y del audit de dependencias
- [x] Evidencia de la prueba de RLS fallando correctamente con la anon key (§11.11)
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
   hay multa si nadie contesta en 15 días hábiles.
2. **¿Está inscrito el banco de datos ante la ANPD?** Es trámite, no código, y se olvida hasta la
   fiscalización.
3. **¿La empresa es afecta a IGV?** *(Reformulada.)* La pregunta original —si los precios incluyen
   IGV— ya tiene respuesta: en B2C peruano el precio exhibido es el total, y el modelo de
   almacenamiento está decidido en §2.4. Lo que queda es **de tu contador**: el régimen tributario
   determina si hay algo que desagregar. Bloquea la implementación de §2.4.
4. ~~**¿El checkout debe permitir invitados?**~~ **Respondida e implementada (Fase 9):** sí,
   con perfil de invitado. Ver §1.4 y §11.10.
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

**Última revisión de código:** 2026-10-17 · **Normativa citada:** vigente a agosto de 2026.
Verificar cada punto legal con un abogado antes de lanzar.
