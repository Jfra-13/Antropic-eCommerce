# Prompt para retomar la auditoría en una sesión nueva

Copia el bloque de abajo como primer mensaje de un chat nuevo. Está escrito para que una sesión sin
historial entienda el estado en una sola lectura, sin tener que redescubrir el repositorio.

Cambia la última línea por la fase que quieras atacar.

---

```
Continúo una auditoría pre-lanzamiento de este ecommerce. TODO el plan, el estado y la evidencia
están en docs/AUDITORIA.md — léelo primero, empezando por la sección "Estado del proyecto — empieza
por aquí". No repitas la auditoría: ya está hecha y verificada.

Contexto en una línea: Antropic es una tienda peruana (Vite SPA + Express 5 + Drizzle sobre
pg.Pool + Supabase solo para Auth/Storage + verificación manual de constancias Yape/Plin). Se está
puliendo para después clonarla a una segunda marca con repo y base de datos separados.

Las fases 0 a 7b y la 9 están hechas: documento de auditoría; endurecimiento de la API (CORS, helmet, rate
limiting, contrato de entorno); Libro de Reclamaciones + textos legales + registro de
consentimiento; suites de pruebas bloqueantes en CI; clonabilidad (identidad de marca como dato en
lib/brand, con una prueba en CI que impide que vuelva al código); migraciones versionadas
(lib/db/drizzle, CI construye la base replicándolas); arquitectura de pagos (liquidación agnóstica
de proveedor en modules/payments/settlement.ts, interfaz PaymentProvider, tabla payment_events con
idempotencia de webhooks, y caducidad de pedidos abandonados); y observabilidad (outbox
notification_deliveries con reintentos y job retry-notifications, id de petición extremo a extremo,
/readyz que comprueba la base, pantalla de Operaciones en el panel y ErrorBoundary en las dos SPA).
docs/PAGOS.md y docs/OBSERVABILIDAD.md son las referencias de esas dos fases. La 7b dejó SEO
por ruta, sitemap y code-splitting (docs/SEO.md). La 9, checkout de invitado: un perfil de
invitado por pedido, un token de acceso que abre ese pedido (cabecera X-Order-Token, #fragmento
en el enlace del correo), y el paso de esos pedidos a la cuenta presentando el token de cada uno,
nunca por correo (AUDITORIA §1.4 y §11.10).

Todo lo fusionado vive en main. Lo único pendiente de código es la Fase 8 (IGV), bloqueada por
el contador.

El entorno de desarrollo importa: se trabaja desde Claude Code en la web, sin laptop. Ese contenedor
puede levantar Postgres 16 local, correr las suites de integración de verdad, arrancar los dev
servers y hacerles curl, y trae Chromium + Playwright preinstalados. Lo que NO puede: tocar el
proyecto Supabase real, administrar el repositorio en GitHub, ni probar en un móvil real. Como las
dos SPA autentican contra el Supabase real, las pantallas con sesión no se pueden ver en navegador
desde aquí; la API sí se puede probar entera levantando un JWKS local y firmando un token, y las
pantallas SIN sesión sí se pueden ver con Playwright (se hizo en las Fases 6 y 7, §11.6 y §11.7).

REGLAS DE TRABAJO (no negociables, vienen de las fases anteriores):

1. Validar ejecutando, no solo compilando. `typecheck` y `build` son el mínimo, no la prueba. Cada
   vez que se ejecutó el código de verdad aparecieron defectos que compilaban perfectamente — la
   última vez, en una prueba recién escrita que pasaba sin comprobar lo que decía comprobar. Si
   tocas algo delicado, levántalo y compruébalo.
2. Contrato primero. Los endpoints salen de lib/api-spec/openapi.yaml → codegen → implementación.
   Nunca edites nada bajo generated/.
3. Nada de texto legal ni fiscal inventado. Si falta un texto legal, el sistema debe decir que no
   está publicado, no rellenarlo con prosa plausible. Lo mismo con reglas tributarias: se
   confirman con el contador, no se asumen.
4. Comentarios que expliquen el porqué, no el qué. Lo que es requisito legal o invariante
   estructural debe decirlo explícitamente para que nadie lo "simplifique" después.
5. Actualiza docs/AUDITORIA.md con lo que hagas: marca los ítems y añade la evidencia en §11.
6. La marca es configuración, no código. Vive en lib/brand/src/brand.ts y hay una prueba que falla
   si el nombre, el tagline, la zona de reparto o el prefijo de pedido se escriben a mano en
   cualquier otro sitio. Ya se disparó dos veces sobre código recién escrito: no la desactives.
7. El esquema es migration-based. Un cambio en lib/db/src/schema/ se acompaña de su archivo en
   lib/db/drizzle/, generado con `generate` y commiteado. Nunca `push` contra una base compartida.
8. Todo lo que mueva orders.payment_status pasa por settlePaymentTx (modules/payments/
   settlement.ts). Escribir esa columna por fuera se salta a la vez la guarda de sobreventa, el
   rastro de auditoría y el índice de idempotencia de webhooks.
9. Ningún correo se manda directamente. Todo sale por enqueueEmail (modules/notifications/
   outbox.ts), que lo registra antes de intentarlo. Llamar al transporte por fuera devuelve el
   sistema al estado donde un fallo de envío no dejaba rastro. Y sigue en pie la regla anterior:
   una notificación que falla nunca puede tumbar un flujo de negocio.

Antes de escribir código, dime tu plan para: <FASE QUE QUIERAS — p. ej. "la Fase 7b, SEO y rendimiento">
```

