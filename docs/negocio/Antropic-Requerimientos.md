# Documento de Requerimientos Técnicos y Funcionales — Ecommerce Antropic

> **Fuentes de este documento:**
> 1. `Antropic-OBJETIVO.txt` — estructura de requerimientos (plantilla).
> 2. `Antropic-Analisis-Preguntas.md` — respuestas de producto del cliente (RF).
> 3. Estado actual del monorepo (`CLAUDE.md`) — stack ya definido en el código.
>
> Los puntos marcados **[DECISIÓN PENDIENTE]** requieren confirmación del negocio antes de implementar. Las **[ASUNCIÓN]** son valores por defecto razonables que se pueden cambiar.

---

## 1. Stack Tecnológico y Arquitectura Base

Ya definido por el repositorio actual (monorepo pnpm workspaces).

| Aspecto | Definición |
|---|---|
| **Frontend** | React + Vite + TypeScript. UI con shadcn/ui + Tailwind. Routing con `wouter`. (paquete `antropic-store`) |
| **Backend** | Express 5 + TypeScript, montado bajo `/api`. Logging con pino. (paquete `api-server`) |
| **Base de Datos** | Relacional (SQL) — PostgreSQL vía Drizzle ORM. Push-based, sin migraciones versionadas por ahora. (paquete `db`) |
| **Contrato API** | Spec-first con OpenAPI (`openapi.yaml`) → genera Zod schemas + hooks React Query (Orval). |
| **Infraestructura** | **DECIDIDO** — **Supabase** como núcleo (Postgres administrado + Auth + Storage). Front en **Vercel**. API Express en **DigitalOcean App Platform** (usa el crédito estudiante de $200) o Render. Ver nota abajo. |
| **Seguridad / Auth** | **DECIDIDO** — **Supabase Auth**: Google OAuth (un click) + Magic Link (link de acceso al mismo correo, sin contraseña). Objetivo: mínimos clics para comprar. HTTPS obligatorio. |

**Por qué Supabase (escalabilidad + menos trabajo):**
- Es **PostgreSQL administrado** → Drizzle apunta al connection string de Supabase sin cambiar código del `db` package.
- **Auth incluido** → resuelve Google + Magic Link sin construir auth propio ni manejar hashing de contraseñas.
- **Storage** (S3-backed) → guarda fotos y videos de producto (el catálogo requiere lookbook/pasarela).
- Escala con connection pooling (Supavisor). Free tier cubre el lanzamiento; el crédito de $200 (DigitalOcean) se destina al host del API Express.
- Descartados: **Azure DB** y **Heroku** dan solo DB o dynos pagos (más devops, menos features). **DigitalOcean** se usa igual, pero para el API, no para la DB.

**Auth — flujo de mínimos clics:**
1. **Google OAuth** como opción principal (un tap, sin escribir nada).
2. **Magic Link** como alternativa: la clienta escribe su correo → recibe un enlace de acceso → clic → sesión iniciada. Sin contraseñas.

**Estado real hoy:** el storefront es solo-frontend. Carrito, favoritos y auth están *mockeados* en `StoreContext.tsx` + `localStorage`, con data estática en `mockData.ts`. **Aún no está conectado al `api-server`.** Conectarlo es parte del trabajo real de este proyecto.

---

## 2. Roles y Permisos (Matriz de Acceso)

### A. Usuario Externo (Invitado)
| Permiso | Definición |
|---|---|
| Ver precios sin registro | **Sí** (catálogo público). |
| Carrito sin registro | **Sí**, persistido por sesión/localStorage. |
| Checkout | **No** — registro obligatorio antes de pagar (ver Módulo C.1). El invitado puede armar carrito pero debe registrarse para pagar. |

### B. Cliente Registrado
| Permiso | Definición |
|---|---|
| Editar perfil | Datos personales + preferencias de talla. Dirección de envío única por ahora (multi-dirección **NO** marcado). |
| Historial | **Sí**, historial de pedidos detallado. **Boleta simple interna** (no comprobante SUNAT): muestra ID de compra + IDs de producto como evidencia. Descargable/visible como resumen de orden. |
| Wishlist | **Sí**, lista de deseos persistente. |
| Login social | **DECIDIDO** — Google OAuth + Magic Link vía Supabase Auth (ver sección 1). |

