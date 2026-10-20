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

El entorno de desarrollo importa: se trabaja desde Claude Code en Windows (Git Bash). Hay
Docker Desktop (arráncalo si el daemon no responde): `pnpm run test:integration:local` levanta un
Postgres desechable igual al de CI, aplica las migraciones y corre la integración. Córrelo ANTES
de cada push; CI es la confirmación, no el primer lugar donde se ejecuta una prueba. Build local: `MSYS_NO_PATHCONV=1 PORT=3000 BASE_PATH=/`. No existe `rtk`; usa
los comandos normales. Tampoco hay acceso al proyecto Supabase real ni a la administración del
repositorio en GitHub, así que las pantallas con sesión no se pueden ver en navegador; la API sí
se puede probar levantando un JWKS local y firmando un token (se hizo en las Fases 6, 7 y 9).

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
10. Un commit convencional por unidad de trabajo, sin trailers de IA. Push sin force. Ningún PR
    se fusiona sin CI en verde y una revisión con contexto limpio de sus últimos arreglos.

Siguiente: revisión de seguridad que no necesita credenciales (AUDITORIA §3.1 y §3.2).
1. Endpoints revisados uno por uno para IDOR: cada ruta de modules/*/router.ts que reciba un id
   (pedido, devolución, reclamo, carrito, constancia, consentimiento) debe comprobar que el
   recurso pertenece al usuario de la sesión, o al token de invitado, o que el rol es de personal.
   Entregable: tabla ruta → control que la protege → prueba que lo demuestra; los huecos se
   corrigen con prueba de integración, un commit por hueco.
2. SUPABASE_SERVICE_ROLE_KEY nunca en el bundle del cliente: verificarlo sobre el build real de
   antropic-store y antropic-admin (buscar la clave y el nombre de la variable en dist/), no solo
   en el código fuente, y dejar una comprobación que falle en CI si vuelve a aparecer.

Trabajo en fases, rama claude/seguridad-idor, una sesión por fase. La tabla vive en AUDITORIA
§11.11. Hecho: A (pedidos, constancias, invitado, claim — sin huecos) · B (returns,
complaints, cart, wishlist, checkout, consentimientos — un hueco: orderId inexistente en
/complaints da 500 y salta el correlativo; dos latentes) · C (admin y ops — dos huecos: el
dashboard da cifras financieras al empleado, y ningún filtro de rol tiene prueba; decisión
abierta: quién responde reclamos) · D (los tres huecos corregidos con su prueba, más la prueba
de dos usuarios y el barrido de rutas de admin; evidencia en §11.11; PR #23 en borrador con CI
en verde) · E (scripts/check-client-bundle.mjs al final de `pnpm run build`: dist/ sin el
nombre de la variable, sin `sb_secret_` y sin JWT con role=service_role; probado plantando
secretos falsos, evidencia en §11.11) · F (§3.1/§3.2 cerrados en lo que no necesita
credenciales, revisión con contexto limpio sin hallazgos bloqueantes, prueba de roles
endurecida, PR #23 listo para revisión) · G (RLS: el proyecto real lo tenía apagado en las 19
tablas; activado en producción el 2026-10-20, migración 0006 con .enableRLS() en cada tabla,
prueba de integración que exige RLS sin políticas ni vistas, verify-rls reescrito sobre el
catálogo; evidencia en §11.11; los datos eran de prueba, sin brecha que comunicar). Queda
abierta la línea base de producción (ver "Al desplegar por primera vez"). Libro de Reclamaciones:
plazo corregido a 15 días hábiles (rama claude/libro-15-dias-habiles) y descripción para el
abogado en docs/negocio/LIBRO-RECLAMACIONES.md, pendiente de su firma y de sus cuatro decisiones.

Antes de escribir código, dime tu plan.
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

### PR #21 (Fase 9) — fusionado

Fusionado en `main` (merge commit `273d366`) tras tres rondas de revisión, todos los hallazgos
corregidos y una cuarta revisión limpia sobre `3ed0646..0eaee61`. Evidencia en AUDITORIA §11.10.
La base real necesitará **6 migraciones** (`0000`–`0005`).

Matices de esa última revisión, aceptados a sabiendas (no son defectos):

- Abrir el enlace de un pedido de invitado con la sesión iniciada lo pasa a esa cuenta: quien
  tiene el token ya puede ver el pedido, y nunca se le quita a otra cuenta.
- Corregir nombre o teléfono del perfil pisa el contacto de **todos** los pedidos abiertos del
  usuario, incluido uno traspasado con otro contacto (p. ej. un regalo). Es la regla aprobada.
- La migración `0004` se editó en el lugar para añadir el relleno del contacto. Es seguro solo
  porque no se había aplicado en ninguna base compartida; no repetir esa práctica.

### Lo que sigue pendiente, en orden recomendado

1. **Seguridad sin credenciales** (§3.1 IDOR, §3.2 service role en el bundle): hecha, PR #23.
   Falta fusionarlo.
2. **Fase 8 · IGV y base fiscal** (§2.4). **Bloqueada por el contador**, no por código. El modelo
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

- Sonda de RLS (§3.2): ejecutada. Salió roja el 2026-10-19 y verde el 2026-10-20, después de
  activar RLS. Necesita `DATABASE_URL`, `SUPABASE_URL` y `SUPABASE_ANON_KEY` del proyecto real.
- E2E con login (§9.2): depende de Supabase. Los tramos sin sesión (catálogo, Libro de
  Reclamaciones) sí son automatizables hoy con el Chromium preinstalado.
- Render en navegador de las pantallas del panel que exigen sesión: historial de pago y aviso de
  pedido vencido (Fase 6), y la pantalla de **Operaciones** (Fase 7). Sus endpoints se probaron
  enteros por HTTP con un token firmado; lo que falta es el render. Los `ErrorBoundary` de ambas
  SPA sí se verificaron en Chromium, porque se disparan sin sesión.

### Bloqueado por trámites o decisiones del negocio

Textos legales del abogado · inscripción ante la ANPD · **régimen tributario y si la empresa es
afecta a IGV** (bloquea la Fase 8) · quién responde los reclamos en 15 días hábiles · SPF/DKIM/DMARC del
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

   **BLOQUEANTE, no lo ejecutes tal cual.** La base real no tiene `complaints` ni `consents`, y las
   crea la `0000`. La línea base da la `0000` por aplicada sin ejecutarla, así que esas dos tablas
   no se crearían nunca y el Libro de Reclamaciones fallaría en producción. Faltan también
   `payment_events` y `notification_deliveries`; esas sí las crean `0001` y `0002`. Hay que
   resolverlo antes del primer despliegue. Después de `migrate`, corre `verify-rls`.

   **En curso:** ensayo hecho, respaldo hecho, B2 probado sin confirmar. Estado, pasos pendientes
   y comandos en `docs/LINEA-BASE-PRODUCCION.md`.

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
