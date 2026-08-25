# Antes de seguir con la siguiente fase

Siete fases de auditoría están escritas, probadas y commiteadas. **Ninguna ha tocado todavía un
entorno real.** Este documento es la lista de lo que hay que hacer antes de abrir la Fase 8, en el
orden en que conviene hacerlo, y es corta a propósito: son seis cosas, cuatro de ellas no son
código.

La razón de que exista: el valor de la Fase 7 es cero hasta que se despliega. Un outbox que nadie
ejecuta no hace visible nada, y un `/readyz` al que no apunta ningún monitor es una ruta más en el
router. Lo mismo, en distinto grado, vale para las seis fases anteriores.

---

## 1. Fusionar las ramas 6 y 7 — y en ese orden

**Es lo más urgente y lo único que empeora solo con el tiempo.**

| Rama | Contenido | ¿En `main`? |
|---|---|---|
| `claude/fase-6-arquitectura-pagos-s47c8t` | Arquitectura de pagos (§6.2) | **No** |
| `claude/fase-7-observabilidad-yrdioe` | Observabilidad (§5, §8.3) — construida **encima** de la 6 | **No** |

La Fase 7 no parte de `main`: parte de la punta de la Fase 6. Es decir, la rama de la 7 ya
**contiene** los dos commits de la 6.

Consecuencias prácticas:

- Fusiona **primero la 6, después la 7**. Al revés, o solo la 7, el historial queda incoherente.
- No fusiones la 7 esperando que sea un cambio pequeño: arrastra las dos fases.
- Si alguna vez alguien rehace la rama de la 7 sobre `main` "para limpiarla", **revierte la
  arquitectura de pagos entera**. Es el tipo de error que no da error: compila, pasa CI y devuelve
  el código a un estado anterior sin que nadie lo note hasta que un pedido se aprueba dos veces.

Cuando las dos estén en `main`, `main` vuelve a ser la verdad del proyecto y todo lo demás de esta
lista se puede hacer contra un solo sitio.

---

## 2. Aplicar las migraciones a la base real

Cuatro tablas de las fases 2, 6 y 7 no existen en ningún entorno: `complaints`, `consents`,
`payment_events` y `notification_deliveries`.

**El orden importa y el primer comando solo se ejecuta una vez en la vida de esa base.** La base
actual se creó antes de que existieran las migraciones (con `push`), así que tiene las tablas
viejas pero no el registro de qué migraciones ha visto. `migrate` a secas intentaría crear de nuevo
lo que ya está y fallaría.

```bash
# SOLO si la base ya existía antes de la Fase 5. Registra la línea base sin ejecutar su SQL.
pnpm --filter @workspace/scripts run baseline-migrations

# Siempre. Aplica lo que la base no ha visto.
pnpm --filter @workspace/db run migrate
```

En una base **nueva** (la del clon, por ejemplo) basta el segundo: `baseline-migrations` se niega a
correr contra una base vacía justamente para que nadie se equivoque en esa dirección.

Cómo saber que salió bien: `drizzle.__drizzle_migrations` debe tener **3 filas** (`0000`, `0001`,
`0002`).

---

## 3. Programar los dos jobs y apuntar el monitor

Los dos son procesos aparte, no temporizadores dentro de la API. Sin un programador que los invoque
**no se ejecutan nunca**, y su ausencia es silenciosa: no falla nada, simplemente el trabajo no se
hace.

| Job | Cadencia | Qué pasa si no corre |
|---|---|---|
| `expire-orders` | Cada hora | Los pedidos abandonados se quedan en `pendiente_pago` para siempre (`docs/PAGOS.md` §4) |
| `retry-notifications` | Cada 5 minutos | Lo que falle una vez se queda en la cola. Cinco minutos es menor que el primer escalón del backoff, así que un fallo puntual sale en la corrida siguiente (`docs/OBSERVABILIDAD.md` §4) |

```bash
pnpm --filter @workspace/api-server run build        # obligatorio: `start` sirve lo que hay en dist/
node ./artifacts/api-server/dist/jobs/expire-orders.mjs 72
node ./artifacts/api-server/dist/jobs/retry-notifications.mjs 200
```

