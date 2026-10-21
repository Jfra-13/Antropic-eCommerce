# Despliegue de la API en Google Cloud Run

La API y sus dos jobs programados salen de **una sola imagen** (`Dockerfile` en la raíz). Lo
que cambia es el comando:

| Recurso | Qué corre | Cuándo |
|---|---|---|
| Servicio `antropic-api` | `dist/index.mjs` (comando por defecto) | siempre, con autoescalado |
| Job `antropic-expire-orders` | `dist/jobs/expire-orders.mjs` | cada hora |
| Job `antropic-retry-notifications` | `dist/jobs/retry-notifications.mjs` | cada 5 minutos |

Los jobs son procesos aparte, no timers dentro de la API: con varias instancias, un timer haría
que todas corrieran el mismo trabajo a la vez. Que dos ejecuciones se solapen es seguro: cada
pedido caduca en su propia transacción y el outbox salta las filas que otra ejecución tiene
tomadas (`docs/OBSERVABILIDAD.md`).

Los frontends no van aquí: son estáticos y se sirven desde un CDN.

## Decisiones

- **Región `southamerica-east1` (São Paulo).** Es la misma región que la base de Supabase
  (`aws-1-sa-east-1`). La API consulta Postgres varias veces por request, así que la distancia
  hasta la base pesa más que la distancia hasta el cliente.
- **Base por el pooler en modo transacción (puerto 6543), no en modo sesión (5432).** En modo
  sesión cada conexión del pool ocupa una conexión real de Postgres. Con autoescalado, la base
  ve `instancias × DB_POOL_MAX` conexiones. El código no usa nada que dependa de la sesión (`SET`,
  `LISTEN`, advisory locks de sesión, prepared statements con nombre).
- **`DB_POOL_MAX=5` en el servicio y `2` en los jobs.** Con `--max-instances=10`, el techo es de
  50 conexiones de la API más las de los jobs. Si sube `--max-instances`, revisa el límite de
  conexiones del plan de Supabase.
- **`TRUST_PROXY=1`.** Cloud Run pone un único proxy delante del contenedor. Sin esto, el rate
  limit vería a todos los visitantes con la misma IP. Vale para la URL `*.run.app`; un CDN o un
  balanceador delante suma un salto y hay que subir el número.
- **El rate limit es por instancia** (store en memoria, `lib/rate-limit.ts`). Con
  `--max-instances=10`, el límite efectivo puede llegar a 10 veces el configurado y se reinicia
  en cada arranque en frío. Un store compartido (Redis) lo corrige cuando haga falta.
- **Secretos en Secret Manager**, nunca en `--set-env-vars`: las variables normales se ven en
  la consola y en `gcloud run services describe`.

## Primera vez

Necesitas el `gcloud` CLI autenticado (`gcloud auth login`) y un proyecto con facturación.

```
PROJECT=<tu-proyecto>
REGION=southamerica-east1
IMAGE=$REGION-docker.pkg.dev/$PROJECT/antropic/api

gcloud config set project $PROJECT
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com cloudscheduler.googleapis.com
gcloud artifacts repositories create antropic --repository-format=docker --location=$REGION
gcloud auth configure-docker $REGION-docker.pkg.dev
```

### Secretos

Cada uno se crea una vez; el valor se lee de la entrada estándar, no queda en el historial:

```
for s in DATABASE_URL SUPABASE_SERVICE_ROLE_KEY RESEND_API_KEY; do
  read -rs -p "$s: " v && printf '%s' "$v" | gcloud secrets create $s --data-file=- && echo
done

SA=$(gcloud projects describe $PROJECT --format='value(projectNumber)')-compute@developer.gserviceaccount.com
for s in DATABASE_URL SUPABASE_SERVICE_ROLE_KEY RESEND_API_KEY; do
  gcloud secrets add-iam-policy-binding $s --member=serviceAccount:$SA \
    --role=roles/secretmanager.secretAccessor
done
```

`DATABASE_URL` es la del pooler **en el puerto 6543**, con los caracteres especiales de la
contraseña codificados (`@` es `%40`).