---

## Notas de consumo

Esta auditoría se hizo en sesiones muy largas, y eso encarece cada turno: el modelo reprocesa la
conversación entera cada vez. Dos consecuencias prácticas:

- **Una sesión nueva por fase.** El estado vive en el repositorio, no en el historial del chat, así
  que no se pierde nada al empezar de cero.
- **No dejes vigilancia automática de PRs en sesiones largas.** Cada despertar reprocesa todo el
  historial; en una conversación corta sale a cuenta, en una larga no.

## Estado operativo al cierre de la Fase 9

Cosas que una sesión nueva no puede deducir del código y que cuesta caro redescubrir.

### PR #21 (Fase 9) — NO fusionar todavía: falta la revisión de la tercera ronda

La rama `claude/fase-9-checkout-invitado` pasó dos revisiones. La primera dejó 9 hallazgos, todos
corregidos (commits `9577d75` a `0ea4cd8`, CI en verde, evidencia en AUDITORIA §11.10). La segunda
revisión, hecha sobre esos arreglos (`d927ecc..0ea4cd8`), encontró lo siguiente, **sin corregir**:

1. **[corregido]** **Seguridad — el traspaso de pedidos sigue confiando en el correo.** `provenEmail` (lib/auth.ts)
   combina el `email` actual del JWT con `amr`, pero `amr` dice cómo se inició la sesión, no que el
   correo *actual* se haya probado. Con la confirmación de correo desactivada en Supabase, alguien
   entra por magic link con su correo, lo cambia con `updateUser({email: víctima})` y el JWT
   refrescado conserva `amr=otp`: se lleva los pedidos de invitado de la víctima.
   **Propuesta (pendiente de aprobación del usuario):** el traspaso exige el token de acceso de cada
   pedido (el del enlace del correo, que la tienda ya guarda en `lib/guest-orders.ts`), no el
   correo. Quien tiene el token ya puede ver el pedido; el traspaso deja de depender de la
   configuración de Supabase. Costo: un pedido hecho en otro dispositivo se vincula al abrir su
   enlace con la sesión iniciada.
**Estado (tercera ronda):** los diez hallazgos corregidos (commits `7a8e8bb` a `f3f819b`, uno
por hallazgo; evidencia en AUDITORIA §11.10). Falta la revisión con contexto limpio de
`3ed0646..HEAD` antes de fusionar. La regla del 5, **aprobada por el usuario** e implementada
(también cubre la edición de usuario del backoffice, que pasa por el mismo `updateProfileRow`):

- El snapshot del pedido (`orders.contact_name`/`contact_phone`) es la ÚNICA fuente de lectura;
  `coalesce(snapshot, perfil)` solo cubre pedidos anteriores a `0004`.
