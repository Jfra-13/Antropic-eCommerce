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

Las fases 0 a 6 están hechas y fusionadas: documento de auditoría; endurecimiento de la API (CORS,
helmet, rate limiting, contrato de entorno); Libro de Reclamaciones + textos legales + registro de
consentimiento; suites de pruebas bloqueantes en CI; clonabilidad (identidad de marca como dato en
lib/brand, con una prueba en CI que impide que vuelva al código); migraciones versionadas
(lib/db/drizzle, CI construye la base replicándolas); y arquitectura de pagos (liquidación
agnóstica de proveedor en modules/payments/settlement.ts, interfaz PaymentProvider, tabla
payment_events con idempotencia de webhooks, y caducidad de pedidos abandonados). docs/PAGOS.md es
la referencia de pagos.

El entorno de desarrollo importa: se trabaja desde Claude Code en la web, sin laptop. Ese contenedor
puede levantar Postgres 16 local, correr las suites de integración de verdad, arrancar los dev
servers y hacerles curl, y trae Chromium + Playwright preinstalados. Lo que NO puede: tocar el
proyecto Supabase real, administrar el repositorio en GitHub, ni probar en un móvil real. Como las
dos SPA autentican contra el Supabase real, las pantallas con sesión no se pueden ver en navegador
desde aquí; la API sí se puede probar entera levantando un JWKS local y firmando un token (se hizo
en la Fase 6, §11.6).

REGLAS DE TRABAJO (no negociables, vienen de las fases anteriores):

1. Validar ejecutando, no solo compilando. `typecheck` y `build` son el mínimo, no la prueba. Las
   cinco veces que se ejecutó el código de verdad aparecieron defectos que compilaban
   perfectamente. Si tocas algo delicado, levántalo y compruébalo.
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

Antes de escribir código, dime tu plan para: <FASE QUE QUIERAS — p. ej. "la Fase 7, observabilidad">
```

---

## Notas de consumo

Esta auditoría se hizo en sesiones muy largas, y eso encarece cada turno: el modelo reprocesa la
conversación entera cada vez. Dos consecuencias prácticas:

- **Una sesión nueva por fase.** El estado vive en el repositorio, no en el historial del chat, así
  que no se pierde nada al empezar de cero.
- **No dejes vigilancia automática de PRs en sesiones largas.** Cada despertar reprocesa todo el
  historial; en una conversación corta sale a cuenta, en una larga no.

## Estado operativo al cierre de la Fase 6

Cosas que una sesión nueva no puede deducir del código y que cuesta caro redescubrir.

### Lo que sigue pendiente, en orden recomendado

1. **Fase 7 · observabilidad, SEO y rendimiento** (§4, §5, §8.1). **Observabilidad primero**,
   invirtiendo el orden del título de la fase: hoy toda notificación es *fire-and-forget* y cada
   fallo se traga en un `logger.warn` —cinco `catch` en `modules/notifications/service.ts`— y no
   hay Sentry ni equivalente en ningún paquete. Sin eso, «el aviso de constancia nueva nunca llegó
   al backoffice» es una línea de log que nadie lee y el pedido se queda en la cola. Después: meta
   por ruta (las 12 comparten un `<title>`), `sitemap.xml`, `robots.txt`, canónicas, JSON-LD, y
   code-splitting con `React.lazy` — el bundle del storefront pasa los 500 kB.
2. **Fase 8 · IGV y base fiscal** (§2.4). **Bloqueada por el contador**, no por código. El modelo
   ya está decidido: precio bruto en el catálogo y snapshot fiscal congelado en el pedido, con la
   derivación por resta para que base + impuesto cuadre siempre. Es el último cambio de esquema
   que se encarece de verdad con el clon.
3. **Fase 9 · checkout de invitado** (§1.4). Modelo ya decidido: perfil de invitado sin cuenta de
   Supabase, **no** `user_id` nullable. Va al final justo porque no necesita migración y por tanto
   no se encarece con el fork.

### Decisiones ya tomadas que NO hay que volver a discutir

- **IGV:** bruto + snapshot fiscal en el pedido. Se descartó el precio neto en catálogo y se
  descartó derivar el desglose en tiempo de lectura. Motivo en §2.4; la tasa es un dato histórico.
- **Invitados:** perfil de invitado. Se descartó `user_id` nullable porque hay cinco
  `innerJoin(profiles, …)` sobre `orders.user_id` y un pedido de invitado desaparecería de la cola
  de verificación. Motivo en §1.4.
- **Pasarela de pago:** no se integra ninguna en este ciclo. La arquitectura está lista y el
  contrato del webhook documentado en `docs/PAGOS.md` §5. **No crear el endpoint** hasta que haya
  pasarela: una ruta pública que aún no verifica firma es una puerta abierta.
- **Reembolsos:** el estado `reembolsado` y su transición existen; el endpoint no, y la decisión de
  si el stock vuelve al estante es del flujo de devoluciones.

### Bloqueado por credenciales, no por código

- Sonda de RLS (§3.2): `pnpm --filter @workspace/scripts run verify-rls` necesita el proyecto
  Supabase real. Está escrita, sin ejecutar, y es probable que salga roja.
- E2E con login (§9.2): depende de Supabase. Los tramos sin sesión (catálogo, Libro de
  Reclamaciones) sí son automatizables hoy con el Chromium preinstalado.
- Render en navegador de las pantallas nuevas de la Fase 6 (historial de pago en el panel, aviso de
  pedido vencido en la tienda): compilan y pasan el build, sin verificación visual.

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