### C. Empleado (Operaciones/Logística)
| Permiso | Definición |
|---|---|
| Inventario | Carga manual (individual) + importación masiva Excel/CSV. |
| Estados de pedido | Cambiar entre: En preparación → Enviado → Entregado (tracking interno). |
| Postventa | Acceso a formularios de devolución para contactar por WhatsApp. |

### D. Administrador (Dueño/Gerente)
| Permiso | Definición |
|---|---|
| Dashboard | Reportes: Top ventas, carritos abandonados (con alerta), conversión y tráfico. |
| Gestión de usuarios | Crear perfiles de Empleado, bloquear clientes. |
| Configuración global | Gestión de cupones (ver C.3), banners promocionales. |

---

## 3. Módulos Técnicos Específicos

### Catálogo
- **Variaciones de producto:** Talla y Color (variantes con stock por combinación). Tela como atributo informativo, no filtro obligatorio.
- **Búsqueda/Navegación:** por **Categorías** y por **Ocasión de uso** (fiesta, oficina, etc.).
- **Filtros indispensables:** Talla y Color.
- **Media:** Fotografías estáticas **+ videos** (lookbook/pasarela) por producto.
- **Recomendaciones:** "Productos similares" (no venta cruzada por ahora).

### Integraciones
- **Recomendador de tallas de "Paolo":** **DIFERIDO**. Se muestra el **botón visible pero con estado "En desarrollo"** (deshabilitado, badge). Es una idea futura, aún por definir contrato (API / iframe / SDK).

### Pagos — Yape/Plin con confirmación manual (sin pasarela)

**DECIDIDO: no se usa Culqi/MercadoPago.** El flujo es billetera directa con verificación manual (automatizable después).

**Flujo del cliente:**
1. En el checkout elige **"Yape/Plin"**.
2. La web muestra la **imagen del QR** + **número de celular** del negocio.
3. El cliente escanea el QR (o ingresa el número) y paga desde su app.
4. **Paso crítico:** el cliente envía la **constancia (captura)** — subiéndola en un **formulario de la web** (preferido, deja registro) y/o por **WhatsApp**.
5. El negocio confirma que llegó el dinero y **aprueba el pedido manualmente**.
6. Al aprobar → la pantalla del usuario pasa a **"Pago exitoso"** y se genera la orden + decrementa inventario.

**Estados de pago de la orden:** `pendiente_pago` → `en_verificacion` (constancia subida) → `pagado` (aprobado) / `rechazado`.

**Automatización futura (fase posterior):**
- **Yapay** (app peruana) lee las notificaciones de Yape del celular → las vuelca a **Google Sheets** en tiempo real (nombre, asunto, monto).
- **n8n** compara cada pago entrante contra las órdenes `en_verificacion` → si coincide, marca `pagado` automáticamente y notifica al usuario.

> **⚠️ RIESGO (verificación automática):** cruzar pago↔orden **solo por monto** es frágil — dos pedidos con el mismo monto colisionan. **Mitigación:** generar un **código de referencia único por orden** (o ajustar los céntimos, ej. S/ 89.03) que el cliente pone en el asunto del Yape, y que n8n use como llave de match. Sin esto, la aprobación automática dará falsos positivos.

- Tarjeta de crédito/débito y transferencia: **no** en esta etapa.

### Logística
- **Modalidades (exclusivas):** **Delivery** o **Recojo en puntos de La Molina**. No hay envío nacional por ahora.
- **Costo de envío:** **separado**, NO incluido en el precio del producto. Se cobra como línea aparte en el checkout.
  - **Recojo en La Molina:** sin costo de envío.
  - **Delivery:** tarifa configurable por el admin (plana o por zona de La Molina). El monto lo define el negocio en configuración.
- **Vista de admin de envíos:** tablero con estados **Pendientes / En preparación / Enviados / Entregados / Recojo pendiente / Recogidos**.

### Notificaciones
- **Al cliente:**
  - Confirmación de compra / "Pago exitoso".
  - "Avísame cuando haya stock" — cuando una talla agotada vuelve a tener stock.
  - Cambio de estado de pedido (enviado/entregado/listo para recojo) — vía tracking interno.
  - **Recordatorio de carrito:** aviso de que tiene productos en el carrito (recuperación).
