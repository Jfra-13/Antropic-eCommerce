# Prompt para retomar la auditoría en una sesión nueva

Copia el bloque de abajo como primer mensaje de un chat nuevo. Está escrito para que una sesión sin
historial entienda el estado en una sola lectura, sin tener que redescubrir el repositorio.

Cambia la última línea por la fase que quieras atacar.

---

```
Continúo una auditoría pre-lanzamiento de este ecommerce. TODO el plan, el estado y la evidencia
están en docs/AUDITORIA.md — léelo primero, empezando por la sección "Estado del proyecto — empieza
por aquí". No repitas la auditoría: ya está hecha y verificada.

Contexto en una línea: Antropic es una tienda peruana (Vite SPA + Express 5 + Drizzle sobre
pg.Pool + Supabase solo para Auth/Storage + verificación manual de constancias Yape/Plin). Se está
puliendo para después clonarla a una segunda marca con repo y base de datos separados.

Las fases 0 a 5 están hechas: documento de auditoría; endurecimiento de la API (CORS, helmet, rate
limiting, contrato de entorno); Libro de Reclamaciones + textos legales + registro de
consentimiento; suites de pruebas bloqueantes en CI; clonabilidad (identidad de marca como dato en
lib/brand, con una prueba en CI que impide que vuelva al código); y migraciones versionadas
(lib/db/drizzle, CI construye la base replicándolas).

El entorno de desarrollo importa: se trabaja desde Claude Code en la web, sin laptop. Ese contenedor
puede levantar Postgres 16 local, correr las suites de integración de verdad, arrancar los dev
servers y hacerles curl, y trae Chromium + Playwright preinstalados. Lo que NO puede: tocar el
proyecto Supabase real, administrar el repositorio en GitHub, ni probar en un móvil real.

REGLAS DE TRABAJO (no negociables, vienen de las fases anteriores):

1. Validar ejecutando, no solo compilando. `typecheck` y `build` son el mínimo, no la prueba. Las
   tres veces que se ejecutó el código de verdad aparecieron defectos que compilaban perfectamente.
   Si tocas algo delicado, levántalo y compruébalo.
2. Contrato primero. Los endpoints salen de lib/api-spec/openapi.yaml → codegen → implementación.
   Nunca edites nada bajo generated/.
3. Nada de texto legal inventado. Si falta un texto legal, el sistema debe decir que no está
   publicado, no rellenarlo con prosa plausible.
4. Comentarios que expliquen el porqué, no el qué. Lo que es requisito legal o invariante
   estructural debe decirlo explícitamente para que nadie lo "simplifique" después.
5. Actualiza docs/AUDITORIA.md con lo que hagas: marca los ítems y añade la evidencia en §11.
6. La marca es configuración, no código. Vive en lib/brand/src/brand.ts y hay una prueba que falla
   si el nombre, el tagline, la zona de reparto o el prefijo de pedido se escriben a mano en
   cualquier otro sitio. Ya se disparó dos veces sobre código recién escrito: no la desactives.
7. El esquema es migration-based. Un cambio en lib/db/src/schema/ se acompaña de su archivo en
   lib/db/drizzle/, generado con `generate` y commiteado. Nunca `push` contra una base compartida.

Antes de escribir código, dime tu plan para: <FASE QUE QUIERAS — p. ej. "la Fase 6, arquitectura de pagos">
```

---

## Notas de consumo

Esta auditoría se hizo en una sola sesión muy larga, y eso encarece cada turno: el modelo reprocesa
la conversación entera cada vez. Dos consecuencias prácticas:

- **Una sesión nueva por fase.** El estado vive en el repositorio, no en el historial del chat, así
  que no se pierde nada al empezar de cero.
- **No dejes vigilancia automática de PRs en sesiones largas.** Cada despertar reprocesa todo el
  historial; en una conversación corta sale a cuenta, en una larga no.

## Estado operativo al cierre de la Fase 5

Cosas que una sesión nueva no puede deducir del código y que cuesta caro redescubrir.

**Lo que sigue pendiente, en orden recomendado**

1. **Fase 6 · arquitectura de pagos** (§6.2). Abstraer el proveedor tras una interfaz, ampliar el
   enum `payment_status` con `autorizado`/`expirado`/`reembolsado`, tabla de eventos de pago con
   `event_id` único para idempotencia de webhooks, y documentar el contrato del webhook futuro. Es
   backend puro y base de datos: se hace entero desde el contenedor web.
2. **Fase 7 · SEO y rendimiento** (§4, §8.1). Meta por ruta, `sitemap.xml`, `robots.txt`, canónicas,
   JSON-LD, y code-splitting con `React.lazy` — el bundle del storefront pasa hoy los 500 kB y las
   12 rutas comparten un `<title>`.

**Bloqueado por credenciales, no por código**

- Sonda de RLS (§3.2): `pnpm --filter @workspace/scripts run verify-rls` necesita el proyecto
  Supabase real. Está escrita, sin ejecutar, y es probable que salga roja.
- E2E con login (§9.2): depende de Supabase. Los tramos sin sesión (catálogo, Libro de
  Reclamaciones) sí son automatizables hoy con el Chromium preinstalado.

**Bloqueado por trámites o decisiones del negocio**

Textos legales del abogado · inscripción ante la ANPD · si los precios incluyen IGV · quién responde
los reclamos en 30 días · SPF/DKIM/DMARC del dominio · plan de pago de Supabase y PITR.

**Tarea manual pendiente en GitHub**

Proteger `main` (§1.1). No se puede hacer desde la sesión: el MCP de GitHub no expone protección de
ramas y la API directa da 403. Configuración exacta: requerir PR, 0 aprobaciones, status check
requerido **`build`**, exigir rama al día, bloquear force-push y borrado.

**Al desplegar por primera vez**

La base de Supabase actual se creó con `push`, así que necesita línea base **una sola vez** antes de
que `migrate` funcione:

```
pnpm --filter @workspace/scripts run baseline-migrations
pnpm --filter @workspace/db run migrate
```

Verificado en local reproduciendo ese escenario exacto; ver §11.5 de la auditoría.
