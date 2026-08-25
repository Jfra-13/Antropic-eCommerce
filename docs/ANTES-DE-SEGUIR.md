# Antes de seguir con la siguiente fase

Ocho fases de auditoría están escritas, probadas y fusionadas en `main`. **Ninguna ha tocado
todavía un entorno real.** Este documento es la lista de lo que hay que hacer antes de abrir la
Fase 8, en el orden en que conviene hacerlo, y es corta a propósito: casi nada de lo que queda
es código.

La razón de que exista: el valor de la Fase 7 es cero hasta que se despliega. Un outbox que nadie
ejecuta no hace visible nada, y un `/readyz` al que no apunta ningún monitor es una ruta más en el
router. Lo mismo, en distinto grado, vale para las seis fases anteriores.

---

## 1. ~~Fusionar las ramas 6 y 7~~ — hecho

Las dos están en `main`, en el orden correcto: PR #5 (fase 6) primero, PR #6 (fase 7) después,
las dos con *merge commit*. Un squash de la 6 habría reescrito los commits sobre los que estaba
construida la 7 y habría reintroducido el problema que este apartado avisaba.

`main` vuelve a ser la verdad del proyecto, así que todo lo que sigue se hace contra un solo
sitio.

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

## 7. Encender el SEO: dos cosas fuera del código

La Fase 7b dejó el mecanismo entero montado y **apagado a propósito**, porque no hay dominio.

1. **Publica el dominio** en `lib/brand/src/brand.ts`:
   ```ts
   siteUrl: "https://<el-dominio-real>",   // hoy: null
   ```
   Con `null`, el `robots.txt` sale `Disallow: /`, no se emite ninguna canónica ni JSON-LD y el
   sitemap responde 503. Es el comportamiento correcto para un despliegue que no sabe su
   dirección, y también significa que **hasta esa línea nada del SEO tiene efecto**.

2. **Reescribe `/sitemap.xml` hacia la API** en el proxy inverso o en el hosting:
   ```
   /sitemap.xml  ->  /api/sitemap.xml
   ```
   El `robots.txt` anuncia el sitemap en el origen de la tienda, que es donde un rastreador lo
   busca. Sin la reescritura el documento existe, es correcto, y nadie lo pide nunca.

Después: verificar la propiedad en Google Search Console y enviarle el sitemap. Es trámite, y
necesita el dominio ya publicado.

---

## Y después, ¿qué fase?

La **7b (SEO y rendimiento) ya está hecha** — ver `docs/SEO.md`. Se eligió precisamente porque
no dependía de ninguna respuesta externa. Dos cosas suyas quedan abiertas y **no son código**:
publicar el dominio en `brand.siteUrl` y reescribir `/sitemap.xml` hacia la API en el borde.
Hasta la primera, la tienda es deliberadamente no indexable.

Queda entonces:

- **Si el contador responde → Fase 8 (IGV).** Por lo caro que se vuelve después del clon: toca
  `products`, `orders`, `order_items` y reinterpreta todos los totales ya guardados.
- **Si no → Fase 9 (checkout de invitado).** El modelo ya está decidido (§1.4) y no es un
  acantilado de esquema, así que cuesta lo mismo antes o después del fork.

Si hubiera que elegir una sola cosa de todo este documento: **despliega**. El código auditado
que nadie ejecuta no protege a nadie.