## Cada despliegue

```
TAG=$(git rev-parse --short HEAD)
docker build -t $IMAGE:$TAG . && docker push $IMAGE:$TAG
```

### Servicio

```
# `^;^` cambia el separador a `;`, porque CORS_ORIGINS lleva comas dentro.
ENV="^;^NODE_ENV=production;LOG_LEVEL=info;TRUST_PROXY=1;DB_POOL_MAX=5;\
CORS_ORIGINS=https://<tienda>,https://<admin>;SUPABASE_URL=https://<ref>.supabase.co;\
STORE_URL=https://<tienda>;RESEND_FROM=<remitente>;ADMIN_NOTIFICATION_EMAIL=<correo>"
SECRETS="DATABASE_URL=DATABASE_URL:latest,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest,\
RESEND_API_KEY=RESEND_API_KEY:latest"

gcloud run deploy antropic-api --image=$IMAGE:$TAG --region=$REGION \
  --allow-unauthenticated --port=8080 --min-instances=0 --max-instances=10 --concurrency=80 \
  --set-env-vars="$ENV" --set-secrets="$SECRETS"
```

`--min-instances=0` cuesta casi nada sin tráfico, pero la primera visita después de un rato
espera el arranque en frío (unos segundos). Con ventas reales, `--min-instances=1`.

Comprobación: `curl https://<url>/api/healthz` responde 200, y `/api/readyz` responde 200 solo
si llega a la base. El monitoreo externo va a `/readyz`.

### Jobs

La primera vez es `create`; después, `update` con la imagen nueva:

```
JOB_ENV="${ENV/DB_POOL_MAX=5/DB_POOL_MAX=2}"

gcloud run jobs create antropic-expire-orders --image=$IMAGE:$TAG --region=$REGION \
  --command=node --args=--enable-source-maps,dist/jobs/expire-orders.mjs \
  --max-retries=0 --task-timeout=10m --set-env-vars="$JOB_ENV" --set-secrets="$SECRETS"

gcloud run jobs create antropic-retry-notifications --image=$IMAGE:$TAG --region=$REGION \
  --command=node --args=--enable-source-maps,dist/jobs/retry-notifications.mjs \
  --max-retries=0 --task-timeout=5m --set-env-vars="$JOB_ENV" --set-secrets="$SECRETS"

# despliegues siguientes
gcloud run jobs update antropic-expire-orders --image=$IMAGE:$TAG --region=$REGION
gcloud run jobs update antropic-retry-notifications --image=$IMAGE:$TAG --region=$REGION
```

`--max-retries=0`: el siguiente disparo del cron ya es el reintento.

### Programación (una sola vez)

```
for job in antropic-expire-orders:"0 * * * *" antropic-retry-notifications:"*/5 * * * *"; do
  name=${job%%:*}; cron=${job#*:}
  gcloud scheduler jobs create http $name --location=$REGION --schedule="$cron" \
    --time-zone=America/Lima --http-method=POST \
    --uri=https://run.googleapis.com/v2/projects/$PROJECT/locations/$REGION/jobs/$name:run \
    --oauth-service-account-email=$SA
done
gcloud projects add-iam-policy-binding $PROJECT --member=serviceAccount:$SA --role=roles/run.invoker
```

Prueba manual: `gcloud run jobs execute antropic-expire-orders --region=$REGION --wait`. Sus
logs aparecen en Cloud Logging con el mensaje `expire-orders finished`.

## Fuera de este documento

- CI/CD automático hacia Cloud Run. Por ahora el despliegue es manual, con los comandos de
  arriba.
- `migrate` antes de desplegar una versión con migraciones nuevas: se corre desde una máquina
  con acceso a la base (`docs/COMANDOS.md`), antes del `gcloud run deploy`, con la URL directa o
  la del pooler en modo sesión (puerto 5432), no con la 6543 de modo transacción.
- La cuenta de servicio por defecto de Compute tiene permisos amplios. Con más de un servicio,
  conviene una cuenta propia para la API con solo `secretAccessor`.
