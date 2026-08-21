# Arquitectura de pagos

Cómo cobra esta tienda hoy, qué se dejó preparado para una pasarela y qué contrato tendrá que
cumplir esa pasarela cuando llegue. Escrito en la Fase 6 de `docs/AUDITORIA.md` (§6.2).

**Decisión de alcance vigente:** no hay pasarela y no se integra ninguna en este ciclo. Lo que sí
se hizo es dejar de tener el flujo manual cableado como único camino posible.

---

## 1. El flujo real, hoy

```
Cliente crea el pedido            → pendiente_pago
Ve el QR de Yape y su referencia  → paga FUERA de la plataforma
Sube la constancia                → en_verificacion
Un empleado contrasta la imagen   → pagado        (baja stock, arranca fulfillment)
                                  → rechazado     (no toca stock; puede reintentar)
Nadie paga en 72 h                → expirado      (job programado)
```

La referencia (`ANT-000123`, prefijo configurable en `lib/brand`) es lo único que enlaza un Yape
recibido con un pedido. No hay confirmación automática: **la verificación es humana y ese es el
punto de control del dinero.**

## 2. Las tres piezas

### `lib/order-state.ts` — la máquina de estados

Es la autoridad sobre qué movimientos son legales. El enum de `lib/db` solo dice qué nombres
existen; quién puede ir a dónde se decide aquí.

| Estado | Significa | Sale hacia |
|---|---|---|
| `pendiente_pago` | creado, sin pagar | `en_verificacion`, `autorizado`, `expirado` |
| `en_verificacion` | constancia subida, esperando a una persona | `pagado`, `rechazado` |
| `autorizado` | *(reservado)* pasarela que autoriza y captura por separado | `pagado`, `rechazado`, `expirado` |
| `pagado` | dinero confirmado, stock descontado | `reembolsado` |
| `rechazado` | constancia no válida | `en_verificacion`, `expirado` |
| `expirado` | nadie pagó; terminal | — |
| `reembolsado` | *(reservado)* dinero devuelto; terminal | — |

`autorizado` y `reembolsado` no tienen código que los produzca. Están declarados a propósito:
añadir un valor al enum cuesta una migración hoy y **dos bases divergentes** después del clon
(`docs/CLONACION.md`).

Dos prohibiciones son estructurales y no deben "simplificarse" nunca:

1. **No hay arista de `pendiente_pago` a `pagado`.** Ningún camino marca un pedido como pagado
   sin pasar por un estado que puso una persona o una pasarela verificada.
2. **`en_verificacion` no sale a `expirado`.** Un pedido en verificación tiene una constancia
   adjunta, o sea que puede haber dinero real enviado que nadie ha mirado. Lo cierra una persona
   aprobando o rechazando, jamás un temporizador.

### `modules/payments/settlement.ts` — la transacción crítica

Todo lo que mueve el estado de pago pasa por `settlePaymentTx`, venga de donde venga. En una sola
transacción:

1. Bloquea la fila del pedido `FOR UPDATE` (dos liquidaciones simultáneas se serializan; la
   perdedora ve el estado ya puesto y no repite el trabajo).
2. Verifica que el proveedor que liquida sea el dueño del pedido (`orders.payment_method`).
3. Comprueba la máquina de estados.
4. Inserta la fila en `payment_events` — **dentro de esta transacción, nunca después**.
5. Al entrar en `pagado`, descuenta stock con `UPDATE … WHERE stock >= cantidad`. Una sobreventa
   no puede confirmarse: revienta y revierte todo.
6. Llama al gancho del proveedor (`onSettled`), también dentro de la transacción.

Un reembolso **no** devuelve stock aquí: si la mercadería vuelve al estante es una decisión sobre
su estado físico, y eso es del flujo de devoluciones.

### `modules/payments/providers/` — el proveedor

Interfaz deliberadamente pequeña: `id` y `onSettled`. Todo lo común a cualquier método de pago
está en la liquidación; aquí queda solo lo que el núcleo no puede saber. `manual_yape` cierra las
constancias pendientes con el veredicto del pedido.

El registro es un `Record<PaymentMethod, PaymentProvider>`: añadir un valor al enum sin registrar
proveedor **no compila**. Un método de pago no puede llegar a producción sin nada detrás.

## 3. `payment_events`: auditoría e idempotencia

Tabla append-only, dos trabajos:

