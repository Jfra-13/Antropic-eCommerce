# Procedimiento de clonación

Cómo convertir este repositorio en la tienda de una segunda marca, con **repo separado y base
de datos separada**. Escrito para ejecutarse de arriba abajo: cada paso dice qué se cambia y
cómo se comprueba que quedó bien.

> Este documento es la contraparte operativa de la §10 de `AUDITORIA.md`. La regla que lo
> gobierna: **todo lo que se duplique tiene que ser configuración antes del fork.** Lo que
> quede escrito a mano en un componente se paga una vez por clon, y la segunda vez se paga mal.

---

## 0. Dónde vive la identidad de la marca

Tres capas, con tres ciclos de vida distintos. Saber cuál es cuál evita el 90% del trabajo.

| Capa | Qué contiene | Quién la cambia | Cuándo tiene efecto |
|---|---|---|---|
| **`lib/brand/src/brand.ts`** | Nombre, tagline, zona de reparto, prefijo de referencia de pedido, `<title>`, meta, Open Graph, favicon, color de tema, color e identidad del correo | Un desarrollador, en un commit | Al compilar |
| **Assets y tokens por artefacto** | `public/*.png`, `public/opengraph.jpg`, tokens HSL de color y fuentes en `src/index.css` | Un desarrollador, en un commit | Al compilar |
| **`settings` (base de datos)** | Razón social, RUC, domicilio fiscal, textos legales, contacto, banners, hero, FAQ, política de devoluciones, tarifa de envío, Yape | El negocio, desde el backoffice | Al instante, sin desplegar |

La frontera entre la primera capa y la tercera no es arbitraria:

- Va en `lib/brand` lo que hace falta **antes de que la API conteste** — el `<title>` y el
  favicon se sirven con el HTML, mucho antes de la primera petición — o lo que vive donde el
  panel no llega: las plantillas de correo y el prefijo de la referencia de pedido.
- Va en `settings` **todo lo que el negocio tiene que poder corregir sin un desarrollador**.
  La identidad legal en particular: una empresa que no puede arreglar su propio domicilio
  fiscal sin abrir un ticket termina emitiendo Hojas de Reclamación incorrectas.

Que la marca no se filtre fuera de `lib/brand` no es una convención, es una prueba:
`lib/brand/src/no-hardcoded-brand.test.ts` recorre `artifacts/`, `lib/` y `scripts/` y falla
si el nombre de la marca, el tagline, la zona de reparto o el prefijo de pedido aparecen
escritos a mano. Corre en CI como puerta bloqueante. Los términos prohibidos los lee de la
propia configuración, así que **después del clon sigue vigilando, pero vigilando las palabras
nuevas**.

---

## 1. Crear el repositorio

```bash
# Repo nuevo y limpio: sin el historial de la marca original.
git clone --depth 1 <repo-antropic> marca-nueva
cd marca-nueva
rm -rf .git
git init && git add -A && git commit -m "chore: fork inicial desde la implementación de referencia"
```

**Por qué `--depth 1` y no un fork con historial:** el historial de Antropic arrastra
`localhost.har` (5,5 MB de captura de assets, sin credenciales — ver §1.2 de `AUDITORIA.md`) y
un registro de decisiones que no le sirve a la marca nueva. Arrancar de cero evita tanto el
peso muerto como la necesidad de un `git filter-repo`.

Si en cambio se quiere conservar el historial, hay que purgar el HAR **antes** del primer push:

```bash
git filter-repo --path localhost.har --invert-paths
```

---

## 2. Cambiar la identidad de marca

### 2.1. `lib/brand/src/brand.ts`

El único archivo de texto que hay que editar. Todos los campos están documentados en
`lib/brand/src/types.ts`; los que más importan:

| Campo | Nota |
|---|---|
| `name`, `shortName`, `tagline` | Lo que se ve en el navbar, el pie de página, el correo y la barra lateral del backoffice |
| `deliveryZone` | Distrito de cobertura, tal como lo lee el cliente en el checkout |
| `orderReferencePrefix` | 2 a 6 caracteres. **Se elige una vez y no se cambia más** (§2.3) |
| `storefront.*`, `admin.*` | `<title>`, descripción, Open Graph, iconos y colores del manifest |
| `email.headerColor` | Duplicado deliberado del color de marca (§2.2) |

La configuración se valida al importarse: un campo vacío, un color que no es hexadecimal de 6
dígitos o un prefijo fuera de rango **rompen la compilación** con la lista completa de
problemas. No hay forma de desplegar un clon a medio renombrar.