- **Al admin:**
  - Alerta de **carrito abandonado**.
  - Nueva **constancia de pago** subida (pendiente de verificar).
  - Nueva **solicitud de devolución**.

---

## 4. Flujos de Trabajo (Workflows)

### Flujo de Compra
1. **Carrito** (invitado o registrado puede armarlo).
2. **Registro/Login obligatorio** antes de continuar al pago.
3. **Método de entrega:** Recojo en punto de La Molina (sin costo) o Delivery (costo aparte).
4. **Cupón** (opcional) — código de Instagram o interno, ingresado en el carrito (ver C.3).
5. **Pago Yape/Plin:** muestra QR + número → cliente paga → sube constancia → orden queda `en_verificacion`.
6. **Aprobación manual** (o automática vía n8n) → orden `pagado` → **genera orden + decrementa inventario** → pantalla "Pago exitoso".

### Flujo de Devolución
1. Cliente llena **formulario web** en su perfil → sistema genera **ticket de seguimiento**.
2. El ticket **notifica al empleado** (pendiente en backoffice + notificación).
3. La conversación continúa por **WhatsApp** (iniciada por la tienda o la clienta).

---

## Detalle por Módulo del Cuestionario (RF)

### Módulo B — Tallas y Calce
- Tabla de medidas estándar **+** recomendador inteligente (peso/altura) = demo de **Paolo**.
- Talla agotada → botón **"Avísame cuando haya stock"** (no ocultar variante).

### Módulo C — Checkout
- Registro obligatorio antes del pago.
- Pago: Yape/Plin con confirmación manual (ver sección Pagos).
- **C.3 Cupones:** **DECIDIDO** — **campo de código en el carrito**. Los cupones son internos y/o difundidos por Instagram, pero se **crean y gestionan desde el panel de administrador** con: código, tipo (% o monto fijo), límite de tiempo (fecha inicio/fin), límite de usos, activo/inactivo.

### Módulo D — Perfil y Postventa
- Historial de pedidos + Wishlist.
- Devolución: formulario automatizado + contacto WhatsApp.
- Tracking interno paso a paso dentro de la app.

### Módulo E — Backoffice
- Carga de stock: manual por Admin de Contenidos **+** importación Excel/CSV.
- Reportes: Top ventas, carritos abandonados (+alerta), conversión y tráfico.

---

## 5. Cronograma y Entregables

| Fase | Entregable |
|---|---|
| **1** | Diseño de BD (schema Drizzle) + API base (auth, catálogo, carrito) + **conectar storefront al API** (reemplazar mocks). |
| **2** | Vistas de usuario: catálogo con filtros (talla/color/ocasión), ficha de producto con media, checkout. |
| **3** | Backoffice: gestión de inventario (manual + Excel/CSV), pedidos, reportes. |
| **4** | Integraciones de terceros: pasarela de pago (Yape/Plin) + webhooks + recomendador de tallas de Paolo. |
| **5** | Pruebas de estrés + despliegue en producción. |

---

## Decisiones (resueltas)

- [x] **Infraestructura/hosting** → Supabase (DB+Auth+Storage) + Vercel (front) + DigitalOcean App Platform (API, crédito $200).
- [x] **Pagos** → Yape/Plin manual (constancia + aprobación), automatizable con Yapay + Google Sheets + n8n. Sin pasarela.
- [x] **Costo de envío** → separado del precio; Recojo La Molina gratis, Delivery tarifa configurable por admin.
- [x] **Comprobantes** → boleta simple interna (ID compra + IDs producto), sin SUNAT.
- [x] **Login social Google** → sí, vía Supabase Auth (Google + Magic Link).
- [x] **Recomendador de Paolo** → diferido; botón visible con estado "En desarrollo".
- [x] **Cupones** → campo en carrito + gestión desde panel admin (límites de tiempo/uso).

**Único punto abierto (config, no bloqueante):** monto exacto de la tarifa de delivery de La Molina — lo define el negocio en el panel.

---

## 6. Módulos Finales — Backoffice (Admin / Empleado) con UI/UX en ASCII

