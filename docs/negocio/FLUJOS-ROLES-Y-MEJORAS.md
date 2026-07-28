# Flujos por Rol y Mejoras de Producto — Antropic

> **Fuentes:** `Antropic-Requerimientos.md` (requerimientos cerrados) + `PLANEACION-BACKEND.md` (plan técnico).
> **Fecha:** 2026-07-07
> **Propósito:** describir el sistema terminado desde la perspectiva de cada rol (qué ve, qué hace, qué no puede, qué opciones tiene) y registrar las mejoras de producto priorizadas.

Los cuatro roles funcionan **en cascada**: cada uno hereda las capacidades del anterior. La autorización vive en el API (Express), no en el frontend.

| Rol | Sesión | Ámbito |
|---|---|---|
| Visitante anónimo | Sin sesión (localStorage) | Público |
| Cliente registrado | Supabase Auth · `customer` | Solo lo suyo |
| Empleado | Backoffice · `employee` | Operaciones, vista limitada |
| Administrador | Backoffice · `admin` | Control total del negocio |

---

## 1. Visitante anónimo

Cualquiera que entra sin cuenta. Puede mirar y armar carrito, pero para pagar debe registrarse. Es la puerta de entrada — su fricción define cuánta gente compra.

### Qué ve
- Home con **banners promocionales** y productos destacados / novedades.
- Catálogo completo con **precios visibles sin registro**.
- Navegación por **Categorías** y por **Ocasión de uso** (fiesta, oficina…).
- Ficha de producto: galería de **fotos + video lookbook**, tallas y colores con stock por combinación, productos similares.
- **Tabla de medidas** y el botón del recomendador "Paolo" en estado **"En desarrollo"** (deshabilitado).
- Estado de stock por variante ("Última talla M"; la agotada se muestra deshabilitada, no se oculta).

### Qué puede hacer
- Buscar y **filtrar** por talla, color, categoría y ocasión.
- Ordenar por relevancia, precio o novedad.
- **Añadir al carrito sin registrarse** (persiste en el navegador).
- Editar cantidades y quitar ítems del carrito.
- Dejar su correo en **"Avísame cuando haya stock"** de una talla agotada.
- Iniciar registro/login con **Google (un tap)** o **Magic Link**.

### Qué NO puede
- **Pagar / hacer checkout** — el registro es obligatorio antes del pago.
- Guardar una **wishlist persistente** (el ♡ le pide login al continuar).
- Ver historial de pedidos, tracking ni boletas.
- Aplicar cupón hasta estar logueado en el checkout.

### Opciones que tiene
- Registrarse / iniciar sesión en cualquier momento sin perder el carrito (se **fusiona** al loguearse).
- Contactar por **WhatsApp** (deep link) desde la tienda.
- Explorar todo el catálogo indefinidamente como invitado.

> **Regla de negocio:** el invitado arma el carrito libremente, pero el **registro es obligatorio antes de pagar**. Al loguearse, su carrito de localStorage se fusiona con el carrito persistido en su cuenta (suma cantidades, respeta stock).

---

## 2. Cliente registrado

Ya tiene cuenta (Google o Magic Link). Hereda todo lo del visitante y suma la capacidad de comprar, hacer seguimiento y gestionar su relación con la tienda. Solo ve y toca **lo suyo** (ownership estricto en el backend).

### Qué ve
- Todo lo del visitante, ya identificado.
- **Historial de pedidos** detallado con estado de cada uno.
- **Boleta simple interna** (ID de compra + IDs de producto), visible/descargable.
- **Tracking interno** paso a paso: En preparación → Enviado → Entregado / Listo para recojo.
- Su **wishlist** persistente.
- Pantalla **"Pago en verificación"** que cambia sola a **"Pago exitoso"** (polling cada 5s).

### Qué puede hacer
- **Checkout completo:** elegir Delivery (dirección + tarifa) o Recojo en La Molina (gratis).
- Aplicar **cupón** en el carrito (valida vigencia, usos, monto mínimo).
- Pagar con **Yape/Plin**: ver QR + número, poner la referencia `ANT-#orden` y **subir la constancia**.
- Solicitar una **devolución** (formulario → genera ticket → sigue por WhatsApp).
- Suscribirse a **"Avísame cuando haya stock"**.
- Editar **perfil**, dirección de envío y **preferencias de talla**.

