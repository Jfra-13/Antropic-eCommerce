# Línea base de producción: estado y cómo retomarla

Estado al 2026-10-20. Bloqueante antes del primer despliegue: sin esto, `complaints` y `consents`
no existen en producción y el Libro de Reclamaciones falla.

## Dónde nos quedamos

**Paso B2 probado sin confirmar, pendiente de ejecución real.** Producción no ha recibido ninguna
escritura: su huella sigue idéntica a la del inicio (285 líneas).

## El problema, en corto

Producción se creó con `push`. Su esquema es idéntico al de la migración `0000`, salvo que le faltan
`complaints`, `consents` y sus 5 enums (`complaint_item_type`, `complaint_status`, `complaint_type`,
`consent_purpose`, `document_type`). Tiene RLS activado en sus 19 tablas y 0 políticas. No tiene
`drizzle.__drizzle_migrations`.

`baseline-migrations` da la `0000` por aplicada sin ejecutarla. Por eso, antes hay que crear lo que
le falta (`missing.sql`), y después correr `baseline-migrations` y `migrate`.

## Defecto encontrado y corregido en el ensayo

`baseline-migrations` registraba **todas** las migraciones del journal (0000–0006), no solo la 0000.
En producción, `migrate` no habría aplicado nada y aun así habría informado éxito. Habrían faltado
`payment_events`, `notification_deliveries`, las columnas de invitado y el RLS de 4 tablas.

Lo corrige el commit `a6a4060` (`fix(scripts): baseline only migration 0000`), en la rama
`claude/libro-15-dias-habiles`. **Ese commit no se ha subido.** El paso B3 debe correr con ese
arreglo, nunca con la versión anterior.

## Hecho

### A. Ensayo en Docker (completo)

| Paso | Comparación | Resultado |
|---|---|---|
| A1 | Réplica (0000 sin las 2 tablas y los 5 enums, RLS en 19) frente a producción | Idénticas, 285 líneas, incluidos RLS y políticas |
| A2 | `missing.sql` aplicado con `apply-missing.cjs` | Idéntica a una base con solo la 0000 (321 líneas, sin contar RLS) |
| A3, script viejo | `baseline-migrations` y después `migrate` | Falla: marca 7 migraciones, no aplica ninguna y faltan 56 líneas |
| A3, script corregido | `baseline-migrations` (marca 1) y después `migrate` (0001–0006) | Idéntica a una base migrada desde cero (395 líneas) |
| 0004 con filas | 2 pedidos sintéticos sembrados antes de migrar | Corre sin error y modifica 0 filas |
| verify-rls | Réplica con PostgREST simulado (siempre responde 401) | PASS: 23 tablas, 0 vistas, 0 funciones ejecutables por anon, 0 políticas |

### B1. Respaldo (hecho)

- Archivo: `C:/Users/juanf/backups/antropic/prod-public-20261020-024416.dump`. Formato custom,
  schema `public`, 19 tablas con sus datos. sha256 `da77d31e7f8ac3f0973ee4b96d5cf056ce0ec4628ea28beab218397c6a05b4f1`.
- Hecho con `pg_dump` 17.11 (imagen `postgres:17`), porque el servidor es 17.6. El `pg_dump` del
  contenedor de pruebas es 16 y no sirve.
- Restaurado en una base del Docker: su huella es idéntica a la de producción. El único error fue
  `transaction_timeout`, un parámetro de `pg_dump` 17 que el servidor 16 del Docker no reconoce.

### B2. Prueba sin confirmar (hecha)

`apply-missing.cjs --dry-run` contra producción aplicó las 15 sentencias y la huella quedó
idéntica (321 líneas). Después hizo ROLLBACK. Al volver a leer, producción seguía sin cambios.

## Pendiente, en orden

Cada escritura en producción necesita la confirmación explícita del dueño, una por una.

1. **B2, ejecución real.** Primero vuelve a leer la huella y comprueba que sigue igual a `prod.fp`.
   Después aplica `missing.sql` sin `--dry-run`. Solo hace COMMIT si la huella queda idéntica.
2. **B3.** `baseline-migrations`, con el arreglo `a6a4060`. Debe imprimir
   `Baselined 1 migration(s)`; si dice 7, detente.