**Y el monitor de uptime va a `/api/readyz`, no a `/api/healthz`.** No son intercambiables:
`/healthz` responde 200 mientras el proceso viva, aunque Postgres esté caído — es una sonda de vida,
y si dependiera de la base un parpadeo de Postgres reiniciaría todas las instancias sanas a la vez.
`/readyz` es la que comprueba dependencias y devuelve 503. Apuntar el monitor a `/healthz` es tener
un monitor que informa de que todo va bien mientras la tienda devuelve 500 a todo el mundo.

---

## 4. Verificar el dominio remitente en Resend

Es la pareja natural de la Fase 7 y **es bloqueante para lanzar** (§8.3).

Hoy el sistema hace bien la mitad honesta del trabajo: registra que ningún correo sale. Cada mensaje
queda como fila `fallido` con «RESEND_API_KEY / RESEND_FROM sin configurar» en vez de desaparecer.
Lo que falta es que salgan.

1. Verifica el dominio en Resend y configura **SPF, DKIM y DMARC**. Sin los tres, las confirmaciones
   caen en spam y los reclamos se disparan.
2. `RESEND_FROM` en un dominio propio, nunca en Gmail. El nombre visible debe coincidir con el de
   `lib/brand/src/brand.ts`: un desajuste entre el remitente y el logotipo dentro del correo es un
   problema de entregabilidad, no de estética.
3. Prueba en Gmail, Outlook y Hotmail.
4. **Reencola lo acumulado** desde el panel → Operaciones. Los mensajes que fallaron por
   configuración siguen ahí y pueden salir ahora; entre ellos las Hojas de Reclamación, que son la
   constancia legal del consumidor.

---

## 5. Disparar hoy las dos preguntas que tienen plazo

Ninguna es código, las dos bloquean cosas grandes, y la espera corre en paralelo con lo que sigas
haciendo. Por eso van hoy y no cuando toque.

### Al contador: ¿la empresa es afecta a IGV?

Bloquea la Fase 8, que es **el último cambio de esquema caro antes del clon**: toca `products`,
`orders`, `order_items` y reinterpreta todos los totales ya guardados. Hacerlo después del fork
significa hacerlo dos veces, en dos bases que ya divergieron.

Lo que **ya está decidido** y no hay que volver a discutir (§2.4): en B2C peruano el precio exhibido
es el total, se guarda bruto en el catálogo y el pedido congela un snapshot fiscal. Lo único que
falta es que el contador confirme el **régimen tributario**, que es lo que determina si hay algo que
desagregar. Sin esa confirmación no se escribe el cálculo: las reglas tributarias no se asumen.

### Al abogado: los textos legales

El mecanismo lleva listo desde la Fase 2. El contenido no. Mientras estén vacíos, la tienda dice que
el documento no ha sido publicado — es deliberado y es lo correcto, pero no es lanzable.

Pendiente también, y es trámite puro: **la inscripción del banco de datos ante la ANPD**. Su
ausencia es infracción grave y se olvida hasta la fiscalización.

---

## 6. Dos cosas que solo puedes hacer tú en GitHub y Supabase

### Proteger `main` (cinco minutos)

Sin esto, los cuatro gates bloqueantes que se montaron en la Fase 3 se saltan con un push directo.
Un CI obligatorio que se puede rodear no es obligatorio. Hay que hacerlo a mano en la configuración
del repositorio: no se puede desde una sesión de Claude Code.

### Correr la sonda de RLS

```bash
pnpm --filter @workspace/scripts run verify-rls
```

Necesita las credenciales del proyecto Supabase real. Es el hueco de seguridad con mayor impacto
potencial y el único que no se puede cerrar desde el código de la aplicación: el navegador nunca
habla con Postgres, pero **PostgREST está expuesto sobre la misma base**.

**Prepárate para que salga roja.** Si sale, es trabajo antes de lanzar, no después.

---

## Y después, ¿qué fase?

- **Si el contador responde pronto → Fase 8 (IGV).** Por lo caro que se vuelve después del clon.
- **Si tarda → Fase 7b (SEO y rendimiento).** Es independiente de todo lo demás y no se encarece por
  esperar: meta título y descripción por ruta, `sitemap.xml`, URLs canónicas, JSON-LD y
  code-splitting. Hoy las 12 rutas comparten un `<title>` y un producto compartido a WhatsApp se ve
  como la home, y eso cuesta ventas desde el primer día.

Si hubiera que elegir una sola cosa de todo este documento: **fusiona y despliega**. El código
auditado que vive solo en ramas no protege a nadie.