- `PATCH /me` copia el nombre y/o teléfono que cambiaron al snapshot de los pedidos de ese
  usuario que aún no están `entregado`/`recogido`, en la misma transacción. Los cerrados no se
  tocan (historial para devoluciones y reclamos). Con prueba de integración.
- Orden sugerido: 9 (un solo fragmento SQL exportado para el contacto), luego 2 (usarlo en
  `payments/queries.ts` ~83 y `returns/queries.ts` ~66), luego 5 (`routes/me.ts`).

2. **[corregido]** La cola de verificación (`modules/payments/queries.ts` ~83) y el tablero de devoluciones
   (`modules/returns/queries.ts` ~66) leen nombre y teléfono solo de `profiles`: les falta el
   `coalesce` con el snapshot del pedido.
3. **[corregido]** La migración `0004` no rellena `contact_name`/`contact_phone` en los pedidos existentes. Un pedido
   de invitado anterior al despliegue pierde el contacto al traspasarse. Corrección: `UPDATE orders
   ... FROM profiles` dentro de la misma migración (todavía no se aplicó en ninguna base real).
4. **[corregido]** **Bloquea ventas.** `unresolvedCartItems` (StoreContext ~183) marca como no disponible todo lo
   que no está en `useProducts()`, que está topado en `limit: 100` (lib/catalog.ts:14) y queda vacío
   si la petición falla. El checkout se bloquea con productos que sí tienen stock. Hay que resolver
   las variantes del carrito contra la API, no contra la primera página del catálogo, y no tratar
   "no cargó" como "no existe".
5. **[corregido]** En pedidos de cuenta, el snapshot gana sobre el perfil: si el cliente corrige su teléfono después
   de comprar, el personal sigue viendo el viejo y no hay pantalla para editarlo. Decidir la regla.
6. **[corregido]** El filtro `is_guest = true` del replay también corta el reintento legítimo del propio invitado si
   su pedido se traspasó entre el envío y el reintento (devuelve 409 y puede acabar en un duplicado).
7. **[corregido]** `/cart` ignora `unresolvedCartItems`: el carrito y el checkout no muestran lo mismo.
8. **[corregido]** Checkout: el `return` temprano por ítems no resueltos limpia `quote` pero no `quoteError`, así
   que quedan en pantalla dos mensajes contradictorios.
9. **[corregido]** El `coalesce` del contacto está copiado en cinco consultas: conviene un solo fragmento SQL
   exportado (es como se escaparon las del punto 2).
10. **[corregido]** `IDEMPOTENCY_KEY_CONFLICT` duplica a `IDEMPOTENCY_KEY_REUSED`, y el manejador convierte
    cualquier 23505 en ese código sin mirar la restricción violada.

Cuando estén corregidos: correr una revisión más sobre los arreglos nuevos y recién entonces
fusionar. La base real necesitará **6 migraciones** (`0000`–`0005`) o más si se añade otra.

### Lo que sigue pendiente, en orden recomendado

1. **Fase 8 · IGV y base fiscal** (§2.4). **Bloqueada por el contador**, no por código. El modelo
   ya está decidido: precio bruto en el catálogo y snapshot fiscal congelado en el pedido, con la
   derivación por resta para que base + impuesto cuadre siempre. Es el último cambio de esquema
   que se encarece de verdad con el clon.

Las fases 7b (SEO y rendimiento) y 9 (checkout de invitado) están hechas. Lo que dejan abierto
no es código: dominio en `brand.siteUrl` y reescritura de `/sitemap.xml` (7b), y `STORE_URL`
configurada más una prueba del enlace a la cuenta con un inicio de sesión real (9).

### Decisiones ya tomadas que NO hay que volver a discutir

- **IGV:** bruto + snapshot fiscal en el pedido. Se descartó el precio neto en catálogo y se
  descartó derivar el desglose en tiempo de lectura. Motivo en §2.4; la tasa es un dato histórico.
- **Invitados:** perfil de invitado. Se descartó `user_id` nullable porque hay cinco
  `innerJoin(profiles, …)` sobre `orders.user_id` y un pedido de invitado desaparecería de la cola
  de verificación. Motivo en §1.4.
- **Un perfil de invitado por pedido, nunca reutilizado por correo** (Fase 9): reutilizarlo
  permitía reescribir el contacto del pedido pendiente de un desconocido escribiendo su correo.