### 2.2. Colores y fuentes

Los colores de marca viven en **dos representaciones**, y hay que cambiar las dos:

1. Tokens HSL en `artifacts/antropic-store/src/index.css` y
   `artifacts/antropic-admin/src/index.css` (`--primary`, `--promo`, `--accent`, `--muted`…),
   que es de donde los toma toda la interfaz vía shadcn/ui.
2. `brand.email.headerColor` en `lib/brand`, en hexadecimal.

**No es un descuido que estén separados**: los clientes de correo descartan las hojas de
estilo, así que las plantillas tienen que llevar el color en línea y no pueden leer un token
CSS. Es el único duplicado legítimo del color de marca, y está señalado como tal en el código.
Un rebranding que toque solo `index.css` deja todos los correos con la paleta vieja.

Las fuentes se declaran en el mismo `index.css`: el `@import` de Google Fonts arriba del
archivo y los tokens `--app-font-sans` / `--app-font-serif` / `--app-font-display`.

> **Ojo con los colores de prenda.** Los swatches del catálogo (Rosa, Coral, Dorado…) salen de
> la base de datos y describen el color físico de la ropa, no la identidad visual. Nunca entran
> en un cambio de paleta, ni siquiera cuando un hex coincide con el color de marca viejo.

### 2.3. El prefijo de la referencia de pedido

`orderReferencePrefix` es el `ANT` de `ANT-000123`: el código que el cliente escribe en la nota
del Yape y por el que el backoffice busca el pedido. `orderReference()` lo construye y
`parseOrderReference()` lo deshace, los dos en `lib/brand`, para que no puedan separarse.

**Se elige antes del primer pedido y no se toca nunca más.** Cambiarlo en una tienda con
historial deja sin resolver toda referencia ya impresa en un comprobante, guardada en un
historial de Yape o citada en un reclamo. Para una marca nueva es libre; después del
lanzamiento, no.

### 2.4. Imágenes

Reemplazar, conservando el nombre del archivo (o actualizando la ruta en `brand.ts`):

| Archivo | Artefacto | Uso |
|---|---|---|
| `public/favicon.png` (32×32) | store y admin | Pestaña del navegador |
| `public/apple-touch-icon.png` (180×180) | store y admin | Icono en iOS y en el manifest |
| `public/opengraph.jpg` | store | Vista previa al compartir el enlace |
| `logo_antropic.png` | raíz | Logo de referencia; renombrar o eliminar |

Además, los assets propios del diseño en `artifacts/antropic-store/src/assets/`
(`modelo_01.webp`, `modelo_02.webp`, `corcet_blanco.png`) son fotografía de la marca original:
sustituirlos o quitar los componentes que los usan.

### 2.5. Remitente del correo

En el `.env` de producción, `RESEND_FROM` tiene que ir en un dominio propio verificado en
Resend, con SPF, DKIM y DMARC configurados, y **el nombre visible debe coincidir con
`brand.name`**. Un remitente que dice una cosa y un membrete que dice otra es un problema de
entregabilidad, no de estética.

### 2.6. Opcional: nombres de paquetes y carpetas

`artifacts/antropic-store`, `artifacts/antropic-admin` y sus `@workspace/antropic-*` llevan el
nombre de la marca original. **Son identificadores internos: no los ve ningún cliente**, y por
eso la prueba de identidad los ignora a propósito. Renombrarlos es cosmético y se puede hacer
en cualquier momento:

```bash
git mv artifacts/antropic-store artifacts/storefront
git mv artifacts/antropic-admin artifacts/backoffice
# Después: actualizar "name" en cada package.json, las rutas en CLAUDE.md, docs/COMANDOS.md,
# .github/workflows/ci.yml y los mensajes de error de src/lib/supabase.ts; luego
# `pnpm install` y `pnpm run build`.
```

---

## 3. Base de datos e infraestructura nuevas

1. **Proyecto Supabase nuevo.** Base de datos, Auth y Storage separados. Compartir el proyecto
   entre marcas mezcla clientes de las dos en una misma tabla `profiles`; además de ser un
   problema de protección de datos, hace imposible vender o cerrar una de las dos.
2. **Bucket de Storage** con la misma estructura (media pública del catálogo, constancias de
   pago en bucket **privado**).
