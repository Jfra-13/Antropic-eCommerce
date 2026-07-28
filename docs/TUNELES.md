# Túneles — Exponer la app para que un cliente la pruebe

Guía para levantar la app en local y que un cliente externo la vea por internet, usando **Cloudflare Tunnel** (gratis, sin cuenta, sin límite de tiempo de sesión).

> **Por qué Cloudflare Tunnel y no otra cosa:** es gratis, no pide cuenta para el modo rápido, y a diferencia de ngrok gratis no tiene timeout de sesión ni te cambia todo a cada rato. Localtunnel es más simple pero su servidor público es menos confiable — no es lo ideal para una demo con cliente.

---

## Qué configuramos para que esto ande (recordatorio)

Antes de que los túneles sirvan para una demo real con login, revisamos el código y encontramos un hueco que esta guía no cubría:

- **Vite acepta el host del túnel** → ya resuelto en código (`allowedHosts: true` en los 3 `vite.config.ts`). No hay que tocar nada.
- **CORS store/admin → API** → ya resuelto (`app.use(cors())` sin opciones permite cualquier origen). No hay que tocar nada.
- **Acceso a DB y creación de usuarios** → funcionan igual, son server-side (el API pega a Supabase por `DATABASE_URL` / `service_role`). El túnel no los afecta.
- **Login (magic link + Google) → SE ROMPE si no configurás Supabase.** El front redirige a `window.location.origin`, que con el túnel es la URL `trycloudflare`. Supabase solo redirige de vuelta a URLs que estén en su allowlist. **Arreglo: sección "Requisito Supabase" abajo — hacelo una sola vez.**

> **SMTP custom: NO configurado.** Decidimos quedarnos con el email default de Supabase (limita ~3-4 magic links por hora y puede caer en spam). Suficiente para una demo corta con pocos logins. Si el cliente va a loguearse muchas veces seguidas, ahí sí habría que activar SMTP propio (Resend) — pero por ahora queda pendiente a propósito.

---

## Requisito Supabase — allowlist del túnel (una sola vez, ANTES de los túneles)

Sin esto el magic link clickeado no vuelve a la app → login muerto → el cliente no puede probar nada logueado.

1. Entrá a **https://supabase.com/dashboard** → elegí tu proyecto.
2. Menú izquierdo → **Authentication** → **URL Configuration** (en algunas versiones: **Sign In / Providers → URL Configuration**).
3. Sección **Redirect URLs** → **Add URL** → pegá exactamente:

   ```
   https://*.trycloudflare.com/**
   ```

   - `*.trycloudflare.com` → comodín que cubre cualquier subdominio random del túnel (no la re-agregás en cada reinicio).
   - `/**` → cubre cualquier ruta (el admin redirige a `origin + pathname`, necesita el path comodín).

4. **Save.**
5. **Site URL** (arriba, misma pantalla): dejalo en `http://localhost:5174` — **NO** lo cambies a la URL del túnel. Es solo el fallback; el redirect real ya lo cubre el allowlist del paso 3.

> **Google OAuth** además necesita la URL registrada en Google Cloud Console. Para la demo, usá **magic link** — solo depende del allowlist de Supabase, que ya dejaste listo acá.

---

## 0. Instalar cloudflared (una sola vez)

**Windows (PowerShell, viene con winget en Win 11):**

```powershell
winget install --id Cloudflare.cloudflared
```

Verificá:

```powershell
cloudflared --version
```

---

## 1. El problema que hay que resolver antes de exponer nada

Tu storefront y tu admin usan `VITE_API_URL` para saber a qué puerto del API pegarle. Esa variable **se graba adentro del código cuando arrancás Vite**, no se lee de nuevo en cada visita del navegador.

Si el cliente entra por una URL pública pero `VITE_API_URL` sigue apuntando a `http://localhost:3000`, el navegador **del cliente** va a intentar conectarse a su propia máquina (que no tiene nada corriendo ahí) → pantalla en blanco, productos vacíos, error de fetch. Mismo síntoma que ya tenés documentado en tu guía de comandos, sección 4.

**Solución:** antes de levantar storefront y admin, cambiás `VITE_API_URL` para que apunte al **túnel del API**, no a `localhost:3000`.

---

## 2. Orden completo (API primero, sigue valiendo la regla de oro)

Necesitás **un túnel por cada servicio que el cliente vaya a ver**. Como mínimo, el túnel del API es obligatorio (storefront y admin dependen de él). Los túneles de storefront y admin son opcionales — dependen de qué le vas a mostrar al cliente.

### Terminal A — API (igual que siempre, sin cambios)

```powershell
pnpm --filter @workspace/api-server run build
$env:PORT=3000
pnpm --filter @workspace/api-server run start
```

Esperá `Server listening ... port:3000` antes de seguir.

### Terminal B — Túnel del API (nueva)

```powershell
cloudflared tunnel --url http://localhost:3000
```

Te va a imprimir algo como:

```
https://random-words-here.trycloudflare.com
```

**Copiá esa URL.** Es la que van a usar el storefront y el admin en vez de `http://localhost:3000`.

### Terminal C — Storefront, apuntando al túnel del API

```powershell
$env:PORT=5173; $env:BASE_PATH="/"; $env:VITE_API_URL="https://random-words-here.trycloudflare.com"
pnpm --filter @workspace/antropic-store run dev
```

### Terminal D — Túnel del storefront

```powershell
cloudflared tunnel --url http://localhost:5173
```

Esta URL es la que le pasás al cliente para que pruebe el storefront.

### Terminal E — Admin (si el cliente también necesita verlo)

Editá `artifacts/antropic-admin/.env` y cambiá:

