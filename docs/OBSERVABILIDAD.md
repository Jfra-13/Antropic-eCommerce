# Observabilidad

Qué hace este sistema para que un fallo en producción se pueda **encontrar**, y qué
deliberadamente no hace todavía. Escrito en la Fase 7 de `docs/AUDITORIA.md` (§5, §8.3).

**El problema que resuelve:** antes de esta fase, la única huella de que algo había fallado era
una línea de log en el servidor. Nadie en la tienda tiene acceso a esos logs. «El correo de la
constancia nunca llegó» no se podía comprobar, y menos arreglar.

---

## 1. Cuando algo falla, empieza por aquí

| Síntoma | Dónde mirar | Qué significa |
|---|---|---|
| «La web me dio un error» | Pide el **código de referencia** que salió en pantalla y búscalo en los logs (`requestId`) | Cada 500 lleva un id único que también está en el log de esa petición |
| «No me llegó el correo» | Panel → **Operaciones** → Envío de correos, filtro *Fallidos* | Cada mensaje es una fila con su estado, sus intentos y el error del proveedor |
| «La tienda no carga» | `GET /api/readyz` | 503 = esta instancia no puede servir; 200 = el problema está en otro sitio |
| Pantalla en blanco | Consola del navegador | El `ErrorBoundary` debería haber mostrado una pantalla de recuperación; si no, el fallo fue al cargar el bundle, no al dibujar |
| Pedidos que no avanzan | Panel → **Operaciones** → Constancias por verificar | Mide la espera real de la cola manual, que es lo que el cliente siente |

## 2. El id de petición

Cada petición recibe un identificador que aparece en **tres sitios a la vez**:

- las líneas de log de esa petición (`requestId`),
- la cabecera de respuesta `X-Request-Id`,
- el cuerpo de un 500: `{"code":"INTERNAL","message":"...","requestId":"..."}`.

La tienda lo muestra al cliente como «código de referencia» cuando el error no es uno de negocio
(`artifacts/antropic-store/src/lib/errors.ts`). Así un reporte deja de ser «me falló ayer por la
tarde» y pasa a ser un id que se busca directamente.

Dos decisiones a propósito:

- **El id se genera aquí siempre.** Un `X-Request-Id` entrante *no* se acepta: hoy no hay nada
  delante de la API que lo emita, y aceptar un valor del cliente permitiría falsificar o
  colisionar identificadores en el log. Si algún día se pone un CDN o gateway delante y su id
  vale la pena, se lee en `app.ts` y solo desde un proxy de confianza.
- **Solo los 500 lo llevan en el cuerpo.** Un cupón vencido o un carrito vacío son resultados
  esperados, no incidentes; ponerles un código de referencia haría que un mensaje normal
  pareciera una avería.

La cabecera está en `Access-Control-Expose-Headers`. Sin eso el navegador se la oculta al
frontend y el id existiría en la red pero sería ilegible para el único código que podría
mostrárselo a quien reporta el problema.

## 3. Las dos sondas: `/healthz` y `/readyz`

No son lo mismo y **no deben unificarse**.

```
GET /api/healthz  ->  200 {"status":"ok"}                     ¿el proceso está vivo?
GET /api/readyz   ->  200 {"status":"ok", checks:{...}}       ¿puede servir peticiones?
                  ->  503 {"status":"degraded", checks:{...}} una dependencia no responde
```

`/healthz` **no comprueba nada más** y así debe seguir. Un balanceador reinicia las instancias
que fallan la sonda de vida; si la sonda dependiera de la base de datos, un parpadeo de Postgres
tumbaría a la vez todas las instancias sanas. Eso es cómo una avería pequeña se vuelve total.

`/readyz` sí comprueba sus dependencias (hoy: la base, con `select 1` y 2 s de límite) y
devuelve **503**, no un 200 con un campo dentro: un monitor configurado para mirar el código de
estado no se enteraría de la caída si el fallo viviera solo en el cuerpo.

> **Apunta el monitor externo a `/readyz`.** Antes de que existiera, `/healthz` respondía 200
> con Postgres caído: un monitor de uptime habría reportado la tienda perfectamente sana
> mientras cada petición devolvía 500.

La respuesta es corta a propósito. El endpoint es público y sin autenticar, así que no lleva
versión, ni configuración, ni datos de conexión. Los contadores del pool van al log del fallo y
al panel, no a la respuesta.

Ambas rutas están exentas del rate limiting (`lib/rate-limit.ts`): un monitor pregunta cada
pocos segundos, y estrangularlo convertiría una tarde con tráfico en una falsa alarma de caída.

## 4. El outbox de notificaciones

Todo mensaje que sale de este sistema es **una fila antes que un correo**:
`notification_deliveries`.

```
enqueueEmail()  → fila `pendiente` (attempts=1) → intento inmediato
                                                   ├─ ok            → `enviado`
                                                   ├─ 5xx / timeout → sigue `pendiente`, con backoff
                                                   └─ 4xx / sin clave → `fallido` (reintentar no cambia nada)

retry-notifications (job) → reclama lo vencido → mismo desenlace
```

