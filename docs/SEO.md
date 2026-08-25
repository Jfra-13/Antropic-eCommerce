# SEO y rendimiento del storefront

Qué hace esta tienda para que la encuentren y para que cargue rápido en un móvil peruano, y qué
deliberadamente no hace. Escrito en la Fase 7b de `docs/AUDITORIA.md` (§4, §8.1).

**El problema que resuelve:** las 12 rutas compartían un único `<title>` y una única
descripción. Un producto compartido se veía como la home, un resultado de búsqueda no
distinguía una prenda de la página de devoluciones, y el navegador descargaba la tienda entera
—checkout, cuenta, formulario de reclamaciones y textos legales— para pintar una parrilla de
productos.

---

## 1. El origen público: una sola decisión de la que cuelga todo

Tres cosas necesitan saber en qué dirección vive la tienda: las URL canónicas, el `sitemap.xml`
y el `robots.txt`. Ninguna se puede deducir en tiempo de ejecución —`window.location.origin`
declararía canónica a una copia de staging, que es exactamente cómo una preview termina
indexada en lugar de la tienda—, así que el valor se configura:

```ts
// lib/brand/src/brand.ts
siteUrl: "https://tienda.example",   // null mientras no haya dominio
```

y se puede sobreescribir por entorno con `VITE_PUBLIC_SITE_URL` (storefront) o `STORE_URL`
(API), para que staging se declare canónico a sí mismo. La regla de resolución es una sola,
`resolveSiteUrl()`, y la comparten el front y el servidor: dos sitios decidiendo cuál es la
dirección del sitio acaban discrepando, y un sitemap que contradice a las etiquetas canónicas
hace que un buscador desconfíe de ambos.

**Con `siteUrl` en `null` la tienda no es indexable, a propósito.** El `robots.txt` sale
`Disallow: /`, no se emite ninguna canónica, no se publica JSON-LD y el sitemap responde 503.
No es un estado a medias: es la respuesta correcta para un despliegue que no sabe su propia
dirección. Publicar el dominio lo enciende todo con una línea.

> Hoy `brand.siteUrl` es `null` porque el dominio todavía no está decidido. **Es el único
> paso pendiente para que esta fase esté completa en producción.**

## 2. Metadatos por ruta

`artifacts/antropic-store/src/lib/seo.ts` expone `useSeo()`, que cada página llama con su
título, su descripción y su ruta canónica. Escribe título, descripción, canónica, `robots`,
Open Graph, Twitter Card y JSON-LD.

Dos detalles que parecen menores y no lo son:

- **Cada llamada escribe el juego completo**, no solo los campos que recibe. Una escritura
  parcial dejaría la descripción de la ruta anterior bajo el título de la nueva, que es peor
  que no tener metadatos por ruta porque *parece* correcto.
- **Las etiquetas existentes se actualizan, no se duplican.** El `<head>` ya trae una
  `description` inyectada por el plugin de marca; dos `<meta name="description">` en un mismo
  documento es comportamiento indefinido para un rastreador.

**Lo que esto NO arregla:** las vistas previas de WhatsApp, Instagram y Facebook. Sus
rastreadores no ejecutan JavaScript: leen el HTML estático y seguirán mostrando la vista previa
del sitio para cualquier URL. Arreglarlo exige HTML pre-renderizado, que la auditoría descartó
por alcance (§0.2). Google sí ejecuta JavaScript, así que la indexación y el resultado de
búsqueda sí mejoran.

### Rutas privadas

Carrito, checkout, cuenta, detalle de pedido, favoritos, login y la 404 van `noindex, nofollow`
y sin canónica. Una URL de checkout en Google es un ticket de soporte; un detalle de pedido es
la dirección de alguien.

**`/libro-de-reclamaciones` es indexable a propósito** y no está en la lista de `Disallow`: la
ley exige que sea públicamente accesible, así que que se encuentre es parte de cumplir.

### Navegación por facetas

`/search` acepta término, categoría, talla, color, ocasión y orden. La canonicalización sigue la
práctica estándar:

| Caso | Qué se hace | Por qué |
|---|---|---|
| Hay término de búsqueda (`?q=`) | `noindex` | Es una página de resultados internos: se genera bajo demanda y duplica el catálogo |
| Hay categoría | Canónica propia `/search?category=X` | Es una faceta real y finita: merece su URL |
| Talla, color, ocasión, orden, vista | Canónica a la categoría o al catálogo | Son ordenaciones y subconjuntos del mismo conjunto; una URL por combinación convierte 20 productos en miles de páginas pobres |

## 3. `sitemap.xml`: lo sirve la API, no el build

El sitemap tiene que listar cada producto activo con su fecha de modificación, y eso solo lo
sabe la base de datos. Generarlo en el build ataría la compilación del frontend a un
`DATABASE_URL` y, peor, congelaría la lista en el momento del último despliegue: un producto
publicado un martes seguiría invisible hasta la siguiente release.

Vive en `GET /api/sitemap.xml` (declarado en `openapi.yaml`, como `/healthz` y `/readyz`).

