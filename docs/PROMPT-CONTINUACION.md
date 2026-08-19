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

Las fases 0 a 3 están hechas y fusionadas o en el PR #1: documento de auditoría, endurecimiento de
la API (CORS, helmet, rate limiting, contrato de entorno), Libro de Reclamaciones + textos legales
+ registro de consentimiento, y las suites de pruebas en CI.

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

Antes de escribir código, dime tu plan para: <FASE QUE QUIERAS — p. ej. "la Fase 4, clonabilidad">
```

---

## Notas de consumo

Esta auditoría se hizo en una sola sesión muy larga, y eso encarece cada turno: el modelo reprocesa
la conversación entera cada vez. Dos consecuencias prácticas:

- **Una sesión nueva por fase.** El estado vive en el repositorio, no en el historial del chat, así
  que no se pierde nada al empezar de cero.
- **No dejes vigilancia automática de PRs en sesiones largas.** Cada despertar reprocesa todo el
  historial; en una conversación corta sale a cuenta, en una larga no.