> Estos son los mockups de las vistas de **Administrador** y **Empleado**. Las vistas de **Usuario/Visitante** están descritas de forma **textual** en la sección 7 (el cliente las diseña por su cuenta).

### 6.0 Mapa de módulos del backoffice

```
BACKOFFICE
├── Dashboard (Admin)            KPIs, alertas, accesos rápidos
├── Pedidos                      lista + detalle + cambio de estado
│   └── Verificación de Pagos    constancias Yape pendientes de aprobar
├── Envíos / Logística           tablero por estado (delivery / recojo)
├── Catálogo & Inventario        productos, variantes (talla/color), stock
│   └── Importación Excel/CSV     carga masiva
├── Cupones                      CRUD con límites de tiempo/uso
├── Devoluciones                 tickets desde formulario del cliente
├── Reportes                     top ventas, carritos abandonados, conversión
├── Usuarios                     clientes (bloquear) + empleados (crear)  [solo Admin]
└── Configuración                banners, tarifa delivery, QR Yape         [solo Admin]
```

**Permisos por rol:**

| Módulo | Empleado | Admin |
|---|:---:|:---:|
| Dashboard | vista limitada | ✅ completo |
| Pedidos / Verificación de pagos | ✅ | ✅ |
| Envíos / Logística | ✅ | ✅ |
| Catálogo & Inventario | ✅ | ✅ |
| Importación Excel/CSV | ✅ | ✅ |
| Cupones | ❌ | ✅ |
| Devoluciones | ✅ | ✅ |
| Reportes | ❌ | ✅ |
| Usuarios | ❌ | ✅ |
| Configuración global | ❌ | ✅ |

---

### 6.1 Dashboard (Admin)

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ANTROPIC · Admin            [🔍 Buscar]        Hola, Admin ▾   [Cerrar sesión]│
├───────────┬───────────────────────────────────────────────────────────────┤
│ ▸ Dashboard│  DASHBOARD                                   Hoy · 03/07/2026  │
│   Pedidos  │                                                                │
│   Pagos ⚠3 │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────┐│
│   Envíos   │  │ Ventas hoy   │ │ Pedidos hoy  │ │ Conversión   │ │ Ticket ││
│   Catálogo │  │  S/ 1,240    │ │     18       │ │    3.4 %     │ │ S/ 68  ││
│   Cupones  │  │  ▲ 12%       │ │  ▲ 4         │ │  ▼ 0.3%      │ │ prom.  ││
│   Devoluc. │  └──────────────┘ └──────────────┘ └──────────────┘ └────────┘│
│   Reportes │                                                                │
│   Usuarios │  ⚠ ALERTAS                                                     │
│   Config   │  ┌───────────────────────────────────────────────────────────┐│
│            │  │ • 3 pagos Yape pendientes de verificar     [Ver pagos →]  ││
│            │  │ • 5 carritos abandonados (últimas 24h)     [Ver →]        ││
│            │  │ • 2 productos con stock bajo (< 3 und)      [Ver →]        ││
│            │  │ • 1 solicitud de devolución nueva           [Ver →]        ││
│            │  └───────────────────────────────────────────────────────────┘│
│            │                                                                │
│            │  TOP VENTAS (7 días)              CARRITOS ABANDONADOS         │
│            │  1. Vestido Coral      42 und     Total: 5   ·  S/ 890         │
│            │  2. Blusa Rosa         31 und     [Ver detalle y recuperar →]  │
│            │  3. Pantalón Dorado    27 und                                  │
└───────────┴───────────────────────────────────────────────────────────────┘
```

---

### 6.2 Pedidos — Lista y detalle

```
┌───────────────────────────────────────────────────────────────────────────┐
│ PEDIDOS                                        [ Filtros ▾ ] [ Exportar ⭳ ] │
├───────────────────────────────────────────────────────────────────────────┤
│ Estado: (Todos) Pendiente pago · En verificación · Pagado · Enviado · ...   │
├──────────┬────────────────┬───────────┬──────────────┬──────────┬──────────┤
│ # Orden  │ Cliente        │ Monto     │ Pago         │ Entrega  │ Estado   │
├──────────┼────────────────┼───────────┼──────────────┼──────────┼──────────┤
│ #1042    │ María Q.       │ S/ 129.00 │ ⚠ Verificar  │ Delivery │ ● En ver.│
│ #1041    │ Lucía R.       │ S/  89.03 │ ✅ Pagado    │ Recojo   │ ● Prep.  │
│ #1040    │ Ana T.         │ S/ 210.00 │ ✅ Pagado    │ Delivery │ ● Enviado│
│ #1039    │ Sofía M.       │ S/  68.00 │ ✗ Rechazado  │ Recojo   │ ● Cancel.│
└──────────┴────────────────┴───────────┴──────────────┴──────────┴──────────┘

  ── DETALLE PEDIDO #1042 ─────────────────────────────────────────────────
  ┌─────────────────────────────────────────────────────────────────────┐
  │ Cliente: María Quispe · maria@correo.com · WhatsApp: +51 9xx xxx xxx │
  │ Entrega: DELIVERY — Av. La Molina 1234   ·   Envío: S/ 12.00         │
  │─────────────────────────────────────────────────────────────────────│
  │ PRODUCTOS                                                             │
  │  [img] Vestido Coral   Talla M / Coral   x1        S/ 117.00         │
  │─────────────────────────────────────────────────────────────────────│
  │  Subtotal S/ 117.00 · Cupón (INSTA10) −S/ 0.00 · Envío S/ 12.00      │
  │  TOTAL                                              S/ 129.00        │
  │─────────────────────────────────────────────────────────────────────│
  │ CONSTANCIA DE PAGO                                                   │
  │  [ 🖼 captura_yape.jpg ]   Monto detectado: S/ 129.00                │
  │                                                                      │
  │  [ ✅ Aprobar pago ]   [ ✗ Rechazar ]   [ 💬 WhatsApp cliente ]      │
  │─────────────────────────────────────────────────────────────────────│
  │ Cambiar estado:  [ En preparación ▾ ]  → [ Guardar ]                 │
  └─────────────────────────────────────────────────────────────────────┘