**Falta un paso de infraestructura:** un rastreador espera encontrarlo en
`https://tienda/sitemap.xml`, que es la URL que anuncia el `robots.txt`. Hay que reescribir esa
ruta hacia la API en el borde (proxy inverso, o `rewrites` del hosting):

```
/sitemap.xml  ->  /api/sitemap.xml
```

Sin esa reescritura el documento existe y es correcto, pero nadie lo pide. Es el único
pendiente de esta fase que no es código.

Qué incluye y qué no: las rutas públicas estáticas y los productos **activos**. `active` es el
borrado lógico del catálogo, y publicar una URL que responde 404 enseña al rastreador a
desconfiar del documento entero, incluidas las entradas que sí son buenas.

## 4. JSON-LD

`src/lib/structured-data.ts`: `Organization` y `WebSite` en la home, `Product` + `Offer` y
`BreadcrumbList` en la ficha, `BreadcrumbList` en el catálogo.

La disponibilidad del `Offer` sale del **stock real**, no de un `InStock` fijo. Anunciar
disponibilidad que la tienda no puede cumplir es un problema de protección al consumidor antes
que de SEO.

## 5. Rendimiento: qué se midió

Medido en este repositorio, con `pnpm --filter @workspace/antropic-store run build`:

| | Antes | Después |
|---|---|---|
| Carga inicial de JavaScript | 733,5 kB (**211,6 kB** gzip) en un solo archivo | **188,7 kB** gzip repartidos en 4 |
| Rutas en el paquete inicial | Las 16 | Solo la home |
| Aviso de Vite «chunks > 500 kB» | Sí | No |

Dos cambios distintos:

- **Code-splitting por ruta** (`React.lazy` en `App.tsx`). La home se importa de forma
  ansiosa a propósito: es donde aterriza la mayoría, y cargarla en diferido añadiría un viaje
  de red antes del primer pintado de la página que más importa.
- **Separación de terceros** (`vendor-react`, `vendor-supabase`, `vendor-radix`). El código de
  terceros cambia con su propio calendario; el de la aplicación, en cada despliegue. Juntos,
  arreglar una errata obligaba a redescargar React a todos los visitantes recurrentes.

El presupuesto de tamaño está **enforced**: `scripts/bundle-budget.mjs` corre como parte de
`build`, mide el gzip de lo que se descarga antes de la primera pantalla y falla por encima de
225 kB. Un presupuesto que nadie comprueba es un comentario. Subirlo es una decisión: se hace
en el mismo commit que lo necesita, con el motivo en el mensaje.

### Imágenes

El *hero* de la home es el elemento LCP: no lleva `loading="lazy"` —cargar en diferido el
elemento LCP retrasa justo la métrica que define— y sí `fetchPriority="high"`. Las demás van
en diferido. Los banners promocionales pasaron de `max-h-72` a `h-72`: una altura máxima no
reserva nada hasta que la imagen llega, así que el contenido de abajo saltaba en cada carga.

## 6. Lo que NO está montado, y por qué

- **Pre-renderizado / SSR.** Descartado por alcance (§0.2). Es lo único que arreglaría las
  vistas previas por producto en WhatsApp.
- **Google Search Console.** Trámite externo: hay que verificar la propiedad y enviar el
  sitemap a mano una vez el dominio exista.
- **GA4 y eventos de ecommerce.** Bloqueados por el consentimiento (§2.2): analítica que se
  dispara antes de que el usuario acepte es el incumplimiento, no la solución.
- **Imágenes por CDN y formatos modernos servidos por negociación.** Es infraestructura, no
  código de la aplicación. La imagen más pesada del repositorio pesa 1,25 MB.
- **Fuente autoalojada.** Sigue en Google Fonts con `preconnect`. Autoalojarla mete binarios
  en `public/` y toca las dos SPA; no se hizo aquí para no mezclarlo con esta revisión.
- **Medición en campo (LCP, INP, CLS con tráfico real).** Requiere el sitio desplegado y un
  móvil de gama media con red peruana. Este contenedor no puede hacerlo.

## 7. Cómo comprobarlo

```bash
# robots.txt y presupuesto de tamaño salen del build
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/antropic-store run build
cat artifacts/antropic-store/dist/public/robots.txt

# sitemap contra la base real
STORE_URL=https://tienda.example pnpm --filter @workspace/api-server run start
curl -s localhost:3001/api/sitemap.xml | head

# metadatos por ruta, en un navegador de verdad
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/antropic-store run serve
# y con Playwright: ver la evidencia en docs/AUDITORIA.md §11.8
```

Las pruebas que bloquean en CI son las que corren en cualquier sitio: `lib/brand/src/seo.test.ts`
(resolución del origen y `robots.txt`) y `modules/seo/sitemap.integration.test.ts` (el sitemap
contra Postgres real). La comprobación en navegador es evidencia de la fase, no una puerta de
CI: exigiría Chromium en el pipeline y esa decisión no se ha tomado.