- **Los pedidos de invitado pasan a la cuenta presentando el token de acceso de cada pedido**,
  nunca por correo: `amr` no prueba el correo actual de la sesión (tercera revisión). Se mueve
  `orders.user_id`; no se añade una segunda vía de propiedad que cada consulta tenga que conocer.
- **Pasarela de pago:** no se integra ninguna en este ciclo. La arquitectura está lista y el
  contrato del webhook documentado en `docs/PAGOS.md` §5. **No crear el endpoint** hasta que haya
  pasarela: una ruta pública que aún no verifica firma es una puerta abierta.
- **Reembolsos:** el estado `reembolsado` y su transición existen; el endpoint no, y la decisión de
  si el stock vuelve al estante es del flujo de devoluciones.
- **Sentry:** no se monta hasta que haya cuenta y DSN. La costura está escrita
  (`lib/observability.ts` y el `logError` de cada `ErrorBoundary`) y el ítem de §5 sigue abierto a
  propósito. Tampoco se hace ingesta propia de errores del navegador: un endpoint público sin
  autenticar que acepta cualquier cosa es un blanco de inundación.
- **Retención del outbox:** `notification_deliveries` guarda el cuerpo renderizado y no se purga
  sola. Cuánto se conserva la constancia de un reclamo lo decide el abogado, no un valor por
  defecto en el código.

### Bloqueado por credenciales, no por código

- Sonda de RLS (§3.2): `pnpm --filter @workspace/scripts run verify-rls` necesita el proyecto
  Supabase real. Está escrita, sin ejecutar, y es probable que salga roja.
- E2E con login (§9.2): depende de Supabase. Los tramos sin sesión (catálogo, Libro de
  Reclamaciones) sí son automatizables hoy con el Chromium preinstalado.
- Render en navegador de las pantallas del panel que exigen sesión: historial de pago y aviso de
  pedido vencido (Fase 6), y la pantalla de **Operaciones** (Fase 7). Sus endpoints se probaron
  enteros por HTTP con un token firmado; lo que falta es el render. Los `ErrorBoundary` de ambas
  SPA sí se verificaron en Chromium, porque se disparan sin sesión.

### Bloqueado por trámites o decisiones del negocio

Textos legales del abogado · inscripción ante la ANPD · **régimen tributario y si la empresa es
afecta a IGV** (bloquea la Fase 8) · quién responde los reclamos en 30 días · SPF/DKIM/DMARC del
dominio · plan de pago de Supabase y PITR.

### Tarea manual pendiente en GitHub

Proteger `main` (§1.1). No se puede hacer desde la sesión: el MCP de GitHub no expone protección de
ramas y la API directa da 403. Configuración exacta: requerir PR, 0 aprobaciones, status check
requerido **`build`**, exigir rama al día, bloquear force-push y borrado.

### Al desplegar por primera vez

1. La base de Supabase actual se creó con `push`, así que necesita línea base **una sola vez** antes
   de que `migrate` funcione:

   ```
   pnpm --filter @workspace/scripts run baseline-migrations
   pnpm --filter @workspace/db run migrate
   ```

   Verificado en local reproduciendo ese escenario exacto; ver §11.5.

2. **Programar el job de caducidad** (Fase 6). Sin un scheduler que lo invoque, los pedidos que
   nadie pagó se quedan en `pendiente_pago` para siempre:

   ```
   pnpm --filter @workspace/api-server run expire-orders
   ```

   Detalle en `docs/PAGOS.md` §4.

3. **`STORE_URL` en la API** (Fase 9). Sin ella, el correo de un pedido de invitado sale sin el
   enlace que es su único camino de vuelta.

4. **Programar el job de reintento de correos** (Fase 7), cada 5 minutos. Sin él, un correo que
   falle una vez se queda en la cola:

   ```
   pnpm --filter @workspace/api-server run retry-notifications
   ```

   Y apunta el monitor de uptime a `/api/readyz`, no a `/api/healthz`: el primero comprueba la
   base y devuelve 503 cuando no responde. Detalle en `docs/OBSERVABILIDAD.md` §3 y §4.
