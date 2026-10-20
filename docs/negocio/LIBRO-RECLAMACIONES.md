# Libro de Reclamaciones Virtual — descripción para revisión legal

Este documento describe el Libro de Reclamaciones tal como funciona hoy en la tienda virtual, para
su revisión y conformidad por el asesor legal. Describe lo que el sistema hace; no agrega nada que
el sistema no haga. Las referencias al código permiten comprobar cada punto.

**Base normativa:** Ley N.° 29571, Código de Protección y Defensa del Consumidor; Reglamento del
Libro de Reclamaciones, D.S. N.° 011-2011-PCM, con la modificación del D.S. N.° 101-2022-PCM, que
adecúa el plazo de respuesta a la Ley N.° 31435.

## 1. Acceso

- Enlace permanente al Libro en el pie de todas las páginas de la tienda, en la columna «Legal».
- Página propia: `/libro-de-reclamaciones`.
- **No exige cuenta ni inicio de sesión.** Cualquier persona puede registrar un reclamo o una
  queja.

## 2. Contenido de la Hoja de Reclamación

El formulario y la hoja que recibe el consumidor siguen las secciones del formato oficial.

**1. Identificación del proveedor.** Razón social, nombre comercial, RUC y domicilio fiscal. Se
toman de la configuración del negocio en el panel de administración, no se copian en cada hoja.

**2. Identificación del consumidor.**

| Campo | Obligatorio |
|---|---|
| Nombre completo | Sí |
| Tipo de documento (DNI, carné de extranjería, pasaporte, RUC) | Sí |
| Número de documento | Sí |
| Correo electrónico | Sí, porque la constancia y la respuesta se envían por correo |
| Teléfono | No |
| Domicilio | No |
| Si es menor de edad: nombre del padre, madre o tutor | Sí cuando se declara menor. El servidor rechaza el registro si falta |

**3. Identificación del bien contratado.** Tipo (producto o servicio), descripción (obligatoria)
y monto reclamado en soles (opcional). Si el consumidor inició sesión, el registro queda asociado
a su cuenta, pero eso no es requisito.

**4. Detalle de la reclamación.** El consumidor elige entre:

- **Reclamo:** «Disconformidad con el producto o el servicio recibido.»
- **Queja:** «Malestar respecto de la atención recibida.»

Además describe qué ocurrió (detalle) y qué solicita (pedido del consumidor). Ambos campos son
obligatorios.

**5. Acciones adoptadas por el proveedor.** Las registra el personal desde el panel, y la
respuesta se envía al consumidor por correo electrónico.

## 3. Constancia

Al registrar, el consumidor recibe en pantalla y por correo electrónico:

- un **código correlativo único y creciente** (`LR-000001`, `LR-000002`…). Nunca se repite.
  El sistema evita los huecos causados por datos inválidos. No garantiza que no haya huecos
  cuando falla la base de datos en medio de un registro, porque un número asignado no se recupera;
- la **fecha** del registro (en hora de Lima);
- la Hoja completa con las secciones anteriores;
- la **fecha límite de respuesta**;
- esta leyenda: «La presentación de un reclamo no impide acudir a otras vías de solución de
  controversias ni constituye requisito previo para denunciar ante INDECOPI.»

## 4. Plazo de respuesta

**15 días hábiles improrrogables** (Ley N.° 31435, D.S. N.° 101-2022-PCM), contados desde el día
siguiente al registro, en hora de Lima.

Criterio aplicado: se cuentan de lunes a viernes **sin descontar feriados**. Descontarlos movería
la fecha más tarde. Al no hacerlo, la fecha que calcula el sistema es siempre igual o anterior a la
fecha legal, nunca posterior. En el peor caso, el negocio responde uno o dos días antes de lo
exigido, o el panel marca como vencido un registro al que legalmente le queda un día.

La fecha límite se fija al registrar y no se recalcula. Los registros creados antes del
2026-10-20 llevan la fecha del plazo anterior (30 días calendario). La base de producción no tiene
ninguno.

El panel de administración ordena los registros por urgencia legal y muestra los días hábiles
restantes. Los registros vencidos aparecen en rojo. El personal recibe un aviso por correo con
cada registro nuevo, siempre que el correo de avisos esté configurado en el servidor
(`ADMIN_NOTIFICATION_EMAIL`).

## 5. Conservación y uso de los datos

- **Ningún registro se puede borrar.** No existe ninguna función de eliminación. Un expediente
  termina en estado «cerrado», nunca eliminado. Que se conserven al menos dos años depende también
  de la política de respaldos de la base de datos.
- Los datos del Libro se usan **solo** para atender y responder el registro. No alimentan
  publicidad ni listas de contacto, y el formulario lo informa así.

## 6. Puntos para decisión del asesor legal

1. **Definición de «queja».** El texto actual es «Malestar respecto de la atención recibida». Hay
   que confirmar si debe reemplazarse por la definición literal del formato del Reglamento, que
   también incluye la disconformidad no relacionada con los productos o servicios.
2. **Domicilio del consumidor.** Hoy es opcional, porque la respuesta se envía por correo. Hay que
   confirmar si debe ser obligatorio.
3. **Suspensión del plazo** por una oferta de solución del proveedor. Fuentes secundarias sobre
   la modificación de 2022 la sitúan en un máximo de 5 días hábiles. Hay que confirmar la cifra y
   si se necesita. El sistema no la aplica, y el plazo sigue corriendo.
4. **Responsable de responder.** Debe designarse a la persona que responde dentro del plazo. Hoy el
   sistema permite responder tanto al administrador como al personal.

## Conformidad

Revisado el contenido y el funcionamiento descritos, con las observaciones anotadas en el punto 6:

Nombre: ______________________________________

Colegiatura: ___________________

Firma: ______________________________________

Fecha: ____ / ____ / ________