```

---

### 6.3 Verificación de Pagos (cola de constancias Yape)

```
┌───────────────────────────────────────────────────────────────────────────┐
│ VERIFICACIÓN DE PAGOS                             3 pendientes  ·  🔄 auto  │
├───────────────────────────────────────────────────────────────────────────┤
│ n8n / Yapay:  ● Conectado — última sincronización 12:41                    │
├──────────┬──────────────┬───────────┬──────────────┬───────────────────────┤
│ Orden    │ Cliente      │ Monto     │ Ref. (asunto)│ Constancia            │
├──────────┼──────────────┼───────────┼──────────────┼───────────────────────┤
│ #1042    │ María Q.     │ S/ 129.00 │ ANT-1042     │ [🖼]  [✅] [✗] [💬]   │
│ #1045    │ Rosa V.      │ S/  89.03 │ ANT-1045     │ [🖼]  [✅] [✗] [💬]   │
│ #1047    │ Elena P.     │ S/ 156.00 │ (sin ref)  ⚠ │ [🖼]  [✅] [✗] [💬]   │
└──────────┴──────────────┴───────────┴──────────────┴───────────────────────┘
  ⚠ "sin ref" = el cliente no puso el código en el asunto → verificar a mano.
  El match automático usa la Ref. única (ANT-#orden), no solo el monto.
```

---

### 6.4 Envíos / Logística

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ENVÍOS                                            [ Delivery | Recojo ]     │
├─────────────┬─────────────┬─────────────┬─────────────┬────────────────────┤
│ PENDIENTES  │ EN PREPAR.  │ ENVIADOS    │ ENTREGADOS  │ RECOJO PENDIENTE   │
│    (4)      │    (3)      │    (2)      │    (12)     │       (5)          │
├─────────────┼─────────────┼─────────────┼─────────────┼────────────────────┤
│ #1042 María │ #1041 Lucía │ #1040 Ana   │ #1035 ...   │ #1039 Sofía        │
│  Delivery   │  Recojo     │  Delivery   │             │  Punto: La Molina  │
│  La Molina  │  Punto A    │  [Tracking] │             │  [Marcar recogido] │
│ [→ Preparar]│ [→ Enviar]  │ [→ Entreg.] │             │                    │
└─────────────┴─────────────┴─────────────┴─────────────┴────────────────────┘
  Tablero tipo Kanban: arrastrar tarjeta o botón para avanzar de estado.
  Solo 2 modalidades: DELIVERY (con tarifa) · RECOJO en puntos de La Molina.
```

---

### 6.5 Catálogo & Inventario + Importación Excel/CSV

```
┌───────────────────────────────────────────────────────────────────────────┐
│ CATÁLOGO E INVENTARIO           [ + Nuevo producto ]  [ ⭳ Importar Excel ] │
├──────────────────────────────────────────────────────────────────────────-┤
│ [🔍 Buscar]   Categoría ▾   Ocasión ▾   Stock: (Todos · Bajo · Agotado)    │
├────────┬──────────────────┬──────────┬─────────────────────────┬───────────┤
│ [img]  │ Producto         │ Precio   │ Variantes (Talla/Color) │ Stock tot.│
├────────┼──────────────────┼──────────┼─────────────────────────┼───────────┤
│ [img]  │ Vestido Coral    │ S/117.00 │ S·M·L × Coral/Rosa      │  24       │
│ [img]  │ Blusa Rosa       │ S/ 79.00 │ S·M × Rosa              │   2  ⚠    │
│ [img]  │ Pantalón Dorado  │ S/ 99.00 │ M·L × Dorado            │   0  ✗    │
└────────┴──────────────────┴──────────┴─────────────────────────┴───────────┘

  ── EDITAR PRODUCTO ──────────────────────────────────────────────────────
  ┌─────────────────────────────────────────────────────────────────────┐
  │ Nombre  [ Vestido Coral                     ]                        │
  │ Precio  [ 117.00 ]   Categoría [ Vestidos ▾ ]  Ocasión [ Fiesta ▾ ]  │
  │ Descripción [ ................................................. ]    │
  │─────────────────────────────────────────────────────────────────────│
  │ MEDIA (Storage Supabase)                                             │
  │  [🖼][🖼][🖼]  [+ Foto]   [🎬 Video lookbook]  [+ Video]            │
  │─────────────────────────────────────────────────────────────────────│
  │ VARIANTES              Talla   Color    SKU        Stock             │
  │                        [ M ▾]  [Coral▾] ANT-VC-M   [ 12 ]  [🗑]      │
  │                        [ L ▾]  [Coral▾] ANT-VC-L   [  8 ]  [🗑]      │
  │  [ + Agregar variante ]                                              │
  │─────────────────────────────────────────────────────────────────────│
  │              [ Cancelar ]            [ Guardar producto ]            │
  └─────────────────────────────────────────────────────────────────────┘

  ── IMPORTAR EXCEL/CSV ───────────────────────────────────────────────────
  ┌─────────────────────────────────────────────────────────────────────┐
  │  Arrastra tu archivo .xlsx / .csv aquí   o   [ Seleccionar archivo ] │
  │  Columnas: nombre, categoria, ocasion, precio, talla, color, sku,   │
  │            stock, descripcion                                        │
  │  [ ⭳ Descargar plantilla ]                                          │
  │─────────────────────────────────────────────────────────────────────│
  │  Vista previa:  24 filas · 2 con error (fila 7: precio vacío)  ⚠     │
  │              [ Cancelar ]        [ Importar 22 válidas ]             │
  └─────────────────────────────────────────────────────────────────────┘
```

---

### 6.6 Cupones (solo Admin)

```
┌───────────────────────────────────────────────────────────────────────────┐
│ CUPONES                                              [ + Crear cupón ]      │
├──────────┬───────────┬──────────┬───────────────────┬─────────┬────────────┤
│ Código   │ Tipo      │ Valor    │ Vigencia          │ Usos    │ Estado     │
├──────────┼───────────┼──────────┼───────────────────┼─────────┼────────────┤
│ INSTA10  │ %         │ 10 %     │ 01/07 → 15/07     │ 34/100  │ ● Activo   │
│ BIENVEN  │ Monto     │ S/ 20    │ 01/06 → 30/06     │ 12/12   │ ○ Expirado │
└──────────┴───────────┴──────────┴───────────────────┴─────────┴────────────┘

  ── CREAR / EDITAR CUPÓN ─────────────────────────────────────────────────
  ┌─────────────────────────────────────────────────────────────────────┐
  │ Código     [ INSTA10          ]   (se ingresa en el carrito)         │
  │ Tipo       (•) Porcentaje   ( ) Monto fijo                           │
  │ Valor      [ 10 ] %                                                   │
  │ Vigencia   Desde [ 01/07/2026 ]   Hasta [ 15/07/2026 ]               │
  │ Límite usos[ 100 ]   ·   Mín. compra [ S/ 0 ]                        │
  │ Estado     [x] Activo                                                 │
  │              [ Cancelar ]            [ Guardar cupón ]               │
  └─────────────────────────────────────────────────────────────────────┘
```

---

### 6.7 Devoluciones (tickets)

```
┌───────────────────────────────────────────────────────────────────────────┐
│ DEVOLUCIONES                                     1 nueva · [ Filtros ▾ ]    │
├──────────┬───────────┬──────────────┬────────────────────┬─────────────────┤
│ Ticket   │ Pedido    │ Cliente      │ Motivo             │ Estado          │
├──────────┼───────────┼──────────────┼────────────────────┼─────────────────┤
│ #DV-07   │ #1035     │ Carla N.     │ Talla no calza     │ ● Nueva         │
│ #DV-06   │ #1028     │ Diana S.     │ Producto fallado   │ ● En proceso    │
└──────────┴───────────┴──────────────┴────────────────────┴─────────────────┘

  ── TICKET #DV-07 ────────────────────────────────────────────────────────
  ┌─────────────────────────────────────────────────────────────────────┐
  │ Cliente: Carla N. · WhatsApp +51 9xx · Pedido #1035 (Vestido Coral)  │
  │ Motivo: "La talla M me queda grande, quiero cambio a S"              │
  │ Datos del formulario:  Talla actual M · Deseada S · Foto adjunta [🖼]│
  │─────────────────────────────────────────────────────────────────────│
  │  [ 💬 Continuar por WhatsApp ]   Estado: [ En proceso ▾ ] [Guardar]  │
  └─────────────────────────────────────────────────────────────────────┘
  Flujo: cliente llena formulario → se crea ticket → notifica al empleado →
  la conversación sigue por WhatsApp.
```

---

### 6.8 Reportes (solo Admin)

```
┌───────────────────────────────────────────────────────────────────────────┐
│ REPORTES                     Rango: [ Últimos 30 días ▾ ]   [ Exportar ⭳ ] │
├───────────────────────────────────────────────────────────────────────────┤
│ CONVERSIÓN Y TRÁFICO                                                        │
│  Visitas 8,420 · Añadió al carrito 640 · Compró 210 · Conversión 2.5%      │
│  ▁▂▃▅▆▇▆▅▃▂▁  (ventas por día)                                             │
│───────────────────────────────────────────────────────────────────────────│
│ TOP VENTAS                          CARRITOS ABANDONADOS                    │
│  1. Vestido Coral   42 und  S/4.9k   Cantidad: 5   ·  Valor: S/ 890        │
│  2. Blusa Rosa      31 und  S/2.4k   Recuperables por recordatorio → 3     │
│  3. Pantalón Dorado 27 und  S/2.6k   [ Ver lista · enviar recordatorio ]   │
└───────────────────────────────────────────────────────────────────────────┘
```

---

### 6.9 Usuarios (solo Admin)

```
┌───────────────────────────────────────────────────────────────────────────┐
│ USUARIOS                    [ Clientes | Empleados ]   [ + Crear empleado ] │
├──────────────────┬──────────────────────┬───────────────┬──────────────────┤
│ Nombre           │ Correo               │ Rol           │ Acciones         │
├──────────────────┼──────────────────────┼───────────────┼──────────────────┤
│ María Quispe     │ maria@correo.com     │ Cliente       │ [Ver] [🚫Bloquear]│
│ Juan (logística) │ juan@antropic.com    │ Empleado      │ [Editar] [🗑]     │
└──────────────────┴──────────────────────┴───────────────┴──────────────────┘
  Admin puede: crear/editar empleados, bloquear clientes. Empleado: sin acceso.
```

---

### 6.10 Configuración Global (solo Admin)

```
┌───────────────────────────────────────────────────────────────────────────┐
│ CONFIGURACIÓN                                                               │
│  ── Pago Yape/Plin ─────────────────────────────────────────────────────  │
│   Número Yape   [ +51 9xx xxx xxx ]     QR  [🖼 subir/reemplazar]          │
│  ── Delivery La Molina ─────────────────────────────────────────────────  │
│   Tarifa delivery [ S/ 12.00 ]   Puntos de recojo: [ + Agregar punto ]     │
│     • Punto A — Av. La Molina 1234   [editar] [🗑]                         │
│  ── Banners promocionales ──────────────────────────────────────────────  │
│   [🖼 Banner home]  [+ Banner]   activo [x]                                │
│              [ Guardar configuración ]                                     │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Vistas de Usuario / Visitante — descripción textual (UI/UX)

> El cliente diseña estas pantallas. Aquí solo el detalle textual de qué contiene cada una y su comportamiento UX. Sin mockup ASCII (a cargo del cliente).

### 7.1 Home / Landing (visitante)
- Header: logo Antropic, buscador, íconos de wishlist y carrito, botón **"Ingresar"** (abre Google OAuth / Magic Link).
- Banner promocional (gestionado desde Configuración admin).
- Navegación por **Categorías** y por **Ocasión de uso** (Fiesta, Oficina…).
- Grilla de productos destacados / novedades. Cada card: foto, nombre, precio, botón de wishlist (♡).
- UX: precios **visibles sin registro**; añadir al carrito **sin registro**.

### 7.2 Listado de catálogo (visitante)
- Panel de **filtros**: Talla, Color (indispensables), + Categoría y Ocasión. Filtros combinables, actualización inmediata de la grilla.
- Orden: relevancia / precio / novedad.
- Card de producto con estado de stock (ej. "Última talla M"). Si una variante está agotada → no se oculta, se muestra deshabilitada.

### 7.3 Ficha de producto (visitante)
- Galería: **fotos + video lookbook/pasarela** (Storage Supabase).
- Selector de **Talla** y **Color**; el stock se refleja por combinación.
- Botón **"Añadir al carrito"**. Si la talla está agotada → botón **"Avísame cuando haya stock"** (pide correo).
- **Tabla de medidas estándar** (modal) + botón del **Recomendador de tallas de Paolo** mostrado como **"En desarrollo"** (deshabilitado).
- Sección **"Productos similares"**.

### 7.4 Carrito (visitante o registrado)
- Lista de ítems (foto, variante, cantidad editable, precio, quitar).
- **Campo de código de cupón** con validación (vigencia/uso).
- Resumen: subtotal, descuento cupón, **envío calculado según modalidad**, total.
- Botón **"Continuar"** → si no está logueado, exige **registro/login** (Google o Magic Link) antes de seguir.

### 7.5 Checkout (registrado)
- Paso 1 — **Entrega:** elegir **Delivery** (dirección + tarifa) o **Recojo** (punto de La Molina, sin costo).
- Paso 2 — **Cupón** (si no se aplicó en el carrito).
- Paso 3 — **Pago Yape/Plin:** muestra **QR + número**; instrucción de poner el **código de referencia (ANT-#orden)** en el asunto; **subir constancia** (o enviar por WhatsApp).
- Estado final: pantalla **"Pago en verificación"** → al aprobar (manual/n8n) cambia a **"Pago exitoso"** con resumen de orden.
- UX clave: **mínimos clics** — login de un tap (Google) y flujo lineal de 3 pasos.

### 7.6 Perfil del cliente (registrado)
- **Historial de pedidos** detallado con estado y **boleta simple interna** (ID compra + IDs producto, descargable).
- **Tracking interno** paso a paso de cada pedido (En preparación → Enviado → Entregado / Listo para recojo).
- **Wishlist** persistente.
- Datos personales + **preferencias de talla**.
- **Solicitud de devolución:** formulario (pedido, motivo, foto) → genera ticket → sigue por WhatsApp.

### 7.7 Notificaciones al cliente
- Correo/mensaje de: confirmación de compra, pago exitoso, cambios de estado del pedido, **stock disponible** (avísame), y **recordatorio de carrito** con productos pendientes.