3. **Aplicar el esquema:** `pnpm --filter @workspace/db run push-force`.
4. **RLS activado tabla por tabla**, y verificado ejecutando
   `pnpm --filter @workspace/scripts run verify-rls` contra el proyecto real. PostgREST queda
   expuesto sobre la misma base y la anon key es pública por diseño: sin RLS, cualquiera lee
   las tablas sin pasar por el Express.
5. **Primer administrador**, promovido a mano por SQL — no existe todavía ningún admin que
   pueda promover a nadie. El procedimiento está en `docs/COMANDOS.md` §1.4.
6. **Catálogo:** `pnpm --filter @workspace/scripts run seed` carga datos de ejemplo. Es un
   punto de partida para probar, no un catálogo real.

---

## 4. Contenido que carga el negocio, no el código

Nada de esto se hereda del clon: son filas en `settings` de la base nueva. Se cargan desde el
backoffice, pestaña por pestaña de `/config`.

- **Legal — bloqueante.** Razón social, RUC y domicilio fiscal. Sin esto la Hoja de
  Reclamación sale sin identificación del proveedor y **no cumple** el D.S. 011-2011-PCM.
- **Textos legales** (privacidad, términos, cookies) redactados y revisados por un abogado para
  *esta* empresa. Mientras estén vacíos la tienda dice que el documento no ha sido publicado, y
  eso es deliberado: un texto inventado que parezca una política real es peor que un hueco
  visible, porque el cliente confía en él y el negocio se cree cubierto. **No se copian los de
  la otra marca**: citan otra razón social y otro RUC.
- **Versión de los textos** (`policyVersion`): al publicar textos nuevos hay que subirla, para
  que el banner vuelva a preguntar y los consentimientos viejos no se arrastren.
- **Contacto** (WhatsApp, Instagram, TikTok), **envío** (tarifa y umbral de envío gratis),
  **Yape** (número y QR), **puntos de recojo**, **banners**, **hero**, **FAQ** y **política de
  devoluciones**.

Y fuera del sistema, pero igual de obligatorio: **inscribir el banco de datos personales de la
marca nueva ante la ANPD**. Es un trámite propio de cada empresa y no se hereda.

---

## 5. Verificación

En este orden. Los cuatro primeros pasos no necesitan infraestructura.

```bash
pnpm install
pnpm run typecheck
pnpm run test         # incluye la prueba de identidad de marca
pnpm run build
```

Después, comprobaciones que solo el navegador y el servidor pueden dar:

| Qué | Cómo | Qué tiene que verse |
|---|---|---|
| Título y meta | `curl -s http://localhost:5173/ \| grep -iE "title\|og:"` | El nombre nuevo, cero rastro del anterior |
| Manifest | `curl -s http://localhost:5173/manifest.webmanifest` | `name` y `theme_color` nuevos |
| Navbar y pie | Abrir la tienda | Wordmark, tagline y zona de reparto nuevos |
| Backoffice | Abrir `/login` y la barra lateral | Nombre nuevo, sin restos del anterior |
| Referencia de pedido | Crear un pedido de prueba | `NUEVO-1`, y el buscador del panel lo encuentra |
| Correo | Disparar una confirmación | Membrete, color y remitente nuevos |
| Barrido final | `grep -ri "<marca-vieja>" artifacts lib scripts docs --exclude-dir=node_modules --exclude-dir=dist` | Solo coincidencias en nombres de carpeta y de paquete (§2.6) |

La prueba de identidad de marca cubre el código fuente, pero **no cubre la base de datos**: un
`settings` copiado de la marca anterior pasa todas las puertas de calidad y aun así muestra el
RUC equivocado. El barrido de la tabla `settings` es manual, y es el paso que más caro sale
saltarse.

---

## 6. Lo que el clon hereda sin arreglar

Honestidad sobre el punto de partida. Estos huecos vienen de la implementación de referencia y
siguen abiertos en cualquier fork; el estado al día está en `AUDITORIA.md`.

- Sin migraciones versionadas: el esquema se aplica con `drizzle-kit push` (§9.3).
- Sin pasarela de pago: el flujo es constancia Yape/Plin con verificación manual (§6).
- Sin facturación electrónica ni tratamiento de IGV (§2.4).
- Sin checkout como invitado: `orders.user_id` es `NOT NULL` (§1.4).
- Meta dinámicos por ruta, `sitemap.xml` y JSON-LD pendientes (§8.1).
- Sin ESLint ni Prettier configurados en el repositorio (§9.4).
