# Ambiente de prueba en Render (gratis)

Un ambiente para probar y mostrar gestorIA en internet, en el plan gratuito de [Render](https://render.com).
**No es la producción** (que va en un VPS con Coolify, ver CLAUDE.md): no tiene correo, la base se borra a
los 30 días y la primera visita después de un rato tarda.

Todo está descrito en `render.yaml` (un "Blueprint" de Render): un servicio web y una base PostgreSQL.

## Cómo está armado

- **Un solo servicio web con la web y la API juntas.** Render publica cada servicio en un subdominio de
  `onrender.com`, y ese dominio está en la lista de sufijos públicos: dos subdominios suyos **no pueden
  compartir cookies**. Con la web y la API en servicios separados, la sesión que arma la API no la vería la
  web. Por eso van en el mismo servicio: la web (Next) atiende la URL pública y le **reenvía `/api/...`** a la
  API, que escucha solo adentro (`URL_API_INTERNA`, ver `apps/web/next.config.ts`). Para el navegador todo es
  un mismo sitio, y las cookies quedan en el dominio de la web.
- **Las URLs se deducen solas** de `RENDER_EXTERNAL_URL`, que Render define en cada servicio: la de la web, la
  de la API, la de Better Auth y los orígenes de CORS son la misma (`scripts/ambiente-de-prueba/comun.ts`).
- **Las migraciones corren al arrancar** (`scripts/ambiente-de-prueba/iniciar.ts`): el plan gratuito no tiene
  "pre-deploy command" ni consola. Si fallan, no arranca nada.
- **Si la web o la API se caen, se baja todo** y Render vuelve a levantar el servicio entero.
- **Sin correo.** No hay SMTP configurado: los correos de verificación no salen, se escriben en el log del
  servicio (ver "Cuentas nuevas", más abajo).
- **La base** se pasa como cadena de conexión (`DATABASE_URL`) y el arranque la reparte en las `POSTGRES_*`
  que lee la aplicación. Adentro de Render la conexión va por la red privada, sin TLS.

## Límites del plan gratuito

Según la documentación de Render (noviembre de 2026):

- El servicio **se duerme a los 15 minutos sin visitas** y tarda **alrededor de un minuto** en despertar. Las
  tareas programadas (limpiezas, tareas que fallan solas) corren solo mientras está despierto.
- **750 horas de servicio por mes** por espacio de trabajo (alcanza para un servicio prendido todo el mes).
- **La base gratuita vence a los 30 días** de creada (hay 14 días más para pasarla a un plan pago antes de que
  se borre), tiene 1 GB y no tiene copias de seguridad. Para seguir gratis, se crea otra y se vuelve a cargar.
- Una sola base gratuita por espacio de trabajo.
- Las compilaciones consumen minutos de compilación incluidos por mes.

## Ponerlo en marcha

1. **Subir el código a GitHub.** Render despliega desde el repositorio (`github.com/ignaciootero/gestorIA`), de
   la rama que se elija. Lo que no esté commiteado y subido no se despliega.
2. **Crear el Blueprint.** En Render: *New* → *Blueprint* → conectar la cuenta de GitHub → elegir el
   repositorio y la rama. Render lee `render.yaml` y muestra lo que va a crear: el servicio `gestoria` y la
   base `gestoria-db`, los dos en el plan gratuito. *Apply*.
3. **Esperar la primera compilación** (unos minutos; se sigue en *Events* y *Logs* del servicio). Cuando dice
   *Live*, la aplicación está en `https://gestoria.onrender.com` (o el nombre que haya quedado, se ve arriba
   en la página del servicio).
4. **Cargar los datos de prueba desde tu máquina** (ver abajo): crea el admin `iotero` y las demás cuentas. Hasta entonces nadie puede aprobar cuentas.

Después, **cada push a esa rama vuelve a desplegar** solo (`autoDeployTrigger: commit`).

## Cargar los datos de prueba (desde tu máquina)

Sin consola en Render, los scripts se corren en tu máquina contra la base de Render. En la página de la base
(`gestoria-db`) → *Connect* → copiar la **External Database URL** (tiene la contraseña: no la guardes en ningún
archivo). En PowerShell, desde la raíz del proyecto:

```powershell
$env:DATABASE_URL = "<External Database URL>"

# Las cuentas de prueba: iotero/iotero (admin), dpaolillo1/dpaolillo1 (un año de uso),
# dpaolillo2/dpaolillo2 (vacía) y las del panel de admin (prueba1234).
node scripts/ambiente-de-prueba/contra-render.ts usuario:sembrar

# Para volver a empezar de cero (borra todas las cuentas y sus datos; pide confirmar).
node scripts/ambiente-de-prueba/contra-render.ts usuario:sembrar --borrar-todo

Remove-Item Env:DATABASE_URL
```

`contra-render.ts` reparte esa URL en las `POSTGRES_*`, ignora las del `.env` (que apuntan a la base local),
activa TLS (Render lo exige desde afuera) y apaga el SMTP local. Las cuentas de prueba tienen contraseñas
conocidas (están en el repositorio): este ambiente es para probar, no para datos reales. Si además querés un
admin con una contraseña propia, `usuario:admin` lo crea con los datos de `ADMIN_*` del `.env` y la pide
por consola (con otro usuario que `iotero`, que ya existe).

## Cuentas nuevas

Para entrar hacen falta dos cosas: el correo confirmado y la cuenta aprobada. Como acá no sale ningún correo,
**el enlace de verificación queda en el log del servicio** (página del servicio → *Logs*, buscar "correo NO
enviado"): se le pasa a la persona, o se abre. Después, el admin aprueba la cuenta en el panel de admin.

## Probarlo en tu máquina

Lo mismo que hace Render, con la base de tests local y en el puerto 4000 (la API adentro, en el 4001, porque
`pnpm dev` usa el 3001). `NEXT_DIST_DIR` compila en otra carpeta para no pisar la de `pnpm dev`:

```bash
# Compilar
URL_PUBLICA=http://localhost:4000 PUERTO_API_INTERNO=4001 NEXT_DIST_DIR=.next-prueba \
  node scripts/ambiente-de-prueba/construir.ts

# Arrancar (las variables que también están en el .env se pisan a mano; SMTP vacío, como en Render)
SMTP_HOST= URL_PUBLICA=http://localhost:4000 BETTER_AUTH_URL=http://localhost:4000 \
  URL_WEB=http://localhost:4000 ORIGENES_PERMITIDOS=http://localhost:4000 \
  NEXT_PUBLIC_URL_API=http://localhost:4000 PORT=4000 PUERTO_API_INTERNO=4001 \
  NEXT_DIST_DIR=.next-prueba NODE_ENV=production POSTGRES_DB=gestion_test \
  node --env-file=.env scripts/ambiente-de-prueba/iniciar.ts
```

## Archivos

- `render.yaml`: el Blueprint (servicio, base, variables).
- `scripts/ambiente-de-prueba/`: `comun.ts` (URLs y base a partir de la URL pública y de `DATABASE_URL`),
  `construir.ts` (build command), `iniciar.ts` (start command) y `contra-render.ts` (scripts desde tu máquina).
- `apps/web/next.config.ts`: el reenvío de `/api/...` cuando hay `URL_API_INTERNA`.

## Límites conocidos

- La API ve las peticiones a través de la web: el límite de intentos de ingreso por IP depende de que la
  dirección del visitante llegue en `X-Forwarded-For` (Render la agrega, y el reenvío de Next la conserva).
- Sin correo: la verificación es a mano, con el enlace del log.
- Los datos duran lo que dura la base gratuita (30 días).