**La regla que no se puede simplificar:** nada de esto puede lanzar hacia el flujo de negocio.
El reclamo queda registrado, el pago queda aprobado y el pedido sale, haya o no correo. El
outbox cambia lo que es **visible** de un fallo, no lo que un fallo puede romper.

Piezas y por qué son así:

- **El cuerpo renderizado se guarda.** Un reintento manda lo que se compuso, no lo que la
  plantilla produciría hoy con datos que ya cambiaron; el job no necesita conocer ningún módulo
  de negocio; y «qué le mandamos exactamente» tiene respuesta. Para la Hoja de Reclamación eso
  es lo legalmente interesante: ese correo **es** la constancia del consumidor.
- **Backoff con presupuesto.** 1, 5, 15, 60 y 240 minutos, seis intentos. Cubre una caída normal
  del proveedor sin dejar un mensaje muerto dando vueltas en la cola durante días.
- **Reintentable ≠ fallido para siempre.** Un 429 o un 5xx es el proveedor teniendo un mal
  minuto; un 401 o una dirección rechazada fallará igual las seis veces, así que se marca
  terminal de inmediato y alguien lo ve en el panel en vez de dentro de cinco horas.
- **`FOR UPDATE SKIP LOCKED` al reclamar.** Dos ejecuciones simultáneas del job —o una corrida
  que dura más que su intervalo de cron— se saltan las filas que la otra tiene tomadas, en vez
  de bloquearse o, peor, mandar el mismo correo dos veces.
- **El reclamo es un arriendo.** La misma UPDATE empuja `next_attempt_at` hacia adelante antes
  de intentar la entrega, así que un proceso que muere a mitad libera sus filas al vencer el
  arriendo en vez de dejarlas encalladas.
- **Sin correo configurado no se pierde nada.** Con `RESEND_API_KEY` o `RESEND_FROM` sin poner,
  cada mensaje se registra igual y queda `fallido` con «sin configurar». Es el estado en el que
  está la tienda antes de verificar el dominio remitente, y el backlog se reencola desde el
  panel cuando se resuelva. Antes esos mensajes se descartaban en silencio: así es como se
  descubre meses después que ningún cliente recibió confirmación.

### Programarlo

```
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run retry-notifications      # lote de 50 por defecto
node ./artifacts/api-server/dist/jobs/retry-notifications.mjs 200
```

Cada cinco minutos es la cadencia razonable: es menor que el primer escalón del backoff, así que
un mensaje que falló una vez sale en la siguiente corrida. **Sin un programador que lo invoque,
lo que falle una vez se queda en la cola**, igual que pasa con `expire-orders` (`docs/PAGOS.md`
§4). Es un proceso aparte y no un `setInterval` dentro de la API por la misma razón: con más de
una instancia detrás de un balanceador, un temporizador en cada una las pondría a competir.

## 5. Datos personales y retención

`notification_deliveries` guarda el destinatario y el **cuerpo renderizado**, que incluye nombre,
dirección y contenido del pedido. Eso es dato personal bajo la Ley 29733 y hay que tratarlo como
tal: la tabla no se expone al panel más allá de los metadatos —`bodyHtml` no está en el DTO— y no
debe usarse para marketing ni cruzarse con el CRM.

**No hay purga automática, y es deliberado.** Cuánto tiempo se conserva la constancia de un
reclamo es una decisión legal, no un valor por defecto que alguien elige en el código. Los
reclamos se guardan dos años (`lib/db/src/schema/complaints.ts`); si la constancia de su envío
debe seguir la misma regla, es una pregunta para el abogado y, cuando haya respuesta, se
implementa como un job con su ventana explícita.

## 6. Lo que NO está montado, y por qué

- **Sentry o equivalente.** No hay cuenta ni DSN, y este entorno no puede ejercitarlo. Montar el
  SDK igualmente produciría exactamente el código que esta auditoría lleva seis fases quitando:
  compila, se lee bien y no hace nada. Lo que sí está es la **costura**:
  `artifacts/api-server/src/lib/observability.ts` concentra el reporte de errores del servidor y
  de los jobs, y documenta los tres pasos de la integración. En el frontend, `logError` dentro
  de cada `ErrorBoundary` es el punto equivalente. El ítem sigue abierto en la auditoría.
- **Ingesta propia de errores del navegador.** Un endpoint público y sin autenticar que acepta
  lo que sea que le manden es un blanco de inundación y una tabla que crece sin control. El
  hueco se deja para un proveedor de verdad.
- **Tasa de 5xx en el panel.** Contarla bien necesita un backend de métricas. Un contador en
  memoria mentiría en cuanto haya más de una instancia, y una cifra que miente es peor que
  ninguna.
- **Monitor de uptime y alertas.** Es un servicio externo, no código. Apúntalo a `/api/readyz`.
- **Alerta proactiva de cola atascada.** Hoy el panel *muestra* que la cola de verificación
  lleva 26 horas o que hay correos sin salir; nadie te *avisa*. Avisar requiere decidir a quién
  y por qué canal, y eso está pendiente de la misma respuesta que §12.1 de la auditoría: quién
  responde y en qué horario.