```
VITE_API_URL=https://random-words-here.trycloudflare.com
```

Después:

```powershell
$env:PORT=5174; $env:BASE_PATH="/"
pnpm --filter @workspace/antropic-admin run dev
```

### Terminal F — Túnel del admin (si aplica)

```powershell
cloudflared tunnel --url http://localhost:5174
```

---

## 3. Versión corta — solo storefront

Si el cliente solo va a ver el storefront (lo más común en una demo), te ahorrás dos terminales. Son 4 en total:

1. API (Terminal A)
2. Túnel del API (Terminal B)
3. Storefront con `VITE_API_URL` apuntando al túnel (Terminal C)
4. Túnel del storefront (Terminal D)

El admin lo dejás corriendo solo en `localhost`, sin exponer.

---

## 4. Checklist antes de mandarle el link al cliente

- [ ] API arriba y respondiendo (`curl` a `/api/healthz` en localhost, todavía)
- [ ] Túnel del API generó una URL y la copiaste
- [ ] Storefront (y admin si aplica) **arrancado de nuevo** con `VITE_API_URL` = URL del túnel del API, no `localhost`
- [ ] Túnel del storefront generó su propia URL — esa es la que compartís
- [ ] Probaste vos mismo la URL pública en el navegador (o el celular, para simular que es "otra máquina") antes de pasarla

---

## 5. Dos cosas que te van a morder si no las corregís antes de exponer

**1. Reiniciar Vite después de cambiar `VITE_API_URL`.**

Pensalo así: Vite lee el `.env` (o la variable que le pasás por consola) **una sola vez, en el momento exacto en que arranca**. Es como si sacara una foto de esa variable al prender el servidor. Si después vos cambiás el valor —por ejemplo, de `localhost:3000` a la URL del túnel— esa foto vieja sigue ahí adentro, corriendo, hasta que apagás el servidor y lo volvés a prender. Cambiar el archivo `.env` con el servidor ya corriendo no hace nada, porque Vite no vuelve a mirar el archivo solo.

Entonces, en la práctica: si ya tenías el storefront o el admin corriendo apuntando a `localhost:3000`, no alcanza con editar el `.env` o poner la variable nueva y seguir de largo. Tenés que:
1. Ir a esa terminal y cortar el proceso (Ctrl+C).
2. Volver a correr el comando de arranque, ahora sí con `VITE_API_URL` apuntando a la URL del túnel.

Si te salteás este paso, el storefront va a seguir "recordando" `localhost:3000` aunque el `.env` diga otra cosa, y el cliente va a ver la misma pantalla en blanco que ya tenés anotada como síntoma conocido.

**2. `MSYS_NO_PATHCONV=1` si usás Git Bash (no PowerShell).**

Esto es algo raro y específico de Windows, no de Cloudflare ni de los túneles. Git Bash tiene una "manía": cuando ve un `/` sueltito en un comando, piensa que te referís a una ruta de carpeta de Windows, y lo cambia solo por algo como `C:/Program Files/Git`. El problema es que en tu proyecto usás `BASE_PATH=/` (justo esa barra sola) como valor de una variable, no como una ruta — y Git Bash no distingue una cosa de la otra, así que te la arruina sin avisar.

Tu propia guía ya identificó este problema y ya tiene el arreglo: agregar `MSYS_NO_PATHCONV=1` adelante del comando, que le dice a Git Bash "dejá las barras en paz, no las toques". Esto es exactamente el mismo problema, no algo nuevo por usar túneles — así que si armás las terminales en Git Bash en vez de PowerShell, poné el mismo prefijo que ya venías usando para levantar el storefront y el admin. Si usás PowerShell en cambio, este problema directamente no existe y no hace falta el prefijo.

---

## 6. Revertir — devolver todo a su lugar después de la demo

Cambios que hicimos SOLO para el túnel. Terminada la demo, revertí para volver a dev local normal.

| Qué tocamos | Estado túnel | Cómo revertir |
|---|---|---|
| **`artifacts/antropic-admin/.env` → `VITE_API_URL`** | apuntando a la URL del túnel del API (`https://...trycloudflare.com`) | **Editar de nuevo a `VITE_API_URL=http://localhost:3000`** y reiniciar el admin. Este es el ÚNICO cambio en archivo — el que hay que acordarse de volver. |
| **Store `VITE_API_URL`** | apuntaba al túnel del API vía variable de entorno inline en la terminal | Nada que revertir en archivos. Se pasó por línea de comando (`$env:VITE_API_URL=...`), no se grabó. Al reiniciar el store con el comando normal de `COMANDOS.md` §4, vuelve solo a `localhost:3000`. |
| **Supabase → Redirect URLs → `https://*.trycloudflare.com/**`** | agregado al allowlist | Opcional dejarlo. No molesta a dev local (localhost ya está permitido aparte). Sacalo solo si querés el allowlist limpio: Supabase → Authentication → URL Configuration → borrar esa entrada. |
| **Site URL de Supabase** | NO se tocó (quedó en localhost) | Nada. Confirmado que sigue en `http://localhost:5174`. |
| **4 procesos `cloudflared`** | corriendo en sus terminales | Ctrl+C en cada terminal de túnel. No dejan nada instalado ni residual. |

### Lo mínimo para volver a dev local

1. **Ctrl+C** en las 4 terminales de `cloudflared`.
2. **`artifacts/antropic-admin/.env`** → `VITE_API_URL=http://localhost:3000`.
3. Reiniciar API + store + admin con los comandos normales de `COMANDOS.md` §4.

Eso es todo. El resto (allowlist de Supabase) es inofensivo y podés dejarlo para la próxima demo.