3. **B4.** `migrate`: aplica 0001–0006 en una sola transacción.
4. **B5.** `verify-rls` debe dar PASS, y la huella debe ser idéntica a `full.fp`.
5. **Documentar.** La evidencia va en `docs/AUDITORIA.md` §11.11. En `docs/PROMPT-CONTINUACION.md`,
   la sección "Al desplegar por primera vez" debe decir que la línea base está resuelta y el comando
   exacto que se usó. Un commit convencional por unidad.
6. **Rotar la contraseña de la base de Supabase.** Un error de `pg_dump` mostró en el chat un
   fragmento de la `DATABASE_URL`. La contraseña contiene un `@` sin codificar; en la nueva URL,
   escríbelo como `%40`.
7. **Subir los commits** (`a6a4060` y el de este documento), solo cuando el dueño lo pida.
8. **PRs.** Cuando se fusione el #23, re-apunta el #24 a main (`gh pr edit 24 --base main`) y
   espera el CI.

Pendiente fuera de esta tarea, sin cambios: las 4 decisiones del abogado
(`docs/negocio/LIBRO-RECLAMACIONES.md` §6), la Fase 8 (IGV, bloqueada por el contador), proteger
`main` en GitHub, los textos legales, los jobs `expire-orders` y `retry-notifications`,
`STORE_URL` y `ADMIN_NOTIFICATION_EMAIL`.

## Herramientas

Viven fuera del repo, en `C:/Users/juanf/backups/antropic/baseline-tools/`. No contienen secretos.

| Archivo | Qué hace |
|---|---|
| `fp.cjs` | Huella de solo lectura del schema `public`: enums, columnas, restricciones, índices, secuencias, RLS y políticas. Nunca lee filas. |
| `extract-missing.cjs` | Genera `missing.sql` desde la `0000` por programa. Falla si la selección no es exactamente 5 tipos, 2 tablas, 4 claves foráneas y 4 índices. |
| `missing.sql` | 15 sentencias. sha256 `f0d3a79999099e09…` |
| `apply-missing.cjs` | Aplica `missing.sql` en una sola transacción. COMMIT solo si la huella (sin las líneas de RLS) es igual a `base.fp` y el RLS de las tablas existentes no cambió. Acepta `--dry-run`. |
| `dump.cjs` | `pg_dump` con la imagen `postgres:17`. Pasa las credenciales como variables `PG*` y oculta la contraseña en lo que imprime. |
| `setup.cjs`, `seed.cjs` | Arman la réplica y los datos sintéticos del ensayo, solo en Docker (127.0.0.1:5433). |
| `prod.fp` | Huella de producción hoy (285 líneas). |
| `base.fp` | Huella de una base con solo la 0000 (342 líneas). |
| `full.fp` | Huella de una base migrada desde cero (395 líneas). |

## Comandos (Git Bash, desde la raíz del repo)

```
T=C:/Users/juanf/backups/antropic/baseline-tools
export NODE_PATH=/c/software/projects/Antropic-Design-Studio/lib/db/node_modules

# 0. Producción sigue igual (solo lectura)
node --env-file=.env $T/fp.cjs > /tmp/prod_now.fp && diff $T/prod.fp /tmp/prod_now.fp && echo unchanged

# B2: ejecución real (escribe; necesita confirmación)
(cd $T && node --env-file=C:/software/projects/Antropic-Design-Studio/.env apply-missing.cjs missing.sql base.fp)

# B3 y B4 (escriben; cada uno necesita confirmación)
pnpm --filter @workspace/scripts run baseline-migrations   # debe decir "Baselined 1 migration(s)"
pnpm --filter @workspace/db run migrate

# B5
pnpm --filter @workspace/scripts run verify-rls
node --env-file=.env $T/fp.cjs > /tmp/prod_final.fp && diff $T/full.fp /tmp/prod_final.fp && echo identical
```

## Trampas del entorno ya comprobadas

- Una `DATABASE_URL` puesta en el shell tiene prioridad sobre el `.env` en `node --env-file`,
  `tsx --env-file` y `process.loadEnvFile`. Así se apunta el ensayo al Docker sin tocar producción.
- Con `MSYS_NO_PATHCONV=1`, `NODE_PATH` debe ir en formato Windows (`C:/...`). Si no, no encuentra
  `pg`.
- `libpq` (`pg_dump`, `psql`) no acepta la URL actual por el `@` sin codificar. `node-postgres` sí.
  Hasta rotarla, usa `dump.cjs`, que pasa las credenciales por separado.
