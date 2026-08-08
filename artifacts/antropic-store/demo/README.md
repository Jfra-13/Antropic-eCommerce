# Demo estática del storefront

Empaqueta `antropic-store` en **un solo archivo HTML** que corre sin API, sin base de datos
y sin Supabase. Sirve para mostrar la tienda a alguien por link cuando no hay nada
desplegado: es el mismo código de la app, no una maqueta.

```
demo/
├── capture.mjs            captura las respuestas GET del API a un snapshot JSON
├── seed-demo-config.sql   config de tienda (hero, FAQ, envío, puntos de recojo)
├── build.mjs              build + inlining -> demo/dist/*.html
├── vite.config.ts         build de demo (sustituye 3 piezas, ver abajo)
├── index.html             entrada HTML del build de demo
├── src/
│   ├── main.demo.ts       entry: instala el shim y luego arranca la app real
│   ├── api-shim.ts        API en memoria (parchea window.fetch)
│   ├── supabase-stub.ts   auth y storage locales
│   ├── wouter-memory.tsx  router en memoria
│   └── demo-badge.ts      aviso flotante de "esto es una demo"
└── generated/             snapshot capturado (versionado: el build lo necesita)
```

## Regenerar la demo

Con el API corriendo en `http://127.0.0.1:3001` contra una base ya seedeada
(ver `docs/COMANDOS.md`):

```bash
# 1. (opcional, una vez) config de tienda para que no salgan pantallas vacías
psql "$DATABASE_URL" -f artifacts/antropic-store/demo/seed-demo-config.sql

# 2. capturar el catálogo real desde el API
node artifacts/antropic-store/demo/capture.mjs

# 3. construir el archivo único
node artifacts/antropic-store/demo/build.mjs
```

Salida en `demo/dist/` (ignorado por git):

| Archivo | Para qué |
| --- | --- |
| `antropic-store-demo.html` | documento completo: se abre directo desde el disco |
| `antropic-store-demo.fragment.html` | el mismo contenido sin `<html>/<head>/<body>`, para hosts que ponen su propio wrapper |

El paso 1 sólo hace falta si la base está recién seedeada: el seed de catálogo no llena
`settings` ni `pickup_points`, así que el hero, el FAQ, las devoluciones y los puntos de
recojo quedarían vacíos.

## Qué se sustituye

El build de demo **no toca el código de la aplicación**. Reemplaza tres piezas desde
`vite.config.ts`:

| Pieza real | Sustituto | Por qué |
| --- | --- | --- |
| `src/lib/supabase.ts` | `demo/src/supabase-stub.ts` | no hay proyecto Supabase: el login entra al instante y storage devuelve un pixel |
| `wouter` (sólo dentro de `App.tsx`) | `demo/src/wouter-memory.tsx` | la URL del host no es nuestra y puede estar en un frame donde `pushState` falla |
| `window.fetch` | `demo/src/api-shim.ts` | responde `/api/*` con el snapshot + estado en memoria |

Todo lo demás —componentes, páginas, estilos, React Query, el contexto de tienda— es el
código que se despliega.

## Qué se puede probar en la demo

Funciona: catálogo, búsqueda y filtros, ficha de producto con tallas y colores,
favoritos, carrito de invitada, login, merge del carrito al iniciar sesión, checkout con
envío o recojo, cupones (`ANTROPIC10`, `VERANO25`), creación del pedido y su detalle,
FAQ, devoluciones y puntos de recojo.

No funciona, a propósito: subir la constancia de pago (necesita Supabase Storage), y
cualquier cosa que dependa del panel de administración.

El estado (carrito, pedidos, sesión) vive en la pestaña: recargar deja la demo limpia.
Los datos son el catálogo de ejemplo del seed, no datos reales de la tienda.