### Qué NO puede
- Ver pedidos, wishlist o datos **de otros usuarios**.
- Cambiar el estado de sus pedidos ni **aprobar su propio pago**.
- Entrar al **backoffice** (catálogo, cupones, reportes, usuarios).
- Tener **varias direcciones** (multi-dirección no está en esta etapa).
- Pagar con tarjeta o transferencia (solo Yape/Plin por ahora).

### Opciones que tiene
- Login sin contraseña: **Google OAuth** o **Magic Link**.
- Recibir **notificaciones**: confirmación, pago exitoso, cambios de estado, stock disponible, recordatorio de carrito.
- Continuar la postventa por **WhatsApp** con la tienda.

> **Flujo estrella:** Carrito → Login (1 tap) → elegir entrega → cupón → Yape/Plin + constancia → "En verificación" → (aprobación manual/n8n) → **"Pago exitoso"**. Todos los **totales se calculan en el servidor**; el cliente nunca define montos.

---

## 3. Empleado — Operaciones / Logística

Trabaja en el backoffice (`antropic-admin`, artifact separado). Opera el día a día: verifica pagos, mueve pedidos, carga stock y atiende devoluciones. **No toca configuración de dinero ni datos de usuarios.**

### Qué ve
- **Dashboard limitado** (sin reportes financieros completos).
- **Pedidos**: lista + detalle con datos del cliente y productos.
- **Verificación de pagos**: cola de constancias Yape pendientes, con la referencia `ANT-#orden`.
- **Envíos / Logística**: tablero tipo Kanban por estado (delivery y recojo).
- **Catálogo & Inventario**: productos, variantes talla/color, stock.
- **Devoluciones**: tickets generados por los clientes.

### Qué puede hacer
- **Aprobar o rechazar** constancias de pago (queda registrado quién y cuándo).
- Al aprobar → la orden pasa a `pagado` y se **decrementa el stock** en una transacción.
- Avanzar estados de envío: En preparación → Enviado → Entregado / Recogido.
- Cargar stock **manual** e **importar Excel/CSV** (upsert por SKU, con errores por fila).
- Crear/editar productos y variantes, subir fotos y video a Storage.
- Atender devoluciones y **continuar por WhatsApp**.

### Qué NO puede
- Gestionar **Cupones** (solo Admin).
- Ver **Reportes** completos (conversión, tráfico, financieros).
- Entrar a **Usuarios**: no crea empleados ni bloquea clientes.
- Tocar **Configuración global**: tarifa de delivery, número/QR Yape, banners, puntos de recojo.

### Opciones que tiene
- Filtrar y **exportar** listas de pedidos.
- Contactar clientes por **WhatsApp** desde el detalle del pedido/ticket.
- Ver la constancia con **URL firmada** temporal (bucket privado).

> **Punto más crítico del sistema:** aprobar un pago = transición de estado + decremento de stock de N variantes, todo en **una sola transacción con validación**. Si no alcanza el stock, el sistema avisa al empleado en lugar de sobrevender. La aprobación es **idempotente**: aprobar dos veces no descuenta stock dos veces.

---

## 4. Administrador — Dueño / Gerente

Control total del negocio. Hereda todo lo del empleado y suma la capa de decisión: dinero, reglas, personas y configuración. Es el único que ve el panorama completo.

### Qué ve
- **Dashboard completo**: ventas del día, pedidos, conversión, ticket promedio.
- **Alertas**: pagos por verificar, carritos abandonados, stock bajo, devoluciones nuevas.
- **Reportes**: top ventas, carritos abandonados (valor + recuperables), conversión y tráfico.
- Todo lo del empleado: pedidos, pagos, envíos, catálogo, devoluciones.
- **Cupones**, **Usuarios** y **Configuración global**.

### Qué puede hacer
- Todo lo del empleado, **sin restricciones**.
- **CRUD de cupones**: código, % o monto, vigencia, límite de usos, monto mínimo, activo/inactivo.
- **Crear/editar empleados** y **bloquear clientes**.
- Configurar **tarifa de delivery**, número y **QR de Yape**, **banners** del home, puntos de recojo.
- Exportar reportes y disparar recordatorios de carrito abandonado.