- **Auditoría.** Antes, el único rastro era `orders.approved_by`/`approved_at`, que la siguiente
  decisión sobreescribe: "quién rechazó esto el martes" no tenía respuesta. Ahora cada movimiento
  es una fila con estado de origen, estado de destino, autor y momento. `actor_id` nulo significa
  que **no hubo persona** (el job de caducidad, o el webhook de una pasarela) — el backoffice lo
  muestra como «Sistema», nunca como un hueco.
- **Idempotencia de webhooks.** `UNIQUE (provider, event_id) WHERE event_id IS NOT NULL`. Parcial
  porque el flujo manual deja `event_id` nulo y en Postgres cada nulo es distinto.

Por qué hacen falta las dos guardas: la comprobación "¿el pedido ya está en el estado destino?"
atrapa el reintento normal. **No** atrapa el caso en que el pedido volvió legítimamente a un
estado desde el que el evento viejo es válido otra vez — una constancia lo pasa a
`en_verificacion`, un empleado la rechaza, y una re-entrega del evento original encuentra
`rechazado`, desde donde `en_verificacion` es perfectamente legal. Ese reingreso a la cola con un
evento de la semana pasada lo para el índice único, no la comprobación de estado.

## 4. Caducidad de pedidos abandonados

```
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run expire-orders        # 72 h por defecto
node ./artifacts/api-server/dist/jobs/expire-orders.mjs 48   # ventana explícita
```

Proceso aparte, no un temporizador dentro de la API: con más de una instancia detrás de un balanceador,
un `setInterval` en cada una las pondría a competir por los mismos pedidos.

Cada pedido se cierra en su propia transacción por la vía de liquidación normal, así que una
corrida interrumpida deja cerrado lo ya cerrado y el resto intacto. Toca `pendiente_pago` y
`rechazado`; **nunca** `en_verificacion`. No toca stock, porque un pedido que nunca se pagó nunca
lo tomó, y no toca las constancias, porque caducar no es un veredicto sobre una imagen que nadie
revisó.

---

## 5. Contrato del webhook — para cuando haya pasarela

Esto es lo que tendrá que cumplir la integración futura. **No hay endpoint todavía, y es
deliberado:** una ruta pública que aún no verifica ninguna firma es una puerta abierta esperando
a que alguien la termine.

1. **Firma verificada antes de leer nada.** Con el **cuerpo crudo**: si `express.json()` lo parsea
   primero, el cuerpo re-serializado ya no coincide con lo que se firmó y la validación falla o,
   peor, se "arregla" desactivándola. Monta el parser `raw` solo en esa ruta.
2. **Fuera del middleware de autenticación.** Quien llama es la pasarela, no un usuario con JWT.
   La autenticación de esa ruta *es* la firma. Ponle su propio rate limit: es pública.
3. **Monto y moneda contrastados contra el pedido** antes de liquidar. Una notificación de pago
   por S/ 1,00 sobre un pedido de S/ 250,00 no es un pago, es un intento. Guarda lo reportado en
   `payment_events.amount`/`currency` para que la comprobación sea auditable después.
4. **200 rápido.** Responde en cuanto la liquidación commitea. Nada de correos ni de trabajo
   pesado antes de contestar: casi todas las pasarelas reintentan por timeout, y cada reintento
   es una entrega duplicada más.
5. **`event_id` obligatorio.** Pasa el id de entrega de la pasarela a `settlePaymentTx`. Es lo
   único que hace efectivo el índice único.
6. **La liquidación va por `settlePaymentTx`.** No escribas `orders.payment_status` desde el
   handler. Todo lo que hace segura esa transacción vive ahí dentro.
7. **Registra el proveedor** como valor nuevo del enum `payment_method`, con su implementación de
   `PaymentProvider`, y ponlo en los pedidos que crea. La guarda de propiedad impide que un
   webhook cierre un pedido que no es suyo.

### Lo que sigue pendiente (no se hizo en la Fase 6)

- **Reembolsos**: el estado existe, el endpoint y la decisión sobre el stock no.
- **Conciliación diaria** de pedidos aprobados contra los movimientos reales de la cuenta Yape.
  Es el punto ciego del flujo manual: un pedido aprobado por error no lo detecta nadie.
- **Reporte exportable para el contador.**
- **Historial de cambios de *fulfillment***: `payment_events` cubre el pago; los cambios de
  preparación y envío siguen sin dejar rastro de autor.