### Qué NO puede (por diseño)
- **Borrar productos con historial**: se desactivan (soft delete), no se eliminan — las órdenes viejas los referencian.
- Alterar **totales de órdenes ya cerradas** (el snapshot de precio es inmutable).
- Tocar la **infraestructura** (Supabase/Vercel/DO) desde el panel — eso es devops, no negocio.

### Opciones que tiene
- Filtrar reportes por rango de fechas y exportar.
- Definir la única config pendiente: **monto de la tarifa de delivery La Molina**.
- Gestionar toda la **identidad comercial** (banners, promos, QR) sin tocar código.

---

## 5. Mejoras de producto — priorizadas

El plan cubre el núcleo transaccional muy bien. Estas piezas marcan la diferencia entre "una tienda que funciona" y "una tienda que vende y no da dolores de cabeza".

Prioridad: **P1** pre-lanzamiento · **P2** pronto · **P3** futuro.

### ✅ P1 — Prioridad acordada (pre-lanzamiento)

| # | Mejora | Área | Por qué |
|---|---|---|---|
| 1 | **Libro de Reclamaciones virtual** | Legal · Perú | **Obligatorio por Indecopi** para todo ecommerce en Perú. Vista simple + almacenamiento del reclamo. Se olvida y trae multa. Va junto a Términos, Privacidad y Política de Devoluciones. |
| 2 | **SEO + analítica real** | Crecimiento | El plan pide reportes de conversión/tráfico pero **nada los alimenta**. Se necesita GA4 / Vercel Analytics con eventos de embudo (ver producto, add-to-cart, checkout) + meta tags, sitemap y Open Graph para que Google y WhatsApp muestren bien los productos. |
| 3 | **Reseñas y fotos de clientas** | Confianza | La **prueba social** es el mayor multiplicador de conversión en moda y no está en el plan. Reseña con estrellas + foto real por producto, solo compradores verificados. Alimenta "productos similares" y da contenido para Instagram. |
| 4 | **Imágenes optimizadas** | Rendimiento | Es tienda de moda: el peso son las fotos. Servir **WebP/AVIF, tamaños responsivos y lazy-load** desde el CDN de Supabase Storage. Sin esto, el móvil en 4G peruano carga lento y la gente rebota. |

### P2 — Pronto

| # | Mejora | Área | Por qué |
|---|---|---|---|
| 5 | **Carrito abandonado automatizado** | Recuperación | El plan detecta y alerta, pero recuperar requiere el correo automático de vuelta. Resend (ya elegido) + job simple: "olvidaste algo", idealmente con cupón. |
| 6 | **Reserva temporal de stock** | Pagos | El stock baja al aprobar el pago; dos clientas pueden pagar la última talla M a la vez. Definir umbral: apenas duela (agotados frecuentes), reservar 15–30 min al iniciar checkout. |
| 7 | **Tipos de cupón extra** | Cupones | Sumar **"envío gratis"** y **"primera compra"** además de % y monto fijo. Son las promos que más mueven en moda; el modelo de datos casi los soporta. |
| 8 | **Bitácora de auditoría** | Operaciones | El plan registra quién aprobó cada pago. Extenderlo a todo cambio sensible (stock editado, cupón creado, cliente bloqueado, precio cambiado). |
| 9 | **Accesibilidad y estados vacíos** | UX | Teclado, foco visible, contraste, `alt` en fotos. Cuidar "sin resultados / carrito vacío / sin pedidos": parte de la UX que suele quedar fea. |

### P3 — Futuro

| # | Mejora | Área | Por qué |
|---|---|---|---|
| 10 | **Boleta electrónica SUNAT** | Comprobantes | Hoy hay boleta interna (correcto para arrancar). Cuando el volumen lo justifique, integrar facturación electrónica (Nubefact u similar). |
| 11 | **Puntos / referidos** | Fidelización | Programa simple de puntos por compra o código de referida. La base de clientas ya existe; monetizar recurrencia es el paso natural. |
| 12 | **Envío nacional** | Alcance | Hoy solo delivery/recojo en La Molina. Sumar zonas y tarifas nacionales — el modelo de tarifa por zona ya está contemplado, solo hay que activarlo. |

> **Lo que NO se agrega:** el plan descarta con criterio microservicios, WebSockets, Redis, gRPC y compañía — costo sin beneficio a esta escala. Esta lista suma **valor de producto y cumplimiento legal**, no complejidad de infraestructura. Primero vender bien y legal; lo demás, cuando el negocio lo pida.

---

## 6. Encaje con el cronograma

Las P1 no cambian el orden de desarrollo del plan (datos → contrato → slices verticales); se integran así:

- **P1.4 Imágenes optimizadas** → durante la Fase 2 (catálogo + ficha de producto con media).
- **P1.2 SEO + analítica** → transversal, se instrumenta a medida que salen las vistas públicas.
- **P1.3 Reseñas** → después de que existan órdenes (compradores verificados), Fase 5–6.
- **P1.1 Libro de Reclamaciones + páginas legales** → antes de producción (Fase 5), bloqueante para lanzar en Perú.

---

## 7. Tareas concretas por P1

Desglose accionable de cada P1. Marcar `[x]` al completar.

### P1.1 — Libro de Reclamaciones + páginas legales

- [ ] Tabla `complaints` (Drizzle): `id` (uuid), `type` (`reclamo` | `queja`, pgEnum), datos del consumidor (nombre, tipo/nº documento, correo, teléfono, domicilio), detalle del bien/servicio, `amount` (monto reclamado, opcional), `description`, `status` (`recibido` | `respondido`, pgEnum), `created_at`, `responded_at`.
- [ ] Ruta pública `/libro-de-reclamaciones` con formulario — **acceso libre sin login** (lo exige Indecopi).
- [ ] `POST /api/complaints` con validación Zod + rate limiting (endpoint público).
- [ ] Copia automática por correo al consumidor y al negocio al registrar (Resend). Reflejar el **plazo legal de respuesta: 15 días hábiles**.
- [ ] Vista admin en backoffice: listar reclamos, ver detalle, marcar `respondido`.
- [ ] Páginas estáticas: **Términos y Condiciones**, **Política de Privacidad**, **Política de Cambios y Devoluciones**. Enlaces en el footer.
- [ ] Link visible al Libro de Reclamaciones en el footer (requisito de visibilidad).

### P1.2 — SEO + analítica real

- [ ] Meta `title` + `description` por página; **Open Graph / Twitter Card** en ficha de producto (imagen, nombre, precio) para previews en WhatsApp/redes.
- [ ] `sitemap.xml` dinámico (catálogo + categorías) y `robots.txt`.
- [ ] Datos estructurados **JSON-LD `Product`** en la ficha (rich snippets de Google: precio, disponibilidad).
- [ ] Instrumentar analítica (GA4 o Vercel Analytics) con eventos de embudo: `view_item`, `add_to_cart`, `begin_checkout`, `purchase`.
- [ ] Conectar los reportes del admin (conversión, tráfico, carritos abandonados) a estos eventos — hoy no tienen fuente de datos.
- [ ] URLs limpias y `canonical` por producto/categoría.

### P1.3 — Reseñas con foto (compradores verificados)

- [ ] Tabla `product_reviews`: `id`, `product_id` (FK), `user_id` (FK), `order_id` (FK, prueba de compra), `rating` (1–5, `CHECK`), `comment`, `photo_path` (Storage, opcional), `status` (`pendiente` | `aprobado` | `oculto`, pgEnum), `created_at`.
- [ ] Regla: **solo reseña quien compró** ese producto y la orden está `entregado`/`recogido`.
- [ ] Endpoints: `POST /api/products/:id/reviews`, `GET /api/products/:id/reviews` (paginado) con `avg_rating` + conteo.
- [ ] UI ficha de producto: promedio en estrellas, lista de reseñas con foto.
- [ ] Formulario de reseña desde el historial de pedidos del cliente.
- [ ] Moderación en backoffice: aprobar/ocultar reseñas (nueva entrada de menú).

### P1.4 — Imágenes optimizadas

- [ ] Servir **WebP/AVIF** con `<picture>` + `srcset` + `sizes` (tamaños responsivos por breakpoint).
- [ ] Generar variantes al subir a Storage (thumb / card / detalle) o usar el **image transform de Supabase**.
- [ ] `loading="lazy"` + `decoding="async"` en grillas de catálogo.
- [ ] Placeholder (blur o skeleton) mientras carga la imagen.
- [ ] Validar peso/dimensiones máximas al subir desde el backoffice.
- [ ] Dimensiones explícitas (width/height o aspect-ratio) para evitar layout shift (CLS).
