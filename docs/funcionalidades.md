# Funcionalidades

Qué hace el sistema hoy, cómo funciona a grandes rasgos y dónde está en el código.
Se actualiza con cada funcionalidad nueva (ver `docs/guias/convenciones.md`).

Estado: **pasos 1 a 7 de la hoja de ruta**. Hay infraestructura, autenticación, sistema
visual, panel de admin y dos módulos de negocio: ingresos y gastos (núcleo
completo — dashboard, movimientos, categorías, cuentas, presupuestos y estadísticas;
los gastos recurrentes quedan para una etapa aparte) y contactos (personas y empresas o
servicios, con etiquetas, favoritos y recordatorios), tareas (to-do con tareas repetitivas e historial)
y un calendario que junta los vencimientos de deudas, los recordatorios de contactos y las tareas
pendientes, y permite anotar eventos a mano. Todavía no hay móvil ni entrada por lenguaje natural.

---

## Infraestructura

### Monorepo

Un solo repositorio con pnpm workspaces y Turborepo.

- `apps/api`: la API (Hono). Es el único backend; web y móvil la consumen.
- `apps/web`, `apps/mobile`: placeholders, sin código todavía.
- `packages/config`: `tsconfig` base compartido.
- `packages/db`: cliente de base de datos, esquemas y migraciones.

Turborepo encadena las tareas (`build`, `typecheck`, `test`) respetando las
dependencias entre paquetes y cachea los resultados: si un paquete no cambió, no se
vuelve a compilar.

**Paquetes internos compilados.** `packages/db` se compila a `dist/` con `tsc` y su
`exports` apunta a `dist` para el runtime y a `src` para los tipos. Es lo que
corresponde cuando el consumidor es Node sin bundler, que es el caso de la API.

**Ejecución de TypeScript.** Node 24 ejecuta archivos `.ts` directamente borrando los
tipos, así que en desarrollo la API corre con `node --watch src/index.ts` sin ninguna
herramienta intermedia. Para que el mismo archivo funcione en desarrollo y compilado,
el `tsconfig` usa `erasableSyntaxOnly` (prohíbe sintaxis que Node no puede borrar, como
`enum`) y `rewriteRelativeImportExtensions` (los imports se escriben con `.ts` y `tsc`
los reescribe a `.js` al emitir).

Dónde: `pnpm-workspace.yaml`, `turbo.json`, `packages/config/tsconfig.base.json`.

### Base de datos

PostgreSQL local (sin Docker) con dos bases separadas:

- **`gestion`**: desarrollo.
- **`gestion_test`**: tests de integración. Los tests nunca tocan la de desarrollo.

`pnpm db:crear` crea las dos si no existen. Se conecta con el driver de Node, así que
funciona igual en Windows y en Linux y no necesita `psql` en el PATH.

El acceso es con **Drizzle ORM** sobre un pool de `pg`. El cliente
(`crearClienteDb`) recibe la configuración como parámetro en vez de leerla del entorno:
así la API, las migraciones y los tests pueden apuntar a bases distintas sin trucos, y
se puede probar el caso de base caída con una conexión real que falla.

Migraciones con drizzle-kit: `pnpm db:generar` produce el SQL, `pnpm db:migrar` y
`pnpm db:migrar:test` lo aplican. Todavía no hay tablas de negocio; el esquema está
vacío a propósito.

Dónde: `packages/db/src/cliente.ts`, `packages/db/src/entorno.ts`,
`packages/db/src/crear-bases.ts`, `packages/db/src/migrar.ts`,
`packages/db/drizzle.config.ts`.

### API

Hono sobre Node. La app se construye con `crearApp({ cliente, logger, entorno })`, que
recibe sus dependencias en vez de crearlas: eso es lo que permite testearla sin levantar
un servidor ni tocar variables globales.

Middlewares, en orden:

1. **Id de petición** (`hono/request-id`): un UUID por petición, devuelto en la cabecera
   `X-Request-Id`.
2. **Logs** (ver abajo).
3. **Cabeceras de seguridad**: CSP `default-src 'none'`, `frame-ancestors 'none'`,
   `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer` y HSTS solo en
   producción.
4. **CORS restringido** a los orígenes de `ORIGENES_PERMITIDOS`. El comodín `*` está
   rechazado por la validación de entorno: no se puede configurar ni por error.

Dónde: `apps/api/src/app.ts`, `apps/api/src/index.ts`.

### Variables de entorno

Se validan con Zod al arrancar. Si falta o es inválida alguna, el proceso no arranca y
escribe qué variable está mal y que hay que copiar `.env.example`. Es preferible no
arrancar a arrancar a medias y fallar en la primera petición.

Las variables viven en un único `.env` en la raíz, que **no se versiona**. Las carga
Node con `--env-file-if-exists` (o `process.loadEnvFile()` donde no se pueden pasar
flags, como en la configuración de drizzle-kit y de Vitest).

Dónde: `apps/api/src/config/entorno.ts`, `packages/db/src/entorno.ts`, `.env.example`.

### Logs

Pino, en JSON. En desarrollo se embellecen con pino-pretty para poder leerlos; en
producción la salida es JSON plano.

Cada petición genera una línea al cerrarse, con `idPeticion`, `metodo`, `ruta`,
`estado` y `duracionMs`. El `idPeticion` va en un logger hijo, así que **todo** lo que
se loguee durante esa petición lo lleva y se puede seguir de punta a punta.

El nivel depende del resultado:

- `error` si el estado es 500 o más;
- `warn` si la petición superó los **200 ms** (objetivo de `docs/guias/rendimiento.md`);
- `info` en el resto.

No se registran cabeceras, cuerpos ni query strings, que pueden traer datos personales.
Además Pino tiene configurado un `redact` que oculta `authorization`, `cookie`,
`password`, `token` y similares por si alguna vez llegaran a un log.

Dónde: `apps/api/src/logger.ts`, `apps/api/src/middlewares/logs.ts`.

### Manejo de errores

Un único manejador central arma todas las respuestas de error: los endpoints lanzan y no
repiten `try/catch` para formatear.

Formato de toda respuesta de error:

```json
{
  "error": {
    "codigo": "VALIDACION_INVALIDA",
    "mensaje": "Revisá los datos ingresados.",
    "campos": [{ "campo": "email", "mensaje": "Email inválido" }],
    "idPeticion": "ba91b1fb-da58-4a97-aa85-6f7efe374567"
  }
}
```

- `codigo`: estable y legible por máquina. Es parte del contrato con web y móvil, que lo
  traducen a sus propios mensajes. No se renombran a la ligera.
- `mensaje`: apto para mostrarle al usuario.
- `campos`: solo en errores de validación.
- `idPeticion`: el mismo que aparece en los logs, para poder diagnosticar un problema
  que reporta un usuario sin pedirle nada más.

Códigos definidos hoy: `VALIDACION_INVALIDA` (400), `NO_AUTENTICADO` (401),
`SIN_PERMISO` (403), `NO_ENCONTRADO` (404), `CONFLICTO` (409),
`DEMASIADOS_INTENTOS` (429), `BASE_NO_DISPONIBLE` (503), `ERROR_INTERNO` (500).

El manejador reconoce tres cosas y todo lo demás lo trata como 500 genérico: `ErrorApi`
(los errores propios), `ZodError` (validaciones sin envolver) y `HTTPException` (errores
del propio Hono, como un cuerpo malformado).

**Los detalles técnicos nunca salen en la respuesta.** Stack traces, SQL y mensajes del
driver van al log; el usuario ve qué pasó y qué hacer.

Dónde: `apps/api/src/errores/`, `apps/api/src/middlewares/errores.ts`.

### `GET /health`

Dice si la API está viva y si la base responde. Lo usan el despliegue y los chequeos
manuales. No requiere sesión.

Con la base disponible devuelve **200**:

```json
{
  "estado": "ok",
  "version": "0.1.0",
  "base": { "estado": "ok", "duracionMs": 2 },
  "tiempo": "2026-09-16T20:59:10.205Z"
}
```

Si la base no responde devuelve **503** con el formato de error y el código
`BASE_NO_DISPONIBLE`. El motivo real queda en el log.

A propósito no expone la versión de PostgreSQL, rutas ni configuración: para alguien que
esté haciendo reconocimiento, eso es información gratis. La respuesta lleva
`Cache-Control: no-store`, porque un chequeo de salud cacheado no sirve de nada.

Dónde: `apps/api/src/rutas/salud.ts`.

---

## Autenticación

### Registro con aprobación manual

Cualquiera puede registrarse, pero **registrarse no da acceso**: la cuenta entra como
`pendiente` y no puede iniciar sesión hasta que un admin la apruebe. Al terminar, la
pantalla explica que la solicitud quedó pendiente en vez de dejar a la persona
esperando sin saber qué pasó.

Datos que pide: nombre, apellido, usuario (único), correo (único) y contraseña.
Usuario, nombre, apellido y contraseña tienen un **máximo de 24 caracteres**; el
formulario lo impide con `maxLength` y el servidor lo vuelve a verificar.

Protecciones:

- **Honeypot:** un campo oculto que una persona no ve ni alcanza con el teclado. Si
  llega con contenido, el registro se rechaza. Se verifica en el servidor.
- **Rate limiting:** 5 registros por hora desde el mismo origen, y 5 reenvíos de
  verificación por hora.
- **Validación completa en el servidor.** Todo lo que valida el formulario se vuelve a
  verificar en la API con los mismos esquemas Zod, así que llamar al endpoint
  directamente no saltea ninguna regla.
- **Nadie puede asignarse rol ni estado.** `estado`, `role` y `debeCambiarPassword`
  están declarados como campos que solo maneja el servidor: mandarlos en el cuerpo del
  registro hace que la petición se rechace, no que se ignoren en silencio.
- **No se revela qué correos tienen cuenta.** Registrarse con un correo ya usado
  responde igual que un registro nuevo. Es deliberado: si contestara "ese correo ya
  existe", cualquiera podría averiguar quién tiene cuenta probando correos de a uno.

Dónde: `apps/api/src/auth/opciones.ts`, `apps/web/src/componentes/ingreso/`.

### Verificación del correo

Al registrarse sale un correo con un enlace que confirma que la dirección es de quien
se registró. El enlace vale **24 horas** y lleva un token firmado (no hay fila en la
base que limpiar después).

**Confirmar el correo no da acceso ni aprueba la cuenta.** Para entrar hacen falta las
dos cosas, en cualquier orden:

1. correo confirmado;
2. cuenta aprobada por un administrador.

Con una sola, el login se rechaza: sin lo primero con `EMAIL_NO_VERIFICADO`, sin lo
segundo con `CUENTA_PENDIENTE`. El correo y la pantalla que sigue al registro explican
los dos pasos desde el principio, para que nadie confirme su dirección y después se
tope con un rechazo que no entiende.

Si el correo no llega, se puede reenviar desde la pantalla de ingreso. El endpoint de
reenvío responde igual exista o no la dirección, para que no sirva como forma de
averiguar qué correos tienen cuenta.

El envío usa **Nodemailer sobre SMTP**. Si no hay SMTP configurado, la API no falla:
escribe el correo completo en el log, con el enlace, así se puede probar el flujo
entero en desarrollo sin servidor de correo ni Docker.

Dónde: `apps/api/src/correo/`,
`apps/web/src/componentes/ingreso/aviso-verificacion.tsx`,
`apps/web/src/app/correo-confirmado/`.

### Inicio de sesión

Un solo campo acepta **usuario o correo**, indistinto: si tiene arroba se usa uno, si
no el otro. Quien vuelve después de meses no tiene por qué acordarse con cuál se
registró.

El login se rechaza, con un código propio para cada caso, si falta confirmar el correo
(`EMAIL_NO_VERIFICADO`) o si la cuenta está `pendiente` (`CUENTA_PENDIENTE`),
`rechazada` (`CUENTA_RECHAZADA`) o bloqueada (`CUENTA_BLOQUEADA`). La verificación del
estado corre en el momento de crear la sesión, así que vale para cualquier forma de
entrar sin tener que repetirla en cada endpoint.

Usuario inexistente y contraseña equivocada dan **exactamente el mismo mensaje**, para
que no se pueda averiguar qué usuarios existen. Rate limiting: 10 intentos cada 5
minutos.

Dónde: `apps/api/src/auth/crear-auth.ts`.

### Cambio de contraseña obligatorio

Cuando `debeCambiarPassword` está prendido (lo pone un reseteo del panel de admin,
paso 5), la cuenta puede entrar pero queda atrapada en `/cambiar-password` hasta que
la cambie: `GuardiaDeCambioPassword`, en el layout raíz, redirige ahí desde cualquier
pantalla mientras el aviso siga encendido.

`/change-password` es de Better Auth; no se reimplementa (`apps/api/src/rutas/auth.ts`
nunca envuelve sus rutas). Lo único propio es un hook `after` en `crear-auth.ts` que,
solo si el cambio salió bien, apaga `debeCambiarPassword`. Un cambio fallido (por
ejemplo con la contraseña actual equivocada) no lo toca: el hook corre siempre,
también en el error, así que distingue los dos casos mirando si Better Auth devolvió
una `APIError`.

Dónde: `apps/web/src/app/cambiar-password/`, `apps/web/src/componentes/cambiar-password/`,
`apps/web/src/componentes/layout/guardia-cambio-password.tsx`,
`apps/api/src/auth/crear-auth.ts`, `apps/api/src/servicios/usuarios/cuentas.ts`.

### Sesiones

Cookies `HttpOnly` y `SameSite=Lax`, `Secure` en producción. Duran 30 días.

**La caché de sesión en cookie está desactivada a propósito.** Con ella activada,
bloquear una cuenta o cerrarle las sesiones no tendría efecto hasta que la caché
venciera. El costo de desactivarla es una consulta por petición, resuelta por el
índice único del token.

`GET /api/yo` devuelve los datos de quien tiene la sesión, con una lista explícita de
campos: si mañana la librería agrega un campo interno, no se filtra solo por estar en
el objeto. Incluye `coloresDeAcento` (`{ claro, oscuro }`, null es el de la app), que se
cambian con `PUT /api/yo/colores` (los dos a la vez, `#rrggbb`; ver Sistema visual). No se
pueden cambiar por las rutas de Better Auth: son campos con `input: false`. Lo mismo con
`fondo` (`{ claro, oscuro }`, cada uno con `intensidad`, `velocidad`, `tamano` y
`tonoSecundario`, o null), que se cambia con `PUT /api/yo/fondo`; si lo guardado ya no es
válido, se devuelve null.

Dónde: `apps/api/src/rutas/yo.ts`, `apps/api/src/middlewares/sesion.ts`.

### Administración

El rol de admin **solo se asigna por script**; ningún endpoint permite ascender a
nadie. La impersonación está bloqueada de raíz: el admin gestiona cuentas pero nunca
ve datos ajenos.

Scripts disponibles:

- `pnpm usuario:admin` crea el primer admin. Los datos salen del `.env`, pero **la
  contraseña se pide por consola** y no se guarda en ningún archivo. Queda con el correo
  dado por confirmado: la cuenta la crea desde el servidor quien ya tiene acceso a la
  base, así que no hay nada que verificar, y si no fuera así el primer admin quedaría
  sin poder entrar y sin nadie que lo aprobara.
- `pnpm usuario:aprobar --listar` muestra las solicitudes pendientes, indicando cuáles
  ya confirmaron su correo.
- `pnpm usuario:aprobar <usuario>` aprueba una cuenta; con `--rechazar` la rechaza y le
  cierra todas las sesiones abiertas. Igual que aprobar o rechazar desde el panel, queda
  en la auditoría, pero sin sesión de admin que atribuírsela: `adminId` queda `null` y el
  panel lo muestra como "Acción por consola", no como "(cuenta eliminada)" (ese texto es
  solo para cuando sí hubo un admin pero esa cuenta se borró después).
- `pnpm usuario:sembrar` carga los **datos de prueba**: tres cuentas para entrar y mirar, más las que
  pueblan el panel de admin. Pasa por los mismos servicios que la API (registro por Better Auth,
  finanzas, contactos, tareas, calendario), así los datos salen con las mismas reglas que los que carga
  la interfaz. Está en `apps/api/src/scripts/` (`sembrar-datos-de-prueba.ts` y `cuentas-de-prueba.ts`).

  | Usuario / contraseña | Qué tiene |
  |---|---|
  | `iotero` / `iotero` | **Admin.** Datos en todos los módulos y, sobre todo, lo que solo ve un admin: 4 solicitudes pendientes (una con el correo sin confirmar), cuentas aprobadas, rechazadas (una rechazada y aprobada después), una bloqueada con su motivo, una bloqueada y desbloqueada, una con la contraseña reseteada, su última conexión y un año de auditoría |
  | `dpaolillo1` / `dpaolillo1` | **Un año de uso.** Doce meses de finanzas, contactos (familia, amigos, trabajo, servicios) con sus cumpleaños, aniversarios y fechas puntuales y el histórico del año, deudas repartidas en el año, un año de tareas y eventos en el calendario |
  | `dpaolillo2` / `dpaolillo2` | **Vacía.** Recién aprobada: solo tiene lo que la aplicación crea sola para cualquier cuenta nueva (categorías, etiquetas, cuentas por defecto), que aparece al entrar |
  | las demás | Contraseña `prueba1234` |

  - Las contraseñas de `iotero` y `dpaolillo1` son más cortas que el mínimo (8): el registro no las
    aceptaría, así que se registran con otra y se les guarda el hash de la pedida, con el mismo algoritmo
    de Better Auth. El ingreso no exige largo mínimo (a propósito, para contraseñas viejas), así que entran.
    Son cuentas de prueba: con estas contraseñas conocidas, el ambiente donde se carguen es para probar.
  - Todo lo que el panel muestra con fecha (alta, cambio de estado, auditoría, última conexión) se **fecha
    hacia atrás**, para que se vea como un año de uso. La última conexión sale de una sesión ya vencida
    (no sirve para entrar).
  - **No manda correos**, aunque el `.env` tenga SMTP: registrar cada cuenta dispararía el correo de
    verificación a direcciones inventadas (`@ejemplo.test`), que rebotan y gastan el cupo diario del
    servidor. Las cuentas ya quedan con el correo confirmado.
  - **No pisa nada**: una cuenta que ya existe (por usuario o correo) se deja como está. `--borrar-todo`
    (pide confirmación; con `--forzar` no pregunta) borra antes todas las cuentas y, en cascada, sus datos.
    `--test` la carga en `gestion_test`.
  - **Las finanzas** (`sembrar-finanzas.ts`) simulan el uso real, con los meses que se pidan (seis para el
    admin, doce para dpaolillo1) y otra semilla del azar para cada cuenta: cuentas (BROU, Efectivo,
    Tarjeta, Mercado Pago, Ahorros, una en dólares y una cuenta vieja), categorías propias, períodos que
    arrancan el día 5 (el último abierto, con movimientos de esta semana), sueldo, alquiler, servicios,
    supermercado, transporte, suscripciones, salidas, un viaje, ingresos extra, un mes que cierra en rojo,
    compra de dólares cada tres meses, presupuestos y lo que hace la gente (corregir un importe mal
    tipeado, borrar repetidos, reemplazar y renombrar categorías, ocultar la cuenta vieja, ajustar el
    efectivo, reabrir el período actual). A fin de cada mes **paga la tarjeta entera y pasa a Ahorros lo
    que sobra en el banco** por encima de un colchón: depende de los saldos y no de montos fijos, así las
    cuentas no se van al rojo aunque se siembren muchos meses. Trae la cotización real de cada día (sin
    internet, usa 1 USD = 40 UYU).
  - **Los contactos**: el admin tiene los de `sembrar-contactos.ts` (13 contactos, recordatorios, deudas
    de todos los tipos con pagos que generan movimiento) y dpaolillo1 los de
    `sembrar-contactos-de-un-anio.ts` (17 contactos, distintos, fechados a lo largo del año). En las dos,
    los recordatorios son **fechas puntuales**: cumpleaños (con el recordatorio automático), aniversarios
    y citas o vencimientos de una sola vez; lo que se repite seguido (llamar a la abuela, pagar una cuota)
    está en Tareas. El histórico de un año se arma por tramos, como lo haría la limpieza periódica con la
    aplicación en uso.
  - **Las tareas** (`sembrar-tareas.ts`): 11 repetitivas de todos los tipos (también *cada varios días* y
    una que se da por fallida sola), sueltas, atrasadas, fallidas y lo hecho hoy de otros días, con tres
    semanas de historial para el admin y casi un año para dpaolillo1 (el servicio arma como mucho 31 días
    hacia atrás por vez, así que se arma por tramos).

Siguen existiendo aunque ya haya panel: siguen siendo la única forma de operar desde la
terminal, por ejemplo en un despliegue sin acceso todavía a la web.

Dónde: `apps/api/src/scripts/`, `apps/api/src/servicios/usuarios/cuentas.ts`.

### Panel de admin

Web, en `/admin`, solo para cuentas con rol admin: solicitudes de registro, listado de
cuentas y auditoría, en tres pestañas.

- **Solicitudes:** aprobar o rechazar una cuenta pendiente, con fecha de la solicitud y
  búsqueda por nombre, usuario o correo. Rechazar pide confirmación; aprobar no, porque
  no le saca acceso a nadie.
- **Cuentas:** busca por nombre, usuario o correo y filtra por estado. Ordenada por
  `estadoActualizadoEn` de más reciente a más vieja (ver Perfil de cuenta): es un feed de
  actividad, así que lo que se acaba de aprobar o rechazar aparece primero, al revés que
  en Solicitudes (que va de la más vieja a la más nueva, como una cola a procesar en
  orden). Cada cuenta muestra su estado, si está bloqueada
  (con el motivo) y si confirmó el correo, cada uno como una insignia de color con ícono
  propio (docs/guias/estetica.md, Colores). Bloquear pide un motivo opcional y
  confirmación, con el botón en el tono de peligro reservado para acciones destructivas;
  desbloquear y resetear contraseña también confirman antes de aplicarse
  (docs/guias/usabilidad.md, Prevenir y deshacer). Ninguna acción aparece sobre la propia
  cuenta del admin: ni bloquearse ni resetearse la contraseña a sí mismo tiene sentido, y
  el backend lo rechaza igual si alguien lo intentara por otra vía. El nombre de cada
  cuenta lleva a su perfil.
- **Auditoría:** quién hizo qué, a quién y cuándo, de lo más reciente a lo más viejo,
  filtrable por tipo de acción y por rango de fechas.

**Perfil de cuenta** (`/admin/cuentas/:id`): todos los datos de una cuenta —incluida su
última conexión— y su propio historial de auditoría, acotado a lo que le pasó a esa
cuenta puntual (mismo componente que la pestaña de Auditoría, con el nombre del objetivo
omitido porque ya lo dice el encabezado de la página). `estadoActualizadoEn` no es un
campo por acción (fecha de solicitud, de aprobación, de rechazo): es un solo campo que
se pisa cada vez que cambia el estado, así que mientras la cuenta sigue pendiente
coincide con la fecha de la solicitud y en cuanto se resuelve pasa a ser esa fecha. La
última conexión tampoco es una columna propia: se calcula de la sesión más reciente
(`MAX(sesiones.updatedAt)`) para no duplicar un dato que ya está ahí.

**Reseteo de contraseña:** el servidor genera una contraseña temporal al azar (16
caracteres, `crypto.randomBytes`) y la muestra **una sola vez**, con un botón para
copiarla; no se guarda en ningún lado en texto plano, ni siquiera en el log. La cuenta
queda con `debeCambiarPassword` prendido y sin ninguna sesión abierta.

**Bloquear, desbloquear y resetear contraseña son rutas de Better Auth** que la web
llama directo con el cliente (`authCliente.admin.banUser`, `unbanUser`); no se
reimplementan (`apps/api/src/rutas/auth.ts`). Lo que sí es propio del proyecto —cerrar
sesiones y marcar `debeCambiarPassword` en el reseteo, y dejar cada acción en la
auditoría— lo agrega un hook `after` en `apps/api/src/auth/crear-auth.ts`, que corre
después de la ruta de Better Auth sin duplicar su lógica. El reseteo de contraseña sí
tiene una ruta propia (`POST /api/admin/cuentas/:id/resetear-password`), porque la
contraseña temporal se genera en el servidor y no hay endpoint de Better Auth que la
devuelva.

Dónde: `apps/web/src/app/admin/`, `apps/web/src/componentes/admin/`,
`apps/web/src/componentes/layout/guardia-de-admin.tsx`, `apps/api/src/rutas/admin.ts`,
`apps/api/src/servicios/usuarios/auditoria.ts`, `apps/api/src/auth/crear-auth.ts`.

Dónde (perfil de cuenta): `apps/web/src/app/admin/cuentas/[id]/`,
`apps/web/src/componentes/admin/perfil-de-cuenta.tsx`,
`apps/api/src/servicios/usuarios/cuentas.ts` (`buscarPerfilDeCuenta`).

---

## Gestión de ingresos y gastos

Primer módulo de negocio del sistema (web, en `/finanzas`), con cinco pestañas:
Resumen, Movimientos, Presupuestos, Estadísticas y Cuentas. El botón **"Agregar
movimiento"** queda siempre a mano, junto a las pestañas, porque es la acción más
frecuente de todo el módulo. Debajo de las pestañas está la **barra del período**
(ver "Períodos"): resumen, movimientos, presupuestos y estadísticas muestran siempre
los datos del período elegido ahí.

**Varias monedas, una base.** Cada cuenta tiene su moneda y sus importes están en ella; la
moneda base de la persona (`usuarios.monedaPorDefecto`, UYU) es en la que se expresan todos los
totales (ver "Monedas y cotizaciones" más abajo y `docs/decisiones.md`, 2026-10-04). Los montos se
guardan como enteros en centésimos y se formatean siempre con `Intl` (`formatearMonto`, en
`packages/shared`).

### Períodos

Los datos del módulo no se agrupan por mes calendario sino por **períodos que abre y
cierra la propia persona**: pueden durar lo que ella quiera (una quincena, un viaje,
un mes que arranca el día de cobro). Reglas:

- Cada período tiene **fecha y hora de apertura** y de **cierre**, pero la pantalla
  muestra solo la **fecha** de inicio y de fin (la hora sí se pide al abrir y cerrar y se
  usa para decidir a qué período pertenece cada movimiento); mientras no se cierra, está
  **abierto**. **Solo puede haber uno abierto a la vez.**
- **Dos períodos no se solapan**, pero **pueden quedar huecos** entre ellos. Un período
  cubre el intervalo `[apertura, cierre)`: incluye el instante de apertura y no el de
  cierre, así el siguiente puede abrir justo cuando cierra el anterior sin que un
  movimiento caiga en los dos.
- Al **cerrar** un período se ofrece **abrir el siguiente**, que continúa justo donde
  terminó el anterior (la fecha de apertura propuesta es el instante exacto del cierre,
  editable). Decir "Ahora no" deja la cuenta sin período abierto hasta que se abra otro.
- El **cierre** propone "ahora", y se puede elegir otra fecha y hora. Se rechaza si es
  futuro, si no es posterior a la apertura o si **dejaría movimientos por fuera** (el
  mensaje dice cuántos y la fecha del último). La **apertura** no puede ser futura ni
  caer antes de que termine otro período.
- El **nombre** lo elige la persona; por defecto se sugiere el **mes y el año en
  que abre** ("Octubre 2026", en la zona horaria de la persona) y, si ya existe, se le agrega un
  **número incremental** ("Octubre 2026 2", "Octubre 2026 3"). Los períodos que ya existían no
  se renombran. Es único por usuario, sin distinguir mayúsculas. Se puede
  cambiar en cualquier momento.
- Un período **cerrado se puede reabrir** ("Reabrir" en la barra): le quita el cierre y
  vuelve a ser el abierto, con el mismo nombre y apertura y sus movimientos intactos. Hace
  falta que **no haya otro período abierto** y, además, que sea **el último** (que ninguno
  empiece después): reabrirlo lo extiende hacia adelante y pisaría al siguiente, y que no se
  solapen es una regla de arriba. Por eso el botón solo aparece en el último período y sin
  ninguno abierto; la API lo vuelve a comprobar (409).
- Un período **se puede eliminar siempre**, esté abierto o cerrado, con una confirmación.
  Si **tiene movimientos**, el diálogo avisa cuántos ("Se van a eliminar 3 movimientos") y que
  **se eliminan con él, sin poder recuperarlos** (transferencias incluidas); el botón pasa a
  decir "Eliminar período y movimientos". Es una baja física, incluso de los movimientos que la
  persona ya había eliminado antes (no los ve, y su período es obligatorio), que no se cuentan
  en el aviso. Todo ocurre en una transacción: o se va todo o no se toca nada.
- **El saldo de las cuentas se ajusta solo**: se calcula al leer a partir de los movimientos,
  así que al desaparecer estos cada cuenta queda como si nunca se hubieran cargado (un gasto
  devuelve su plata, un ingreso la resta, y una transferencia se revierte en las dos cuentas a
  la vez porque es un único movimiento). Los **ajustes manuales de saldo no pertenecen a ningún
  período** y se conservan: siguen sumando su diferencia, por lo que el saldo resultante puede
  no coincidir con el "saldo indicado" que figura en el historial del ajuste. Ingresos, gastos,
  balance y estadísticas del período desaparecen con él; los presupuestos no cuelgan de un
  período (se miden contra él, pero no lo referencian), así que no se tocan.
- El nombre de un período eliminado queda libre, y si era el abierto se puede abrir otro o
  reabrir el anterior. El listado de períodos (`GET /api/finanzas/periodos`) trae
  `cantidadMovimientos` (activos) de cada uno, que es lo que alimenta el aviso.
- La **identidad** del período es un **número interno** (`periodos.id`, autogenerado)
  que la persona nunca ve: los movimientos apuntan a él, no al nombre, así que
  renombrar un período no toca ningún movimiento.

En la pantalla, la barra muestra un selector con todos los períodos (el abierto por
defecto), su rango de fechas y las acciones: renombrar, cerrar (si está abierto),
reabrir (si es el último, cerrado y no hay uno abierto), eliminar y abrir uno nuevo (si no
hay ninguno abierto). Si todavía no hay ningún período, el
módulo explica qué es y ofrece abrir el primero.

### Categorías y cuentas

Cada usuario tiene las suyas, privadas (nunca las de otro, ni para el admin). Las 10
categorías por defecto (Alimentación, Transporte, Vivienda, Servicios, Salud,
Entretenimiento, Compras, Educación, **Ingresos**, Otros), la categoría especial de
transferencias (ver más abajo) y las 4 cuentas por defecto (Efectivo, Banco, Tarjeta,
Billetera digital) no se siembran en una migración: se crean solas la primera vez que
el usuario las pide, como datos normales de su cuenta que puede renombrar o recolorear
igual que a las que crea él mismo. "Ingresos" está pensada para sueldos y otras
entradas de dinero; el resto son categorías típicas de gasto, aunque nada impide
usarlas también para un ingreso puntual.

**Identidad y nombre.** Una categoría se identifica por un **número** autogenerado
(`categorias.id`, entero) que la persona nunca ve; el **nombre** es único entre las
activas de cada usuario (sin distinguir mayúsculas ni espacios de más), garantizado por un
índice único en la base además de la validación del servicio. Cambiar el nombre no toca
ningún movimiento.

**Colores.** Cada categoría tiene un color (`#rrggbb`) para distinguirla de un vistazo en
los movimientos y en el gráfico de gastos por categoría. Los de las categorías por defecto
**no son un gusto**: salen de aplicar en cadena `colorMasDistinto` (en
`packages/shared/src/finanzas/colores.ts`), que elige el color más alejado de los ya elegidos
midiendo la distancia en el espacio CIE L*a*b*; entre cualquier par supera 40 de ΔE (un test
lo verifica). Las categorías **nuevas** que crea la persona toman el color más distinto de
todos los que ya tiene (el formulario ya lo muestra elegido, el servidor lo repite si no
viene), y puede cambiarlo después. A las cuentas que ya existían se les actualizó el color de
las categorías por defecto que nadie había tocado (migraciones `0010` y `0011`).

**Categoría interna "Transferencia entre Cuentas".** Todos los usuarios la tienen, color
amarillo, pero **la interfaz no la muestra como categoría**: no está en la lista de
categorías (que no se puede eliminar ni reemplazar la haría confusa al lado de las propias),
ni en el selector de categoría del formulario de movimientos, ni en los filtros del listado ni
en los presupuestos. Las transferencias se cargan con una casilla (ver "Movimientos") y esta
categoría se asigna sola. Se identifica por un código (`categorias.sistema = 'transferencia'`)
y no por su nombre. Solo la usan las transferencias: un ingreso o gasto no puede usarla, y una
transferencia no puede usar otra (lo valida la API). No admite presupuesto (no es un gasto).
Si una cuenta vieja no la tenía, se crea al pedir las categorías; si la persona ya tenía una
categoría común con ese nombre, a esa se le agrega "(propia)" al nombre. La API (`GET
/api/finanzas/categorias`) sigue devolviéndola, con `sistema: "transferencia"`, y el cliente la
filtra: es lo que permite que el formulario conozca su id. Como no se ve, no se puede crear
otra categoría con ese nombre ("Ya tenés una categoría con ese nombre").

**Eliminar y reemplazar una categoría.** Una categoría **sin movimientos** (los eliminados
lógicamente no cuentan) se elimina con una confirmación (borrado lógico; su presupuesto se
borra con ella). Una categoría **con movimientos no se puede eliminar** (la API responde
409): el botón de eliminar abre un aviso que lo explica y deja **reemplazarla** por otra
categoría ya existente o por una **nueva** (que se crea en el mismo paso, con el color más
distinto si no se elige uno). Reemplazar, en una sola transacción: pasa **todos** sus
movimientos a la categoría elegida —también los de períodos anteriores y los eliminados
lógicamente, para que ninguno quede apuntando a una categoría que ya no existe—, mueve su
presupuesto (a la categoría de destino si esta no tiene uno; si ya tiene el suyo, se
conserva ese y se descarta el de la reemplazada) y la elimina. Los totales y las estadísticas
del histórico reflejan el cambio. Se rechaza reemplazarla por sí misma, por la especial, por
una eliminada o por una de otra persona, sin tocar nada.

Las **cuentas** también se borran lógicamente (`eliminadoEn`): al eliminarlas dejan de
poder elegirse en movimientos nuevos. Es distinto del borrado lógico de gastos/contactos que
pide `docs/guias/seguridad-y-datos.md` (pensado para poder deshacer): acá el motivo es no
romper el historial. **Una cuenta con movimientos no se puede eliminar** (solo ocultar; ver
más abajo): el borrado lógico de cuentas queda para las que no tienen ninguno.

Una **cuenta** (medio de pago) tiene un **saldo** que se calcula al leer, nunca
cacheado, para que no se pueda desincronizar de los movimientos reales:

> saldo inicial (fijado al crearla) + ingresos − gastos + ajustes manuales
> − transferencias que salen + transferencias que entran

**Siempre en la moneda de la cuenta**: las transferencias que entran suman lo que llegó, ya
convertido a la moneda de esta cuenta. Cada fila de la lista muestra el saldo y la moneda
("US$ 2.777,00 · USD"). La moneda se elige al crear la cuenta (por defecto, la base) y **no se puede
cambiar después**, porque todos sus importes están en ella.

En la base, la tabla se llama `cuentas_financieras` y no `cuentas`, porque Better Auth ya
usa ese nombre para las cuentas de proveedor (OAuth).

**Actualizar el saldo (ajuste manual).** El botón "Actualizar saldo" de cada cuenta
pide cuánta plata hay hoy en ella (sirve, por ejemplo, al empezar a usar la aplicación
o para corregir una diferencia). **No genera un movimiento**: no cuenta como ingreso ni
gasto, no pertenece a ningún período y no aparece en el resumen ni en el listado de
movimientos. Se guarda como un **ajuste** (`ajustes_de_saldo`) con lo que indicó la
persona, la diferencia contra el saldo que la cuenta mostraba y la fecha y hora, y suma
al saldo de la cuenta y al disponible. Los ajustes no se editan ni se borran: son el
registro de lo que pasó. Pedir un saldo igual al actual se rechaza (no hay nada que
ajustar), y el diálogo anticipa cuánto suma o resta antes de guardar. Es una foto: los
movimientos que se carguen después mueven el saldo a partir de ahí. El saldo inicial
ya no se edita después de crear la cuenta (para eso está el ajuste, que deja constancia).

**Historial de la cuenta.** El botón de historial abre un listado paginado, del más nuevo
al más viejo, que junta los **movimientos** de la cuenta, sus **ajustes manuales** y la
**carga inicial**, cada uno con su insignia ("Movimiento", "Transferencia", "Ajuste manual" y
"Carga inicial"), para que se vea de un vistazo de cuál se trata. La **carga inicial** es el
saldo con el que se creó la cuenta (con la fecha de creación): aparece **siempre al final**,
porque es el punto de partida —aunque haya movimientos con fecha anterior a la creación—, y
solo si el saldo inicial no era cero. No es un registro nuevo: sale de `saldoInicialCentavos`
de la cuenta, así que las cuentas que ya existían la muestran sin migración. La suma de todos
los montos del historial da el saldo actual. El monto de cada renglón es su efecto sobre el saldo, con signo, y el
del ajuste aclara "No es un ingreso ni un gasto" y el saldo que se indicó. Los ajustes se
ordenan por el momento en que se cargaron y los movimientos por su fecha y hora.

**Ocultar y eliminar.** Cada cuenta tiene un solo botón de eliminar (no hay uno de
ocultar aparte). Una cuenta **sin movimientos** (los eliminados no cuentan) se elimina con
una confirmación, aunque tenga saldo inicial o ajustes: su saldo deja de sumar al
disponible y su historial deja de verse. Una cuenta **con movimientos no se puede
eliminar** (la API responde 409): al tocar eliminar aparece un aviso que lo explica y
ofrece **ocultarla**, para que no le aparezca como cuenta disponible al cargar
movimientos nuevos. Ocultar y volver a mostrar no piden confirmación porque son
reversibles.

Las cuentas ocultas van a una sección propia, **"Cuentas ocultas (n)"**, debajo de la lista
de activas. Es una sección desplegable que **arranca cerrada** y se abre a mano, y **no
existe (ni cerrada) mientras no haya ninguna oculta**. Una cuenta oculta conserva su saldo
(que sigue sumando al disponible) y su historial, se puede ajustar y se vuelve a mostrar
con el botón de mostrar de su fila. Si se intenta eliminar una ya oculta con movimientos,
el aviso dice que ya está oculta y no ofrece ocultarla de nuevo. Un movimiento que ya
estaba en una cuenta que después se ocultó se puede seguir editando sin cambiarle la
cuenta; no se puede mover a otra cuenta oculta ni duplicar.

### Movimientos

Un ingreso o un gasto: tipo, importe, descripción, categoría, cuenta y **fecha y hora**
(`timestamptz`, UTC en la base, mostrada en la hora local). Se pueden editar, eliminar
(borrado lógico) y **duplicar** — duplicar copia todo menos la fecha y hora, que pasan
a ser las de ahora, porque sirve para repetir algo rápido ("el mismo café de siempre"),
no para reescribir el pasado.

**Cada movimiento pertenece a un solo período: el que contiene su fecha y hora.** No se
elige a mano: el servidor lo deduce al crear o editar y lo guarda como `periodoId`. Una
fecha que no cae en ningún período (en un hueco, antes del primero, o sin período
abierto) se rechaza, con el error junto al campo de fecha. El formulario lo anticipa:
debajo de la fecha dice "Se guarda en el período X" o avisa que no cae en ninguno. Si
no hay período abierto, "Agregar movimiento" muestra un aviso que explica la situación y
ofrece abrir uno. Editar la fecha de un movimiento hacia otro período lo cambia de
período; un movimiento de un período cerrado se puede corregir sin reabrirlo.

El listado muestra los movimientos del período elegido (el título lo dice: "Movimientos de
Octubre"; el resumen también: "Últimos movimientos de Octubre"), con filtros por categoría,
cuenta, tipo y búsqueda por descripción, paginado. Cada fila lleva una flecha (verde
hacia arriba para un ingreso, roja hacia abajo para un gasto), un punto con el color de
la categoría y la fecha y hora.

**Transferencias entre cuentas.** Un movimiento puede ser una **transferencia**: pasa
plata de una cuenta propia a otra. Es un tipo nuevo, **"neutro"**: no es ni ingreso ni gasto,
así que **no cuenta en los ingresos, gastos ni balance del período, ni en los presupuestos
ni en las estadísticas**, y el disponible total no cambia (solo se mueve entre cuentas). Se
guarda como **un solo movimiento** con cuenta de origen (`cuentaFinancieraId`) y de destino
(`cuentaDestinoId`), siempre en la categoría especial de transferencias; la base lo exige
(destino solo en las transferencias y distinto del origen). Así, editarla o eliminarla actualiza
las dos cuentas a la vez, sin que puedan quedar desparejas. Resta del saldo del origen y suma al
del destino (el origen puede quedar en negativo), se asigna a un período por su fecha como
cualquier movimiento y se puede editar, duplicar y eliminar; se puede convertir en gasto o
ingreso (y viceversa) cambiando la categoría. Origen y destino tienen que ser cuentas activas
(no ocultas ni eliminadas) y propias; una transferencia que ya existe en una cuenta que después
se ocultó se puede seguir editando.

Se carga de dos maneras: (1) en el formulario de movimientos, **marcando la casilla "Es una
transferencia entre mis cuentas"**, que cambia el formulario (desaparecen el tipo y la categoría
y la cuenta se reemplaza por "Cuenta de origen" y "Cuenta de destino", que no puede ser el
origen); la casilla **solo se ofrece con dos o más cuentas activas**, y al desmarcarla vuelven
el tipo, la categoría (una común) y una sola cuenta; (2) desde el botón **"Transferir"** del
panel de cuentas, que también exige dos o más cuentas activas y abre el mismo formulario ya con
la casilla marcada (no se puede desmarcar) y sin tipo ni categoría. Al editar una transferencia
la casilla aparece marcada: desmarcarla la convierte en un gasto o ingreso. En el listado se ve con el ícono de flechas cruzadas, en amarillo (ámbar,
que se lee sobre el fondo; el amarillo puro es el del punto de la categoría), sin signo, como
"Origen → Destino", y se filtra con "Transferencias". Una transferencia cuenta como movimiento
de las dos cuentas: aparece en el historial de cada una (negativa en el origen, positiva en el
destino) y la cuenta de destino tampoco se puede eliminar.

**Alta rápida:** la fecha y hora arrancan en ahora y la categoría/cuenta proponen lo
último que se usó (guardado en `localStorage` del navegador, no en el servidor: es una comodidad
de este dispositivo, no un dato de la cuenta). Al guardar, el resumen del dashboard se
actualiza al instante con una actualización optimista de TanStack Query —se revierte
con un aviso si el servidor rechaza el movimiento—, mientras que los totales (ingresos,
gastos, saldo de cuentas, presupuestos) se refrescan desde la API al terminar, en vez
de recalcularse a mano en el cliente.

**Sin cuentas disponibles.** Si al agregar un movimiento no hay ninguna cuenta que se pueda
usar (no tiene ninguna, o todas están ocultas), el diálogo lo explica y ofrece **"Crear una
cuenta"**: abre el mismo formulario del panel de cuentas (`formulario-de-cuenta.tsx`) dentro del
diálogo y, al crearla, aparece el formulario del movimiento con esa cuenta lista. Lo mismo vale
para "Transferir" cuando hay menos de dos cuentas activas (se pueden crear las que falten).

**Saldo al elegir la cuenta y aviso de saldo negativo.** En el formulario de movimientos
(también el de transferir), cada opción de cuenta muestra su saldo actual entre paréntesis ("Banco
($ 500,00)"). Si el movimiento dejaría una cuenta con saldo negativo, al tocar Guardar el
formulario no guarda: avisa "Esta cuenta quedaría con saldo negativo" (con el saldo que
quedaría) y pregunta si guardarlo igual ("Sí, guardar igual" / "No, volver"). Una cuenta en
negativo es válida (una tarjeta, por ejemplo), así que es una confirmación y no un bloqueo; la
API no cambia. Reglas: en una transferencia solo se evalúa el origen (el destino recibe plata);
no avisa si el movimiento no empeora el saldo (un ingreso a una cuenta que ya estaba en negativo,
o editar solo la descripción); al editar se descuenta el efecto del movimiento original. El
cálculo se hace en el cliente con el saldo que la API ya devolvió (`cuentasQueQuedanEnNegativo`
en `formulario-movimiento.tsx`), así que si el saldo cambió desde otro dispositivo con el
formulario abierto puede estar un poco desactualizado.

### Monedas y cotizaciones

Cada cuenta tiene su moneda (UYU, USD, ARS, EUR o BRL; lista en
`packages/shared/src/finanzas/monedas.ts`). Al cargar un movimiento, **el importe se escribe en la
moneda de la cuenta** (el formulario lo aclara: "Importe en USD, la moneda de esta cuenta") y se
convierte para los totales:

- **Ingreso o gasto**: a la moneda base de la persona. El resumen, los presupuestos y todas las
  estadísticas suman ese importe ya convertido (`importe_convertido_centavos`).
- **Transferencia**: a la moneda de la cuenta de destino (lo que llega). Entre cuentas de la misma
  moneda no hay conversión.

**Cada movimiento guarda el tipo de cambio que se usó** (`tipo_de_cambio`), el importe convertido y si la
cotización fue manual (`cambio_manual`). Por eso los totales de un período pasado no cambian cuando se
mueve el dólar. El formulario muestra, solo cuando el movimiento cruza monedas, un bloque
**"Cotización"**: "1 USD = 40,2857 UYU · del 03/10/2026" y "Equivale a $ 1.007,14." Lo habitual no pide nada
más. El botón **Cambiar** (con lápiz, en el encabezado del bloque) ofrece tres caminos, y una vez abierto el mismo
botón pasa a **Usar la del día** (o **Volver a la guardada**, al editar) para deshacer el cambio:

1. **La del día** (la de la fecha del movimiento), que trae la API.
2. **Escribir la cotización**, por ejemplo la de un banco que da mejor cambio.
3. **Indicar el importe del otro lado** ("recibí US$ 98" por $ 4.000): la cotización se calcula sola.

**En una transferencia entre monedas el importe se puede escribir en cualquiera de las dos**: un selector
("Moneda en la que escribís el monto") ofrece la de la cuenta de origen (la de siempre) y la de destino. Si se escribe
la de destino ("quiero que lleguen US$ 100"), el formulario calcula cuánto sale del origen con la cotización a la
vista ("Salen $ 4.000,00 de la cuenta de origen.") y a la API le manda los dos importes exactos (`importe` del origen
y `cambio: { modo: "importe" }` con lo que llega), así que el destino queda justo en lo escrito, sin un centésimo de
desvío por redondeo. El costo: la cotización guardada es la que sale de esos dos importes (casi igual a la del día) y
queda marcada como fijada por la persona. También se pueden indicar los dos importes ("Indicar el importe en UYU").
El backend no cambia: sigue recibiendo el importe en la moneda de origen. El selector solo aparece si las dos
cuentas tienen monedas distintas; un gasto o ingreso siempre se escribe en la moneda de su cuenta.

La cotización se dice siempre con la moneda que más vale como unidad ("1 USD = 40,28 UYU", también en
una transferencia de pesos a dólares) y es lo que se escribe. **Si no hay cotización disponible** (la fuente
no responde y no hay ninguna guardada), el bloque lo avisa y pide escribirla: nunca se bloquea cargar un
movimiento. Al **editar**, se propone la cotización guardada ("la que se escribió al cargarlo" o "la del día en
que se cargó"), no la de hoy; se puede volver a la del día. Al **duplicar**, una cotización fijada por la persona
se repite y una automática se actualiza a la de hoy. En el listado, el historial de la cuenta y el
resumen, cada movimiento muestra su importe en la moneda de la cuenta y debajo "Equivale a $ 385,00 · 1
USD = 38,50 UYU (la fijaste vos)".

**De dónde salen las cotizaciones.** Las trae la API (nunca el navegador) de la fuente pública
*fawazahmed0/currency-api* (la única fuente) y las guarda en la tabla `cotizaciones`. **Siempre se consulta
primero la base**: un pedido a la fuente trae las cinco monedas de un día y se guardan todas, así que se pide como
mucho una vez por día (un día pasado, una vez en la vida; la de hoy no se renueva hasta que cambia el día). Si la
fuente cae se usa la guardada más cercana de la última semana, marcada "desactualizada". `GET
/api/finanzas/cotizacion?desde=USD&hacia=UYU&fecha=…` devuelve `{ tasa, fechaDeLaFuente, desactualizada }`
(503 `COTIZACION_NO_DISPONIBLE` si no hay ninguna). Hay cotizaciones desde el 02/03/2024; una fecha futura usa
la de hoy. Por qué esta fuente y no otra: ver `docs/decisiones.md` (2026-10-04).

**Reglas de la API** (`POST/PATCH /api/finanzas/movimientos`, campo opcional `cambio`): `{ modo:
"automatico" }`, `{ modo: "tasa", tasa }` o `{ modo: "importe", importeConvertido }`. Sin `cambio`, al crear
se usa la automática y al editar se conserva la guardada (si las cuentas no cambiaron). Pedir un cambio
manual entre cuentas de la misma moneda, una tasa inválida o un importe que convertido da menos de un
centésimo se rechaza (400, campo `cambio`). La conversión la hace el servidor
(`convertirCentavos`, `packages/shared`): enteros grandes, redondeo al centésimo más cercano.

**Disponible.** Suma el saldo de cada cuenta; las de otra moneda se convierten con la cotización de hoy, así
que el resumen lo marca **"(estimado)"** y, si de alguna moneda no hay cotización, esas cuentas no suman y un
aviso lo dice.

### Resumen (dashboard)

Lo primero que se ve al entrar: **balance** del período (ingresos menos gastos),
**ingresos**, **gastos** (los dos con el total del **período anterior** al lado, para
comparar), **disponible** (la suma del saldo de todas las cuentas activas, convertidas a la moneda
base — no es lo
mismo que el balance: es lo que hay, no lo que entró o salió en el período) y los
últimos movimientos **del período elegido** (no se mezclan los de otros períodos). Las
transferencias entre cuentas **no suman** a ingresos, gastos ni balance, y por eso tampoco
cambian el disponible; sí aparecen entre los últimos movimientos.

El período lo elige la persona en la barra (y viaja como `periodoId`): el servidor nunca
decide cuál es "el actual". El **período anterior** es el inmediato por fecha de
apertura, aunque haya un hueco entre los dos; el primer período no tiene anterior y no
muestra comparación. Como los períodos pueden durar distinto, comparar sus totales es
orientativo.

### Presupuestos

Un límite por categoría, **sin historial**: volver a fijarlo actualiza el mismo, no
guarda versiones anteriores (simplicidad por encima de funcionalidades, ver
`CLAUDE.md`), y **el mismo límite vale para todos los períodos**. Lo que sí varía es cuánto
se gastó, calculado al leer contra los movimientos reales del período que se está mirando. Cada presupuesto muestra una barra de
progreso y, cuando se acerca o supera el límite, un aviso con **texto**, no solo color
("80% usado", "Superado por $ X"): ningún significado depende solo del color
(`docs/guias/estetica.md`). Al eliminar la categoría que tiene un presupuesto, el
presupuesto se borra con ella; al reemplazarla por otra, se mueve (ver "Categorías"). La
categoría de transferencias no admite presupuesto, y las transferencias no cuentan como gasto.

### Estadísticas

La pestaña arranca siempre con los **datos rápidos** y sigue con cinco bloques: la **evolución de
ingresos y gastos con su balance**, el **ritmo de gasto**, **qué subió y qué bajó**, la
**evolución de gastos por categoría** y los **gastos por categoría**. Esos cinco se presentan **en orden
aleatorio** (ver abajo). Los gráficos usan **Recharts** (única librería de gráficos del stack, ver
`docs/librerias.md`): gastos por categoría del período (de mayor a menor, cada barra con el
color propio de su categoría) y la evolución de ingresos/gastos de los últimos 6
períodos hasta el elegido, con el nombre de cada uno en el eje (verde para ingresos, rojo
para gastos — mismo color que las flechas del listado de
movimientos). Los gráficos se cargan de forma diferida (`next/dynamic`, `ssr: false`)
para no engordar el paquete inicial de las otras pestañas del módulo.

**Ingresos y gastos, con su balance.** Una **sola barra por período**, desde cero, que cuenta
qué pasó con lo que entró: lo **rojo** es lo gastado y, si sobró plata, lo **verde** completa hasta
lo que entró. Una **raya negra** marca hasta dónde llegó lo ingresado; si el gasto la pasa, el
tramo de arriba (**rojo rayado**) es lo gastado de más. Así el resultado de cada período se lee de
un vistazo: verde arriba de lo rojo, sobró; rayado arriba de la raya, faltó. La altura de la barra
es la mayor de las dos cifras, por lo que un déficit grande no estira el eje hacia abajo ni aprieta
al resto (se descartó dibujar el balance como una línea o como barras con valores negativos: ver
`docs/decisiones.md`). Una leyenda propia explica cada tramo y la raya (el rayado, además del
color, es lo que distingue "gastado de más"). Al apuntar a una barra, un globito dice cuánto entró,
cuánto salió y el resultado con palabras ("Sobró plata: …" o "Gastaste de más: …"). Las etiquetas
del eje van inclinadas y todas visibles, y los nombres largos se acortan con "…" (el completo está
en el globito y en la lista de abajo). Debajo, una lista con una tarjeta por período dice lo mismo
**con texto**, para que no dependa del color: el monto con su signo y una insignia con ícono
("Sobró plata", "Gastaste de más", "Quedó parejo" o, si no hubo ingresos ni gastos, "Sin
movimientos"). El balance lo calcula la API (`balanceCentavos` en cada elemento de
`evolucionPorPeriodo` de `GET /api/finanzas/estadisticas`), con el mismo criterio que el balance
del resumen; las transferencias no cuentan.

**Orden aleatorio.** Para que ningún bloque quede siempre al final, donde es más fácil no
llegar a verlo, los cinco bloques se mezclan: el orden se sortea **una vez cada vez que se entra a
la pestaña** (o se cambia de período) y **no cambia mientras se está en ella**, ni siquiera al
actualizarse los datos: que algo se mueva mientras se lee sería peor que el problema. Los datos
rápidos no participan: van siempre arriba. Cada bloque es una región con nombre
(`<section aria-label>`), para saltar de uno a otro con un lector de pantalla. El sorteo usa
`mezclar` y `elegirAlAzar` de `packages/shared/src/azar.ts`.

**Datos rápidos.** Tres tarjetas arriba de todo: el **gasto promedio por día** del período (gasto
total sobre los días transcurridos, redondeado al centavo), el **gasto más grande** (monto,
descripción, categoría y fecha; a igual importe, el más reciente; "—" si no hay gastos) y la
**cantidad de movimientos** (ingresos y gastos; las transferencias no cuentan).

**Ritmo de gasto.** Un gráfico de líneas con lo gastado **acumulado día a día** desde la
apertura del período, contra el período anterior (línea punteada, con su nombre en la
leyenda). Arriba, el resultado en palabras: lo que se lleva gastado, lo que se llevaba en el
anterior **a esta misma altura** (mismo número de día) y una insignia con ícono y texto, "$ X
más que en {anterior}" (rojo), "$ X menos que en {anterior}" (verde) o "Igual que en {anterior}".
En un período cerrado se compara el período completo hasta su último día. Con un solo período
se dibuja una sola línea y se explica que falta uno para comparar; sin gastos, se dice con
palabras en vez de dibujar una línea plana.

**Qué subió y qué bajó.** Los gastos de cada categoría contra el período anterior, de la que más
cambió a la que menos (hasta 8; las que quedaron iguales no aparecen). Cada una es una barra que
sale del centro —a la derecha, gastaste más (rojo); a la izquierda, menos (verde)— y mide la
diferencia en plata. El texto dice lo mismo sin depender del color: "Subió $ 200,00 (200%)",
"Bajó $ 50,00 (100%)" o "Nueva: $ 40,00" para una categoría que antes no tenía gastos (sin
porcentaje: dividir por cero no da un porcentaje), y debajo "antes → ahora". En el primer
período se explica que no hay con qué comparar.

**Qué es un "día".** Para el ritmo y el promedio, un día es un **bloque de 24 horas contado desde
la apertura del período** (día 1 son las primeras 24 horas), no un día de calendario. Así no
depende de la zona horaria y períodos que no son meses calendario se comparan por igual. En un
período abierto, los días son los que van hasta ahora (mínimo 1); si hay un gasto cargado por
adelantado con fecha posterior a hoy, el período se extiende hasta su día para no perderlo (el
total siempre coincide con el del resumen). El cálculo está en
`apps/api/src/servicios/finanzas/comparaciones.ts` y llega en la misma respuesta de
`GET /api/finanzas/estadisticas`, con tres campos nuevos: `variacionPorCategoria` (null en el
primer período), `ritmoDeGasto` y `datosRapidos`. Los tres cuentan solo ingresos y gastos
activos del período (ni transferencias ni movimientos eliminados).

**Evolución de gastos por categoría.** Lo **gastado** en una categoría, período a período. Un selector
elige la categoría (al abrir, **una al azar entre las que tuvieron gastos en el período que se
está mirando**, así nunca cae en una vacía; la interna de transferencias no se ofrece). Solo
muestra gastos: los ingresos de la categoría no entran. El gráfico muestra, en **dos gráficas en
una**, los últimos hasta **12 períodos** terminando en el elegido:

- **Barras (eje izquierdo): el valor bruto** gastado en la categoría en cada período, con el color
  de la categoría. Si la categoría tiene **presupuesto**, una línea punteada marca su límite.
- **Línea (eje derecho): ese gasto como porcentaje de los ingresos del período** (todos los
  ingresos, no solo los de esa categoría), con un decimal: "cuánto de lo que entró se fue en esta
  categoría" (250 gastados sobre 2.000 de ingresos son 12,5 %, y puede pasar del 100 %). En un
  período **sin ingresos no hay porcentaje** y la línea se corta, en vez de mostrar un 0 % o un
  valor inventado.

Todos los períodos aparecen, con 0 si no hubo gastos, para que el gráfico no salte; si no hubo en
ninguno, en lugar del gráfico se explica que no hay gastos en esa categoría. No cuenta las
transferencias ni los movimientos eliminados. Como los períodos pueden durar distinto, los puntos
no son del todo comparables. Viene de
`GET /api/finanzas/estadisticas/categoria?periodoId=&categoriaId=&tipo=gasto|ingreso`, que
devuelve `{ tipo, periodos: [{ periodoId, nombre, totalCentavos, ingresosCentavos,
porcentajeDeIngresos }], presupuestoCentavos }` y responde 404 si el período o la categoría no son
de la persona y 400 con un tipo inválido. **La API todavía sabe dar lo ingresado** (`tipo=ingreso`,
y sin `tipo`, gasto), pero la pantalla siempre pide `gasto`.

### Widgets de Finanzas

Cifras, curiosidades y avisos en tarjetas, en dos lugares: **dos carruseles** apilados en
la columna lateral de `/finanzas` (texto arriba, gráficos abajo). Salen del
mismo pedido que el resumen de Finanzas de la pantalla de inicio (ver "Pantalla de inicio"), `GET /api/finanzas/widgets`, que **no recibe parámetros**: el servidor mira el período
abierto o, si no hay, el más reciente (en la moneda base de la persona). Devuelve datos y no frases;
el texto de cada widget lo escribe el cliente (`armar-widgets-de-finanzas.ts`, una función pura). Una
tarjeta es un **aviso** (lleva la insignia "Aviso") o un **dato**; los avisos van primero, de los más
graves a los más leves.

Avisos (aparecen solo cuando corresponden):

- **Cuenta en rojo:** cuentas visibles con saldo negativo, en su propia moneda. Una cuenta oculta no se
  avisa (la persona la sacó de su vista), aunque su saldo siga sumando al disponible.
- **Presupuesto superado** y **por agotarse** (80 % o más sin pasarse del límite): hasta tres de cada
  tipo, los más pasados primero. Llegar justo al límite no es pasarse.
- **Disponible incompleto:** monedas de cuentas sin cotización; esas cuentas no suman al total.
- **Sin períodos / Sin período abierto:** invita a abrir el primero o el siguiente.
- **Sin movimientos todavía** y **Hace días que no cargás nada** (tres días o más desde el último
  movimiento del período abierto).

Cifras y curiosidades. No son todas iguales: cada una tiene la forma que mejor cuenta su dato.

| Widget | Forma |
|---|---|
| **Disponible** (estimado si hay cuentas en otra moneda) | Cifra sola |
| **Balance** del período | Cifra y dos barras horizontales (lo que entró y lo que salió) a la misma escala |
| **Ritmo de gasto** (cuánto más o menos se lleva gastado que el período anterior *a esta misma altura*) | Cifra y **línea**: el gasto acumulado día a día de este período, y punteado el del anterior |
| **Donde más gastás** | Cifra y **anillo** con el porcentaje del gasto total, del color de la categoría |
| **Gasto por período** | Cifra y **barras**, una por período (hasta 6), con el actual resaltado |
| **Presupuestos del período** | Cifra y **barra de avance** (lo gastado sobre lo presupuestado): acento hasta el 80 %, ámbar desde ahí y roja al pasarse |
| **Tu gasto más grande** | Cifra sola |
| **Tus mayores gastos** | **Ranking** de las tres categorías con más gasto: nombre, monto y barra proporcional |
| **Gasto por día** | Promedio y **barras** de los últimos días (hasta 7) |
| **Movimientos cargados** | Cifra sola |

Un gráfico solo aparece si dice algo: el ritmo necesita un período anterior y gastos en los dos, el gasto
por período necesita al menos dos períodos, el ranking al menos dos categorías, y los presupuestos
al menos un límite fijado. Los gráficos son mini gráficos hechos a mano con SVG y `div`s, sin
librería (a este tamaño no hacen falta ejes ni leyendas, y así no se carga una librería de gráficos en
cada pantalla con widgets), con los mismos colores que los gráficos grandes del módulo (verde ingresos,
rojo gastos). **Nunca son la única fuente de información**: el título, la cifra y el detalle dicen lo
mismo con palabras, y los gráficos son decorativos para un lector de pantalla (salvo el ranking, cuyo
texto sí es la información). La columna lateral las separa por categoría.

**Categorías.** Cada widget tiene una categoría, que decide en qué carrusel de la columna lateral va:

| Categoría | Qué es | Dónde va |
|---|---|---|
| **Texto** | Una cifra, una curiosidad o un aviso, sin gráfico, con datos de apoyo | Carrusel de arriba |
| **Gráficos** | Cualquiera con mini gráfico (línea, barras, comparación, anillo, avance o ranking) | Carrusel de abajo |

Las formas ya existentes (cifra sola, línea, barras, comparación, anillo, avance y ranking) no son
categorías sino la manera de dibujar un widget: la cifra sola es de *texto* y todas las demás, de
*gráficos*. Se pueden agregar más categorías (cada una sería un carrusel más) agregándolas a
`CATEGORIAS_DE_WIDGET` en `componentes/widgets/tipos.ts`.

En la columna lateral, los widgets se separan por categoría: el carrusel de **arriba** es de texto (los
avisos, primero, de los más graves a los más leves) y el de **abajo**, de gráficos. Son **grandes**
(de 256 a 320 px de alto cada uno según el alto de la ventana —256 px por debajo de 800 px de alto, 288 px
desde 800 px y 320 px desde 900 px—, con la cifra y los gráficos más grandes) y las tarjetas de texto agregan
**datos de apoyo** debajo del detalle (por ejemplo, en *Disponible*: lo que entró y salió en el
período; en *Tu gasto más grande*: cuánto pesa en tus gastos; en *Movimientos cargados*: promedio por
día y cuándo fue el último; en *Cuenta en rojo*: cada cuenta con su saldo; en *Presupuestos del
período*: cuánto te queda o te pasaste). El contenido **llena el alto de la tarjeta**: los gráficos
crecen, y una tarjeta de texto con poco que mostrar agranda la cifra y el detalle. **Nada se corta con
puntos suspensivos**: una cifra larga (varias monedas) achica la letra y pasa a otro renglón. Los dos van **juntos** (32 px entre uno y otro, que pasan a 40 px desde 800 px de alto y a 48 px desde
900 px) y
**centrados** en el alto de la columna, con margen de sobra arriba y abajo en lugar de estirados de
punta a punta; la columna acompaña el scroll igual que el menú (`sticky`), y si la ventana es muy
baja y no entran, se desplaza por dentro. Si una categoría no tiene widgets no se muestra su carrusel
(sin períodos hay solo widgets de texto: un aviso y el disponible). Los dos comparten **un
solo tiempo** (12 segundos): un único reloj de la columna (`useRelojCompartido`) les avisa cuándo
toca pasar al siguiente, así que cambian siempre juntos. **Tocar la flecha de cualquiera de los dos
reinicia ese tiempo para ambos**: el próximo cambio automático llega recién 12 segundos después del
toque. Lo único propio de cada carrusel es detenerse: con el mouse encima o el foco del teclado
adentro ignora el aviso y se queda en su widget, mientras el otro sigue.

**Si un texto no entra, se desliza solo.** El contenido de una tarjeta grande vive en una zona con
scroll (`AreaDesplazable`). Si cabe, no hace nada. Si se pasa del alto (un nombre largo, una
descripción de 140 caracteres), espera unos 2 segundos, baja despacio (unos 28 px por segundo) hasta
el final, espera y vuelve a subir, en bucle, para poder leerlo todo sin cortar nada (el detalle no se
recorta por renglones en estas tarjetas). Respeta lo que pide la accesibilidad para el contenido que
se mueve solo: se **detiene con el mouse encima o con el foco adentro**, y con **reducir movimiento**
no se mueve (queda desplazable a mano con la rueda, el dedo o las flechas). Cuando desborda, la zona
se puede **enfocar con el teclado** (`tabindex`); si todo entra, no suma una parada más al Tab.

Cada carrusel **no muestra ningún contador ni paginado**: solo tiene dos flechas (anterior y
siguiente, que dan la vuelta), **por fuera de la tarjeta**, una a cada lado y centradas en vertical,
para que no tapen nada de lo que muestra, y **solo aparecen cuando el mouse está sobre el carrusel**
(o el foco llega con el teclado). Su lugar está siempre reservado, así que al aparecer no mueven nada.
Por eso la columna lateral mide 288 px (antes 260) y, desde 1280 px de ancho de ventana, **336 px**, para dar más margen a los textos. Avanza solo, y se detiene mientras el mouse está encima (tarjeta o flechas) o el foco llegó
con el teclado (tocar una flecha con el mouse no lo deja quieto después, y tampoco avanza con la
pestaña oculta). Con la preferencia de **reducir movimiento** no avanza solo. No hay
botón de pausa ni barra de tiempo (ver `docs/decisiones.md`). Los widgets se actualizan solos al cargar
o cambiar cualquier cosa del módulo (comparten la clave de caché `["finanzas"]`).

Dónde: API `apps/api/src/servicios/finanzas/widgets.ts` y la ruta en `rutas/finanzas.ts`; web
`apps/web/src/componentes/widgets/` (tipos, tarjeta, carrusel, mini gráficos y la columna que los
reparte, sin saber de ningún módulo) y `apps/web/src/componentes/finanzas/widgets/`. Tests:
integración en `widgets.integracion.test.ts` (cálculo, límites del 80 %, ocultas, monedas, datos de
los gráficos, aislamiento entre personas) y e2e en `widgets.spec.ts` (lo que dice cada widget, variedad de formas,
los dos carruseles por categoría, que ningún widget se corta, flechas con hover, pausa con mouse y teclado, reducir movimiento, accesibilidad
en los dos temas) y `columnas-plegables.spec.ts` (esconder y mostrar cada columna, que se recuerde
sin destello, teclado, dónde hay pestañas y accesibilidad).

### Deudas y préstamos

Pestaña **Deudas** de `/finanzas`: la plata que le **deben** a la persona (`me_deben`) y la que ella
**debe** (`debo`), **con un contacto o con alguien que no lo es** (solo un nombre escrito a mano). Es un **registro aparte de los movimientos: por sí sola no mueve
los saldos de las cuentas ni entra en los totales, balances, presupuestos y estadísticas del
período** (si no, lo prestado contaría como un gasto y lo devuelto como un ingreso). Lo dice el
propio formulario. Solo cuando la persona lo pide al registrar un pago o cobro, ese pago genera su
movimiento (ver más abajo).

- **Con quién**: al registrar una deuda se elige `Un contacto` o `Otra persona o lugar` (un nombre de
  hasta 80 caracteres, que no crea ninguna ficha). Es uno de los dos, nunca los dos ni ninguno
  (el esquema, el servicio y una restricción de la base lo exigen). En la lista queda **dicho con
  texto**: con un contacto, su nombre es un **enlace a su ficha** y lleva la insignia *Contacto*;
  con un nombre, lleva *No es un contacto* y no tiene enlace; con un contacto en la papelera, dice
  *Contacto en la papelera* y tampoco enlaza (su ficha ya no se puede abrir). El enlace abre
  `/contactos?contacto=<id>`, que muestra esa ficha ya abierta (al cerrarla la dirección vuelve a
  `/contactos`; un id inválido o inexistente se ignora). Las deudas con un nombre suman a *Te
  deben* y *Debés*, pero no cuentan como "contactos con deuda", no aparecen en la ficha de nadie y
  no se filtran por contacto. Con quién es no se cambia al editar.
- Una deuda tiene: con quién, sentido, concepto (hasta 140 caracteres), monto, **moneda**, el día en
  que se originó y, **opcional, una fecha límite** (hasta qué día debería saldarse: "vence el
  31/12/2026" en la lista y en la ficha del contacto). El límite puede ser el mismo día de la deuda o
  posterior, pero no anterior (lo exigen el esquema, el servicio y una restricción de la base); sí
  puede ser un día que ya pasó (una deuda atrasada). Se cambia o se quita al editar (vacía la quita; si
  el pedido no trae el campo, queda como estaba). Todavía solo se guarda y se muestra: más adelante
  servirá para avisos y recordatorios. Es en **una sola moneda y no se convierte**: los totales se dan por moneda
  ("$ 5.000,00 · US$ 100,00") y nunca se mezclan.
- **Un pago o cobro puede generar su ingreso o gasto.** El formulario de pago tiene la casilla
  *Registrar también el ingreso en una de mis cuentas* (cobro, cuando le deben a la persona) o *…el gasto
  desde una de mis cuentas* (pago, cuando ella debe). Al tildarla se elige la **cuenta** (cualquiera
  a la vista, **de cualquier moneda**; ya viene elegida una de la moneda de la deuda, si hay) y la **categoría** (ya viene
  "Ingresos" u "Otros", o la primera si se renombraron). Se crea un **ingreso** (cobro) o un **gasto**
  (pago) por el importe del pago, con la descripción "Cobro: <concepto>" o "Pago: <concepto>" (con
  "(US$ 25,00)" al final si hubo conversión), el
  contacto de la deuda (si es un contacto y no está en la papelera) y la fecha del pago: **hoy, a la hora
  de ahora**; **otro día, a mediodía de ese día** en la zona horaria de la persona. Ese día tiene que
  caer en un período (si no, el pago no se registra y se avisa; se puede registrar sin el movimiento).
  Pago y movimiento se guardan **en una sola transacción**: o se crean los dos o ninguno. **Si la cuenta es de otra moneda que
  la deuda, el importe se convierte como en una transferencia entre cuentas**: aparece la sección
  *Cotización* con la del día y a cuánto equivale, y se puede escribir otra o indicar el importe que
  llegó a la cuenta (el mismo componente que usan los movimientos entre monedas). Lo que se descuenta
  de la deuda es siempre lo pagado, en su moneda; en la cuenta entra el importe convertido. Sin
  cotización del día, se pide escribirla y el pago no se registra hasta tenerla. Si además la cuenta
  está en otra moneda que la base, el movimiento se convierte a la base como cualquier otro. En la lista, el
  pago dice *Generó un ingreso en <cuenta>* y, al quitarlo, **se elimina también ese movimiento** (la
  confirmación lo avisa); si el movimiento se eliminó por su lado, el pago queda como uno común. Las
  deudas eliminadas no deshacen los pagos ni sus movimientos. La casilla **viene tildada**; se puede destildar
  en cada pago. Si no se puede generar el movimiento (no hay un período abierto, no hay una cuenta a la
  vista, o no se pudieron cargar las opciones), el formulario lo dice y el pago
  **se registra igual, solo**: tildarla de entrada nunca impide registrar un pago. Mientras se cargan las
  opciones, el botón espera.
- **Un pago nunca puede pasar de lo que falta**: el formulario avisa apenas se escribe un importe mayor
  ("No puede pasar de lo que falta: $ 100,00."), muestra el máximo bajo el campo y no envía el pedido; el
  servidor lo vuelve a comprobar (con la fila de la deuda bloqueada).
- Se va saldando con **pagos parciales** (en el sentido "me deben" se llaman cobros). Lo que falta
  se calcula al leer (monto menos pagos vigentes). Un pago no puede pasar de lo que falta, no puede
  ser anterior a la deuda ni caer en el futuro; "Cobrar todo lo que falta" completa el monto. Dos
  pagos simultáneos no pueden dejar el saldo en negativo: el servicio valida con la fila de la deuda
  bloqueada (`for update`).
- **Editar** cambia concepto, monto y día; el contacto, el sentido y la moneda no se cambian (si
  estaban mal, se elimina y se registra de nuevo). El monto no puede quedar por debajo de lo ya
  pagado, ni el día de la deuda ser posterior al de su primer pago. Un pago se puede **quitar**
  (con confirmación) si se cargó mal: la deuda recupera el saldo y, si estaba saldada, vuelve a
  estar pendiente.
- La lista muestra las **pendientes** por defecto (también *Saldadas* y *Todas*, y filtro por
  sentido), con una barra de avance accesible (`role="progressbar"`) y los pagos desplegables. El
  resumen de arriba suma lo que le deben y lo que debe.
- Fechas: "AAAA-MM-DD" (`date`); "hoy" es el de la zona horaria de la persona.
- **Borrado lógico** de deudas y pagos (`eliminadoEn`) y borrado definitivo a los 30 días (ver
  Contactos, Tareas programadas). Un contacto con una **deuda pendiente no se puede eliminar** (409
  con el motivo); uno con deudas, pendientes o saldadas, **nunca se borra en definitivo** mientras
  esas deudas existan, para que no queden apuntando a alguien que ya no está.
- Toda consulta filtra por la persona de la sesión; las deudas y pagos de otra persona responden 404.

API (exigen sesión): `GET /api/finanzas/deudas` (filtros `estado`, `sentido`, `contactoId`, `limit`,
`offset`), `GET /api/finanzas/deudas/resumen`, `POST`, `GET/PUT/DELETE /api/finanzas/deudas/:id`,
`POST /api/finanzas/deudas/:id/pagos` y `DELETE …/pagos/:pagoId`. Código: esquema en
`packages/db/src/esquema/finanzas.ts` (migraciones `0016`, `0017` —contacto opcional y `nombre_libre`—, `0019` —`fecha_limite`— y `0020` —`movimiento_id` del pago—), servicio
`apps/api/src/servicios/finanzas/deudas.ts`, rutas `apps/api/src/rutas/deudas.ts`, esquemas en
`packages/shared/src/finanzas/deudas.ts` y web en `apps/web/src/componentes/finanzas/deudas-de-finanzas.tsx` y
`formulario-de-deuda.tsx`.

**Widgets**: *Te deben* y *Debés* (por moneda, con cuántas deudas y con cuántos contactos), que se
ven aunque todavía no haya un período abierto.

### El contacto en cada movimiento

Un ingreso o gasto puede llevar **un contacto** ("Con quién (opcional)": a quién se le pagó, de quién
se cobró). Es opcional; **una transferencia entre cuentas propias no lleva contacto** (la API
responde 400 en el campo `contactoId` y la base lo garantiza con un `check`). El contacto tiene que ser
de la persona y estar activo; si después pasa a la papelera, el movimiento lo sigue mostrando y se
puede editar sin tocarlo, pero no se ofrece para movimientos nuevos (y duplicar un movimiento no lo
copia). Si el contacto se borra en definitivo, el movimiento se queda sin contacto (`on delete set
null`) y sigue existiendo. El listado de movimientos lo muestra y la API filtra por `contactoId`.

### Dónde está

- Esquema: `packages/db/src/esquema/finanzas.ts` (`periodos`, `categorias`,
  `cuentas_financieras`, `ajustes_de_saldo`, `movimientos`, `presupuestos`, `cotizaciones`).
- Compartido: `packages/shared/src/finanzas/` (esquemas Zod, constantes —set de
  categorías con sus colores, categoría de transferencias—, `colores.ts` con el color más
  distinto, `periodos.ts` con el nombre sugerido, `monedas.ts` con la lista de monedas y `cambio.ts`
  con la conversión), `packages/shared/src/formato/` (montos, fechas, porcentajes y cotizaciones).
- API: `apps/api/src/servicios/finanzas/` (monedas y cotizaciones: `cotizaciones.ts`, `moneda-base.ts`
  y la conversión en `movimientos.ts`, `resolverCambio`), `apps/api/src/rutas/finanzas.ts`. Los tests de
  la API usan una fuente de cotizaciones falsa (`apps/api/src/pruebas/cotizaciones-de-prueba.ts`): nunca
  salen a internet.
- Web: `apps/web/src/app/finanzas/`, `apps/web/src/componentes/finanzas/`,
  `apps/web/src/lib/api-finanzas.ts`, `apps/web/src/lib/preferencias-finanzas.ts`.

### Campos de importe

Todos los campos donde se escribe plata (importe de un movimiento, saldo inicial de una cuenta,
saldo al actualizarla, límite de un presupuesto y los de la cotización) **separan los miles mientras se escribe**:
"1234567,5" se ve "1.234.567,5". Detalles:

- Es un campo de texto con teclado numérico en el móvil, no un `<input type="number">`, que no
  puede mostrar separadores. El componente es `CampoDeImporte`
  (`apps/web/src/componentes/ui/`) y el formato y la interpretación viven en
  `packages/shared/src/formato/importe-escrito.ts`, con separadores tomados de `Intl` (es-UY:
  punto para miles, coma para decimales).
- La **coma** es el decimal; un **punto** escrito (el del teclado numérico) también se toma como
  decimal. Hasta **dos decimales** y hasta doce dígitos enteros; no deja escribir letras. Los
  saldos admiten un **signo menos** al principio; el importe de un movimiento y el límite de un
  presupuesto, no.
- Una **cotización** se escribe en el mismo campo pero admite hasta **seis decimales**
  (`decimales` en `importe-escrito.ts`).
- Al **pegar** un importe de otro lado se interpreta solo ("1,234.56", "$ 250.5", "1.234,56"):
  si hay dos separadores el último es el decimal; si hay uno solo, es decimal cuando le siguen
  uno o dos dígitos ("250.5") y de miles cuando le siguen tres ("1.234").
- El **cursor se queda donde estaba** aunque el formato agregue o quite puntos, y borrar un dígito
  vuelve a ordenar los miles. Al salir del campo, una coma sin decimales ("12,") se limpia.
- Hacia el formulario sube un número (NaN si está vacío), igual que antes: los esquemas Zod y la
  API no cambian.
- **La moneda va dentro del campo:** todo campo de importe muestra, a la derecha y sin poder
  editarse, el código de la moneda en la que se escribe ("UYU", "USD"…). El componente exige la
  prop `moneda` (es obligatoria a propósito: no se puede olvidar). Cada campo usa la moneda de lo
  que representa: el importe de un movimiento, la de la cuenta elegida (cambia al cambiar de
  cuenta; en una transferencia entre monedas, la que se elija con el selector de origen o destino); el saldo inicial, la que se está eligiendo para la cuenta; actualizar saldo, la de esa
  cuenta; el límite de un presupuesto, la moneda base; el "Importe en X" de la cotización, X; y
  la cotización, la moneda que se cobra por una unidad ("1 USD = … UYU" lleva "UYU"). El
  `Campo` la dibuja como `sufijo`, reserva lugar para que el texto no quede debajo y la anuncia a
  los lectores de pantalla junto con la ayuda (`aria-describedby`).

### Límites conocidos

- **Tope de un importe: 9.999.999.999** (`IMPORTE_MAXIMO`, en `packages/shared`), con hasta dos
  decimales y mayor que cero. Vale para cada movimiento, para el saldo inicial de una cuenta,
  para el saldo que se indica al actualizarla (también negativo) y para el límite de un
  presupuesto. Es un tope contra errores de tipeo, no técnico: el saldo de una cuenta y los
  totales de un período son sumas y pueden superarlo. Los montos se guardan en centésimos
  como `bigint`.

- **Una transferencia es entre cuentas del mismo usuario**, de la misma o de distinta moneda (ver
  "Monedas y cotizaciones"). No hay comisiones (la diferencia entre lo entregado y lo recibido queda
  en la cotización) ni transferencias entre períodos: es un movimiento más, de una sola fecha.
- **Reemplazar una categoría no se puede deshacer** (los movimientos pasan a la categoría
  elegida y no se guarda de dónde venían). Hay una confirmación explícita, pero no un deshacer.
- Los colores de las categorías ya creadas no se recalculan solos al agregar otras: el más
  distinto se calcula al crear (o al reemplazar por una nueva) y después es editable.

- **Gastos recurrentes** (alquiler, suscripciones) y sus "próximos gastos" quedan para
  una etapa aparte: no están implementados todavía (CLAUDE.md, hoja de ruta, paso 7 —
  "cada módulo se implementa solo cuando se pida explícitamente").
- **Monedas**: solo las cinco de la lista (UYU, USD, ARS, EUR, BRL, todas de dos decimales); la
  moneda de una cuenta no se puede cambiar y no hay una cotización "habitual" por cuenta (se elige
  por movimiento). Los totales son siempre en la moneda base: no hay una vista de los totales en otra
  moneda ni se revalúan los históricos. La API de cotizaciones no tiene límite por usuario más allá de
  la caché: una persona podría pedir muchos días distintos y generar consultas a la fuente (cada día
  se pide una sola vez).
- **Los períodos no se pueden eliminar** ni se les pueden editar las fechas de apertura
  o cierre después de crearlos (solo el nombre). Un período abierto con una fecha mal
  puesta se corrige cerrándolo y abriendo otro.
- Los movimientos siempre se ven de a un período: no hay una vista de "todos los
  períodos juntos" ni filtro por rango de fechas libre. Tampoco se pueden crear períodos
  ya cerrados en el pasado (para cubrir un hueco habría que haberlos abierto a tiempo).
- El listado de períodos no se pagina (a diferencia de los movimientos): son pocos, del
  orden de uno por mes, y el selector necesita verlos todos.
- Que dos períodos no se solapen lo valida el servicio, no la base (una restricción de
  exclusión exigiría la extensión `btree_gist`): dos pedidos simultáneos de la misma
  persona podrían, en teoría, saltearse esa validación. Ver `docs/decisiones.md`.
- La web muestra y pide las fechas en la zona horaria del **dispositivo**; la API usa la
  del **perfil** (`usuarios.zonaHoraria`) para el nombre sugerido y los mensajes con
  fechas. Coinciden mientras la persona use el dispositivo en su zona habitual.

---

## Contactos

Guarda a las **personas** y a las **empresas o servicios** con los que la persona se
relaciona (un electricista, un banco, un familiar), con sus teléfonos, correos y otros datos,
y le permite **recordar fechas** de cada uno. Cada cuenta tiene los suyos: toda consulta
filtra por la persona de la sesión, sin excepción para el admin, y los contactos de otra
persona responden 404 como si no existieran.

### Datos de un contacto

| | Persona | Empresa o servicio |
|---|---|---|
| Obligatorio | nombre | nombre |
| Propios | apellido, fecha de nacimiento | rubro, sitio web, horario de atención, RUT o documento, persona de contacto |
| De los dos | teléfonos (hasta 5, celular o fijo), correos (hasta 5), dirección, notas (hasta 1.000 caracteres), etiquetas (hasta 10), favorito | igual |

- **El tipo no se puede cambiar** después de crear el contacto (una persona no se convierte en
  empresa): se crea otro. La base lo garantiza con `check`: una empresa no puede tener fecha
  de nacimiento ni una persona, rubro.
- Los campos opcionales en blanco se guardan como "sin dato". Teléfonos y correos conservan el
  orden en que se cargaron; un correo repetido se guarda una sola vez.
- Teléfono: dígitos, espacios y `+ ( ) - .`, entre 3 y 15 cifras (cabe un `911` o un
  `+598 99 123 456`). Se guarda como se escribió.
- Sitio web: con o sin `https://`; **solo http o https**. Un `javascript:` o `data:` se
  rechaza al guardar, y en la ficha solo se vuelve enlace lo que `aEnlaceWeb` reconoce como web
  (con `target="_blank"` y `rel="noopener noreferrer"`).
- La fecha de nacimiento tiene que existir en el calendario, ser de 1900 en adelante y no ser
  posterior a hoy (el "hoy" de la zona horaria de la persona).
- **Borrado lógico** (`eliminadoEn`): un contacto eliminado desaparece de las listas, de la
  ficha, de los recordatorios y de los widgets. Un job lo borra en definitivo a los **30 días**,
  con sus teléfonos, correos, vínculos con etiquetas y recordatorios (cascada).

### Buscar, filtrar y ordenar

- **Orden**: favoritos primero y después por nombre y apellido, sin distinguir mayúsculas
  (`lower()`). El orden de las letras con tilde depende del *collation* de la base de datos.
- **Búsqueda** (se espera 300 ms a que se deje de escribir; mientras llega la respuesta se sigue
  viendo la lista anterior): nombre, apellido, nombre completo ("juan rodr"), rubro, persona de
  contacto y correos, sin distinguir mayúsculas. Un **teléfono se busca por sus cifras**, sin
  importar cómo se escribió (`99123456` encuentra `+598 99 123-456`; hacen falta al menos 3).
  `%` y `_` se buscan como texto común, no como comodines.
- **Filtros**: Todos, Favoritos, Personas, Empresas, y por etiqueta. Se combinan en la API.
- **Paginación**: 20 por página en la web (`limit` hasta 100 y `offset` en la API), con el
  total de los que cumplen el filtro.
- La búsqueda **no ignora tildes** ("jose" no encuentra "José"): hacerlo exige la extensión
  `unaccent` de PostgreSQL. Ver `docs/decisiones.md`.

### Etiquetas

Grupos que arma la persona ("Familia", "Proveedores"), con un color. **Cada persona arranca con
cuatro ya creadas: Familia, Amigos, Trabajo y Servicios**, que son suyas como cualquier otra: puede
renombrarlas, cambiarles el color o eliminarlas, y no vuelven a aparecer. Se crean la primera vez que
se miran sus etiquetas (también las cuentas que ya existían, si no tenían ninguna propia); una marca
en el usuario (`etiquetasInicialesCreadas`) evita que se recreen. Cuentan para el tope de 50. Un contacto puede tener
hasta 10 y una persona crear hasta 50. El nombre es único por persona sin distinguir
mayúsculas (dos personas sí pueden tener la misma). Cada etiqueta nueva propone el color más
distinto de las que ya existen (`colorMasDistinto`). **Eliminar una etiqueta se la quita a sus
contactos sin tocarlos**; el diálogo de confirmación dice a cuántos. Se pueden crear desde la
pestaña Etiquetas o, al vuelo, desde el formulario de un contacto (Enter crea la etiqueta, no
envía el formulario). La API verifica que las etiquetas elegidas sean de la persona: no se
puede vincular una ajena.

### Recordatorios

Cada contacto tiene una lista de recordatorios: un **título**, **cada cuánto se repite** y
**cuándo cae**. Lo que se le pide a la persona **cambia según la repetición**, porque cada una
se define con algo distinto:

| Se repite | Se pide | La hora |
|---|---|---|
| Una sola vez | el día (no puede ser anterior a hoy) | opcional |
| Todos los días | solo la hora | **obligatoria** (propone las 09:00) |
| Todas las semanas | el día de la semana (lunes a domingo) | opcional |
| Todos los meses | el día del mes (1 a 31) | opcional |
| Todos los años | el día y el mes | opcional |

Sin hora, el recordatorio vale para todo el día. El mismo día, primero van los de todo el día y
después los que tienen hora, de la más temprana a la más tarde.

- Es un **aviso dentro de la aplicación**: aparece en la ficha del contacto, en la pestaña
  Recordatorios y en los widgets. **No manda correos ni notificaciones** (eso queda para el
  módulo de notificaciones, que los va a reutilizar).
- Se guarda lo que la persona eligió (el día de la semana, el día del mes...), no la próxima
  fecha: **cuándo cae la próxima vez se calcula al leer** (`proximaOcurrencia`,
  `packages/shared`). Un día 31 en un mes de 30 días cae el último día del mes; un 29 de
  febrero cae el 28 en los años comunes. En la ficha y en la lista se lee en palabras
  (`describirProgramacion`): "Todos los lunes a las 10:00", "El día 15 de cada mes", "Cada 12 de
  mayo", "Todos los días a las 08:00".
- Un recordatorio de **una sola vez** no puede quedar en el pasado (la API responde 400 junto a
  la fecha). Al terminar su día se da de baja (borrado lógico) y deja su entrada en el **histórico**.
  Es el único que puede estar pasado; los que se repiten siempre tienen una próxima vez y **siguen
  vivos**. Uno pasado no aparece en la ficha ni en los widgets ni cuenta para el máximo de 30 por
  contacto.
- **El histórico** (tabla `historial_de_recordatorios`): cada vez que un recordatorio cae y su día
  pasa, queda una entrada aparte —también en los que se repiten: el cumpleaños de mamá deja una cada
  año y un recordatorio diario, una por día—. La entrada guarda una copia del título, la repetición, la
  hora y el día en que cayó, así sigue igual aunque el recordatorio se edite o se elimine. Se genera al
  leer el histórico (y en la limpieza periódica) a partir de `historialHasta`, el último día ya pasado al
  histórico de cada recordatorio: un recordatorio recién creado no inventa historia, y si pasó mucho
  tiempo sin generar solo se recuperan los últimos 90 días. La persona puede **eliminar entradas
  sueltas** o **vaciar todo el historial** (borrado en duro: son datos derivados); eso nunca toca los
  recordatorios y lo borrado no vuelve a generarse.
- **"Hoy" es el de la zona horaria de la persona** (`usuarios.zonaHoraria`), no el de UTC: uno
  "de hoy" sigue vivo todo el día de ella, y "los martes" son los martes de ella. La hora es de
  reloj de la persona, sin zona. Las fechas son `date` ("AAAA-MM-DD"): el 12 de mayo es el mismo
  día en cualquier zona.
- Al crear uno, el sistema **recomienda los más comunes** según el tipo (personas: Cumpleaños,
  Aniversario, Llamarle, Devolverle algo; empresas: Renovar el contrato, Pagar el servicio,
  Control o mantenimiento, Pedir presupuesto). Un toque completa título y repetición, y el
  cumpleaños toma el día y el mes de la fecha de nacimiento si está cargada. No se ofrece uno que
  el contacto ya tiene.
- **Al dar de alta a una persona con fecha de nacimiento** aparece debajo de la fecha la casilla
  **"Crear un recordatorio de su cumpleaños"**, marcada de entrada: crea además el recordatorio
  anual "Cumpleaños" (día y mes de la fecha) en la misma operación. Se ofrece solo en el alta y solo
  con la fecha cargada; en empresas no existe y al editar no se ofrece (se usa la ficha).
- La base garantiza que cada repetición lleve exactamente sus campos (un `check`): un
  recordatorio semanal no puede tener día del mes ni fecha.
- Hasta 30 por contacto. Eliminar uno pide confirmación ("¿Eliminar? No / Sí") y es lógico.
- **Importantes.** El formulario de recordatorio (en la ficha y en "Agregar recordatorio") tiene la casilla
  **"Marcar como importante"**. Un recordatorio importante lleva el distintivo "★ Importante" en la pestaña Recordatorios y en la
  ficha del contacto; **no cambia el orden** (siguen por fecha). Cada entrada del historial guarda si era importante cuando cayó y
  muestra el distintivo. La API recibe `importante` (opcional: al crear, sin el campo no lo es; al editar, sin el campo
  se conserva).
- La pestaña **Recordatorios** junta los de todos los contactos y se divide en **Próximos** (el que
  cae antes primero, agrupados en Hoy, Esta semana, Este mes y Más adelante) y **Pasados** (el
  histórico, la entrada más reciente primero, agrupadas en Ayer, La última semana, El último mes y
  Antes; cada fila dice "hace N días" y cómo se repite el recordatorio de origen, y se puede eliminar
  ahí mismo con confirmación). Junto a los filtros, **Vaciar historial** abre un aviso que explica que
  se borra todo el historial (no solo lo filtrado), que no se puede deshacer y que **los recordatorios
  no se borran**: los de Próximos siguen avisando y lo que pase de ahora en adelante vuelve a quedar en
  el historial. Cada fila de **Próximos** se puede **editar** (el mismo formulario de la ficha, en un diálogo) y **eliminar** (con
  "¿Eliminar? No / Sí") sin entrar a la ficha; en **Pasados** se elimina la entrada. Esas acciones **aparecen al pasar el
  mouse por la fila** (o al navegar con el teclado), desplegándose hacia la izquierda con la misma animación que las de la
  lista de movimientos de Finanzas; en pantallas táctiles se ven siempre, y mientras se confirma una eliminación quedan
  abiertas. Tiene **filtros**, resueltos por la API: búsqueda por texto (en el título o en el nombre
  del contacto), por contacto y por cómo se repite; un contador y "Limpiar filtros". Ahí el botón de
  arriba es **Agregar recordatorio**: pide primero de qué contacto es y, elegido, muestra el mismo formulario que la
  ficha (con las sugerencias según el tipo de contacto). Sin contactos, explica que primero hace
  falta uno.

### Plata con un contacto

En la ficha, la sección **Plata** junta lo de Finanzas con ese contacto (`GET /api/contactos/:id/finanzas`):
cuántos movimientos hay, cuánto se **gastó** y cuánto se **cobró** en total (en la moneda base, con el importe
ya convertido que guarda cada movimiento) y los cinco más recientes; y las **deudas pendientes**, con
lo que falta. Desde ahí se **registra una deuda** y se **registra un cobro o pago** sin salir de la ficha
(el contacto ya viene fijado). Editar, eliminar y ver los pagos se hace en Finanzas, pestaña Deudas. Ver
"Deudas y préstamos" y "El contacto en cada movimiento" en la sección de Finanzas.

Para los selectores de otros módulos, `GET /api/contactos/opciones` devuelve lo mínimo de cada contacto
activo (id, tipo, nombre y apellido), por nombre y con un tope de 500.

### Ver la dirección en el mapa

Si el contacto tiene dirección, la ficha muestra **Ver en el mapa**: un enlace común a la búsqueda de
OpenStreetMap con la dirección ya escrita (`enlaceDeMapa`, en `packages/shared`), que abre otra pestaña
(`target="_blank"`, `rel="noopener noreferrer"`, sin enviar la página de origen). No se manda nada desde
nuestro servidor, no hay librería de mapas ni coordenadas guardadas, y el texto va codificado: una dirección
con `&` o `#` no puede alterar el enlace. No se muestra el mapa dentro de la aplicación.

### Widgets

Salen de `GET /api/contactos/widgets` (la API devuelve datos y la web los escribe, como en
Finanzas) y se ven en dos carruseles de la columna lateral de `/contactos` (texto arriba,
gráficos abajo; ver "Widgets de Finanzas", Categorías). La pantalla de inicio tiene además un resumen de
Contactos con lo más importante (ver "Pantalla de inicio"). Los avisos
van primero:

Solo lo que sirve en el día a día; lo demás (etiquetas, rubros, favoritos, el historial) ya está en
sus pestañas (ver `docs/decisiones.md`, 2026-11-04):

- **Avisos**: *Todavía sin contactos* (sin ninguno), *Recordatorio(s) de hoy* (con los
  títulos y los contactos), *Próximo vencimiento* / *Deuda vencida* (la deuda con un contacto que
  vence antes, si vence en 7 días o menos o ya venció) y *Sin forma de comunicarse* (contactos sin
  teléfono ni correo).
- **Texto**: *Próximo cumpleaños* (el más cercano entre las fechas de nacimiento), *Próximo
  recordatorio* (el primero de mañana en adelante: los de hoy ya tienen su aviso), *Resumen de la
  semana pasada* (lo que cayó en los últimos 7 días, del historial: título, contacto y "Ayer" o "Hace N
  días", el más reciente primero, hasta ocho; sin cifra), *Les debés* (lo pendiente por moneda, sin
  mezclarlas, con los tres contactos de montos más altos) y *Próximo vencimiento* cuando falta más de
  una semana. Las deudas cuentan solo las que son con contactos, no las de un nombre escrito a mano.
- **Gráficos**: *Cumpleaños por mes* (barras de enero a diciembre con el número del mes debajo de
  cada una, el mes actual en el color del módulo de Contactos y el mes con más cumpleaños) y *Tus
  contactos te deben* (ranking de los que más deben, con barras que se comparan solo dentro de la
  misma moneda; el total va en el texto).

El resumen de Contactos de la pantalla de inicio sale del mismo pedido y no cambió.

### Pantalla y formularios

`/contactos` tiene tres pestañas (Contactos, Recordatorios, Etiquetas) y el botón **Agregar
contacto** siempre a mano (en Recordatorios pasa a ser **Agregar recordatorio**). El alta es un diálogo con un selector Persona / Empresa o servicio
arriba (cambiar de tipo deja el formulario limpio); al guardar se abre la **ficha** del
contacto nuevo, donde se le agregan recordatorios. En la ficha los teléfonos son enlaces
`tel:`, los correos `mailto:` y el sitio web un enlace seguro; desde ahí se marca como
favorito, se edita o se elimina (con confirmación). Marcar un favorito en el listado se ve
**al instante** (actualización optimista, se revierte con un mensaje si falla).

El **avatar** de cada contacto (las iniciales de una persona o un edificio para una empresa) se pinta
con el color de sus etiquetas: con una, el color de esa etiqueta; con varias, la **mezcla** de todos
sus colores (el promedio de cada canal, así todas pesan lo mismo); sin ninguna, el acento suave de
siempre. Las iniciales van en blanco o en negro, el que mejor se lea sobre ese fondo (siempre al
menos 4,5:1 de contraste; `mezclarColores` y `colorDeTextoSobre`, en
`packages/shared/src/contactos/colores.ts`). Se ve en el listado, en la ficha y en la pestaña **Recordatorios**
(donde cada recordatorio trae las etiquetas de su contacto, así el avatar tiene el mismo color que en
el listado); en las deudas, que no traen las etiquetas, queda el color de siempre.

El formulario valida con `esquemaContacto` de `@gestoria/shared`, el mismo que usa el
servidor, y descarta las filas de teléfono y correo en blanco antes de validar, poniendo cada
error en la fila que corresponde. Estados cubiertos: cargando (esqueletos), vacío (con el
botón para empezar), con filtro sin resultados, error y sin conexión.

### Tareas programadas

Primer uso de **pg-boss** (cola de trabajos sobre la misma base de PostgreSQL, en el esquema
`pgboss`; no hace falta Redis). Al arrancar, la API (`apps/api/src/tareas/programador.ts`)
crea la cola `limpieza-de-contactos`, la agenda **cada hora en punto** y la corre una vez al
arrancar, por si estuvo apagada. En la misma corrida se limpian las tareas (`limpiarTareas`, ver
Tareas) y el calendario (`limpiarCalendario`, ver Calendario). La tarea (`limpiarContactos`) es idempotente y hace dos cosas: pasa al histórico lo que ya ocurrió de
los recordatorios (`generarHistorialDeTodos`; un recordatorio de una sola vez que pasó se da de baja
ahí mismo) y borra en definitivo lo eliminado hace más de 30 días (contactos, recordatorios, deudas
y pagos). Las entradas del histórico no se borran solas. En los tests
(`NODE_ENV=test`) no se arranca; la tarea se prueba como función común y hay una prueba de
punta a punta del programador.

### API

Todas exigen sesión y filtran por la persona de la sesión.

| Método y ruta | Qué hace |
|---|---|
| `GET /api/contactos` | Lista con `busqueda`, `tipo`, `favoritos`, `etiquetaId`, `limit`, `offset`. Devuelve `{ contactos, total }` |
| `POST /api/contactos` | Crea (persona o empresa, según `tipo`). 201 |
| `GET /api/contactos/:id` | La ficha completa, con sus recordatorios (la próxima fecha y los días que faltan) |
| `PUT /api/contactos/:id` | Reemplaza los datos (también teléfonos, correos y etiquetas). 409 si cambia el tipo |
| `PATCH /api/contactos/:id/favorito` | Marca o desmarca |
| `DELETE /api/contactos/:id` | Borrado lógico |
| `GET/POST /api/contactos/etiquetas`, `PATCH/DELETE …/:id` | Etiquetas (con cuántos contactos usa cada una) |
| `GET /api/contactos/recordatorios` | Los vigentes, cada uno con su contacto y las etiquetas de este (una consulta para todos). Filtros: `busqueda` (título o nombre del contacto), `repeticion`, `contactoId`; `dias` limita la ventana y `limit` recorta. 400 si un parámetro no es válido |
| `GET /api/contactos/recordatorios/historial` | El histórico: una entrada por cada vez que un recordatorio cayó, la más reciente primero (antes de leer pone al día las que falten). Mismos filtros `busqueda`, `repeticion` (la del recordatorio de origen) y `contactoId`, más `limit`; devuelve `entradas` y `total` |
| `DELETE /api/contactos/recordatorios/historial/:id` | Elimina una entrada del histórico. 404 si no existe o es de otra persona |
| `DELETE /api/contactos/recordatorios/historial` | Vacía todo el histórico de la persona (no toca los recordatorios); devuelve `eliminadas` |
| `POST /api/contactos/:id/recordatorios`, `PUT/DELETE …/:recordatorioId` | Recordatorios de un contacto |
| `GET /api/contactos/widgets` | Los datos de los widgets |
| `GET /api/contactos/opciones` | Los contactos mínimos para elegir uno en otros módulos |
| `GET /api/contactos/:id/finanzas` | La plata con el contacto: movimientos y deudas |

Los errores de validación llevan el campo (`telefonos.0.numero`, `fechaNacimiento`, `fecha`,
`etiquetaIds`) para mostrarlos junto a lo que hay que corregir.

### Dónde está

- Esquema: `packages/db/src/esquema/contactos.ts` (migraciones `0014_contactos` y `0015_recordatorios_por_periodicidad`); lo de Finanzas, en `esquema/finanzas.ts` (`0016_deudas_y_contacto_en_movimientos`).
- Compartido: `packages/shared/src/contactos/` (constantes, esquemas Zod, fechas y
  recordatorios, nombres).
- API: `apps/api/src/servicios/contactos/` (`contactos`, `etiquetas`, `recordatorios`,
  `widgets`, `limpieza`), `apps/api/src/rutas/contactos.ts` y `apps/api/src/tareas/`.
- Web: `apps/web/src/app/contactos/`, `apps/web/src/componentes/contactos/` y
  `apps/web/src/lib/api-contactos.ts`.
- Tests: `*.integracion.test.ts` junto a cada servicio y ruta, `packages/shared/src/contactos/*.test.ts`
  y `apps/web/e2e/contactos.spec.ts`.

### Límites conocidos

- Los recordatorios **solo avisan dentro de la aplicación**: no hay correo ni notificación
  push hasta que exista el módulo de notificaciones.
- La búsqueda no ignora tildes ni errores de tipeo.
- No hay importación ni exportación de contactos (la exportación de datos de la cuenta está
  entre los pendientes de la hoja de ruta), ni fotos. El mapa no se muestra dentro de la aplicación.
- Las deudas son un registro aparte: no tocan los saldos de las cuentas salvo que, al registrar un
  pago, se pida generar su ingreso o gasto (en una cuenta de cualquier moneda, con conversión).
  Registrar una deuda nueva nunca genera
  movimientos (un préstamo entregado se refleja ajustando el saldo, como antes).
- La hora de un recordatorio es de reloj, sin zona horaria, y solo sirve para mostrarla y ordenar: nada avisa a esa hora (no hay notificaciones todavía).

---

## Tareas

La lista de to-do: una persona anota lo que tiene que hacer —recordatorios, actividades, tareas— y lo
va tachando. Hay dos clases de tareas:

- **De uso único.** Se agregan a mano con su día (hoy por defecto) y, si se quiere, una hora y notas.
  Al tildarlas desaparecen de la lista y no vuelven nunca más.
- **Repetitivas.** Se definen una vez y se agregan solas a la lista el día que les toca, con el mismo
  esquema que los recordatorios de contactos: **todos los días**, **todas las semanas** (uno o **varios
  días de la semana**: lunes, miércoles y viernes; sábado y domingo...), **todos los meses** (el día del mes; si el mes no lo tiene, cae el último
  día) o **todos los años** (día y mes; un 29 de febrero cae el 28 en los años comunes). La hora es
  opcional. Lo que se tilda no es la regla sino la tarea de cada día.

Cualquier tarea (de uso único o repetitiva) puede tener una **categoría** ("Casa", "Trabajo",
"Salud"...), pero es **opcional**: puede quedar sin ninguna.

Cada cuenta tiene las suyas: toda consulta filtra por la persona de la sesión, sin excepción para el
admin, y las tareas de otra persona responden 404 como si no existieran.

### La pantalla `/tareas`

Cuatro pestañas y el botón "Agregar tarea" siempre a mano.

- **Hoy.** Arriba, un avance del día ("3 de 6 hechas", con una barra y, a la derecha, el porcentaje completado con la leyenda "del día completado" debajo: "50%"; no aparece si no hay tareas). **Cuenta solo las tareas de hoy**: las atrasadas no entran (ni lo que se hizo hoy de un día anterior), así completar una vieja no infla el porcentaje ni dejar una pendiente lo baja. Una tarea de hoy que se da por fallida **sigue en el total como no hecha** ("1 hechas y 1 fallida", 50 %) y un campo para agregar una tarea
  en un paso: se escribe y se aprieta Enter (el formulario completo se abre con el botón "Agregar tarea" de arriba).
  Abajo, por secciones: **Atrasadas** (tareas de días anteriores que siguen sin resolverse, **sueltas o de
  una repetitiva**; se arrastran hasta que se completan o se marcan como fallidas; **arranca cerrada**, con
  la cantidad a la vista —"Atrasadas (3)"—, y se abre al tocar el título; **pasada una semana como
  atrasada, una tarea se marca como fallida sola**, ver más abajo), **Para hoy**, **Hechas hoy**
  (subdividida en bloques separados —**"Eran de hoy"**, **"Estaban atrasadas"** y, si las hay,
  **"Adelantadas"**—, cada uno con su subtítulo, su ícono, la cantidad y su propia tarjeta), que cuelgan de "Hechas hoy" con una línea a la izquierda. Toda tarea de un día anterior —atrasada,
  hecha hoy o fallida— dice **de qué día era**, con el día concreto: "Era para el martes, 20 de octubre" y **Fallidas hoy** (justo después de lo que falta; plegadas por defecto,
  para poder deshacer un cambio por error) y **Más adelante** (tareas de uso único con un día futuro). La casilla de completar es un **círculo con un tilde**, con la misma estética que la cruz de fallida pero en verde (al apuntarla se pinta de verde; marcada, queda llena).
  **En la pestaña Hoy**, con mouse, la casilla y la cruz de lo pendiente **no se ven ni ocupan lugar**: al apuntar a la fila
  (o al navegar con el teclado) se **despliegan hacia la derecha empujando el título**, con la misma animación que los
  botones de editar y eliminar de los recordatorios de Contactos (pero del lado izquierdo); en pantallas táctiles se
  ven siempre. **Lo ya completado o fallido muestra siempre su estado final**: la casilla marcada en verde o la **cruz activada**
  (círculo lleno de rojo con la equis); tocar cualquiera de las dos la vuelve a dejar pendiente. Por eso en **Fallidas hoy**
  no hay casilla de completar ni botón "Deshacer": la cruz activada hace de las dos cosas. En el **Historial** los
  controles se ven siempre y una fallida se dibuja igual que en Hoy (cruz activada, del mismo tamaño que la casilla de una completada). De una
  atrasada **o de una de hoy** se sale de tres maneras: tildarla (la hiciste), la **cruz que está justo a la derecha de la casilla**, dentro de su círculo, que al apuntarla se pinta de
  rojo (marcarla como fallida: ya no se va a hacer) o dejarla ahí, pendiente. Al tocar la cruz sale un **aviso breve que explica qué significa dar una tarea por fallida** —que ya no la vas a
  hacer, que sale de la lista y cuenta como no hecha, y que se puede deshacer— con el ícono en rojo y la casilla **"No volver a mostrar"** (se recuerda en este navegador, `localStorage`; cancelar no
  lo guarda). Sale igual desde Hoy y desde el historial; deshacer una fallida no lo pide. Una de hoy dada por fallida pasa a **Fallidas hoy** y se puede deshacer desde ahí; las de un día futuro no tienen la cruz (todavía no les toca). En todas las filas la casilla
  queda **centrada verticalmente** respecto de la fila entera (el título y lo que va debajo). Las secciones
  plegables (Atrasadas, Hechas hoy, Fallidas hoy) se abren y se cierran **como una sola pieza**: la altura
  se anima y el contenido aparece junto con el contenedor, sin que unas partes salten mientras otras se
  deslizan (componente `Plegable`). Dentro de cada sección,
  primero lo de todo el día y después por hora (lo importante no cambia el orden). Al tildar una tarea, el tilde se dibuja, el título se
  tacha y un instante después sale de la lista con su animación; la lista se actualiza al instante
  (si el servidor falla, vuelve a como estaba y avisa).
- **Repetitivas.** Las reglas, con cuándo caen ("Todos los lunes a las 08:00", "El día 5 de cada
  mes"), cuándo les toca la próxima vez y los botones para editarlas o eliminarlas (con confirmación).
  Están **agrupadas por periodicidad** (Diarias, Cada varios días, Semanales, Mensuales y Anuales, cada grupo con su
  cantidad y en ese orden; dentro de cada uno, primero la que toca antes) y se pueden **filtrar**: un
  selector deja un solo grupo (o "Todas") y un buscador encuentra por título o notas sin importar
  tildes ni mayúsculas. Ambos se combinan; si nada coincide, un aviso lo dice. Todo se filtra en el
  navegador, con las repetitivas que ya se cargaron (hay un máximo de 100).
- **Historial.** Los días anteriores con lo que se hizo, lo que se marcó como **fallido** y lo que sigue
  **pendiente** ("Atrasada"), el más reciente primero. **Por defecto, los 7 días anteriores a hoy**
  (hoy no cuenta). Arriba hay una **tarjeta de filtros**, que se combinan y se piden al servidor:
  **Estado** (segmentos: todos, pendientes, completadas, fallidas), **Período** (atajos "7 días", "30 días",
  "90 días" y "Todo el año", más **Desde** y **Hasta** para fechas exactas; el atajo vigente se marca), y
  **Categoría** (una, o "sin categoría") y **Periodicidad** (una sola vez, diarias, cada varios días,
  semanales, mensuales, anuales). El título lleva un contador de filtros puestos y el botón "Limpiar
  filtros"; una línea abajo dice qué rango se está viendo ("Del 13/10/2026 al 19/10/2026 (por defecto, los
  últimos 7 días)"); un rango al revés se avisa junto al campo; si nada coincide, lo explica. **Cada día
  lleva una barra de progreso** partida en tres tramos proporcionales —completadas (verde), pendientes
  (gris) y fallidas (rojo)—; el color no va solo: el nombre accesible dice los números ("Progreso del día: 2
  completadas, 1 pendientes, 1 fallidas") y el encabezado del día también. Si se filtra por un estado la barra
  no se muestra (todo lo que se ve es de ese estado). Al poner un filtro, el título de la tarjeta no cambia de tamaño y
  "Limpiar filtros" aparece a su lado. Se conserva
  un año y una consulta trae hasta 1000 tareas (si hay más, avisa que se acote el rango). Cada día dice
  "2 de 4 hechas, 1 fallida" (de lo que pasa los filtros). Una fallida se muestra con una **cruz roja en
  lugar de la casilla**, tachada y con la marca "Fallida", y se puede volver a dejar pendiente (botón
  "Deshacer"); una pendiente lleva su casilla y, a la derecha, la cruz para darla por fallida. Una tarea que
  se hizo pero no se tildó en su momento se puede tildar desde acá.
- **Categorías.** Se crean, renombran, recolorean y eliminan (ver más abajo). Cada una muestra
  cuántas tareas pendientes y repetitivas la usan. En el resto de las pestañas, la categoría de una
  tarea aparece como un puntito de color con su nombre (siempre en texto: el color solo no alcanza).

La pantalla tiene **widgets** en la columna lateral (dos carruseles, uno de texto y otro de gráficos,
como en Finanzas y Contactos): las tareas **atrasadas** (aviso), un aviso de que **todo está hecho** por
hoy, **cuánto falta hacer hoy** y lo que sigue, el **avance de hoy** (un anillo; igual que en la pestaña Hoy,
cuenta solo las tareas de hoy, no las atrasadas), **lo próximo** con día
futuro, la **racha** de días seguidos en que se hizo todo, **tu semana** (barras de lo hecho en los
últimos 7 días) y **tus rutinas** (las repetitivas que más se cumplieron en las últimas dos semanas).
Sin ninguna tarea, un aviso invita a escribir la primera. Se actualizan solos al tildar, agregar o
eliminar.

**Importantes.** Al agregar o editar una tarea (suelta, repetitiva o la de hoy de una repetitiva) hay una casilla
**"Marcar como importante"**. Una importante lleva el **distintivo** "★ Importante" (pastilla ámbar con estrella y
texto, nunca solo color) y una **franja de color** a la izquierda de la fila. **No cambia el orden**: las listas
siguen por día y hora, y la marca solo ayuda a reconocerla de un vistazo (reordenar "mareaba"). Una repetitiva
importante arma tareas importantes; cambiarle la marca rige desde hoy. El historial y la pestaña Repetitivas también
muestran el distintivo. Completarla o darla por fallida no le quita la marca. La API recibe `importante` (opcional: al crear,
sin el campo no lo es; al editar, sin el campo se conserva).

Lo nuevo de las tareas también tiene sus widgets (cada uno aparece solo si hay algo para mostrar):

- **Una tarea por darse por fallida** (aviso, peligro): atrasadas que llevan 5 días o más sin hacerse;
  dice cuántos días faltan para que la más vieja se dé por fallida sola.
- **Tareas fallidas** (texto, peligro): las que se dieron por fallidas (a mano o solas) en las últimas dos
  semanas, con las tres más recientes.
- **Lo que hiciste hoy** (ranking): lo hecho hoy según de qué día era —*Eran de hoy*, *Estaban
  atrasadas* y *Adelantadas*—, las mismas tres secciones de "Hechas hoy".
- **Tus repetitivas** (ranking): cuántas repetitivas vigentes hay por periodicidad (incluye *Cada varios
  días*) y cuántas se dan por fallidas solas si pasa el día.
- **Cada varios días** (texto): las repetitivas de ese tipo que le tocan antes y cuándo.

Con las **categorías** hay widgets que miran las tareas por categoría (no aparecen mientras ninguna tarea
tenga categoría):

- **Pendientes por categoría** (ranking): lo que falta hacer —atrasado, de hoy o para más adelante—,
  hasta cinco categorías, con una barra del color de cada una y "Sin categoría" para el resto.
- **Lo que más se atrasa** (texto, advertencia): la categoría con más tareas atrasadas, con el desglose
  de las demás. No sale si las atrasadas no tienen categoría.
- **Dónde hiciste más** (ranking): tareas hechas por categoría en los últimos 30 días.
- **Cumplimiento por categoría** (ranking): hechas contra las que tocaban en las últimas dos semanas
  (sin contar hoy, que no terminó), solo para categorías con al menos 3 tareas.
- **Tareas sin categoría** (texto, info): si la persona tiene categorías y le quedan 3 o más tareas
  pendientes sin una, lo sugiere.

El formulario es uno solo (`FormularioDeTarea`): "¿Qué hay que hacer?", "Se repite" (no se repite,
todos los días, cada varios días, semanas, meses o años) y lo que pide cada opción (el día, los días de la semana, el día
del mes, el día y el mes), la hora y las notas. La validación es la del servidor (los mismos esquemas
Zod). Editar una tarea que salió de una repetitiva cambia solo la de ese día; para cambiar todas se
edita la repetitiva.

### Tareas "cada varios días"

Una periodicidad más para las tareas repetitivas (los recordatorios de Contactos no la tienen): **"Cada
tantos días"**, para lo que se hace día por medio, cada 3 días, cada 10…

- Al elegirla, el formulario pide **"Cada cuántos días"** (un entero de **2 a 365**; 2 es día por medio y
  viene por defecto; para todos los días está "Todos los días"), **"Empieza el día"** (hoy por defecto) y,
  opcional, la **hora**. Como las demás, puede darse por fallida sola.
- El ciclo se cuenta **desde el día de inicio**: cae en el inicio y después cada N días (cada 3 días desde
  el 20: el 20, 23, 26…). Antes del inicio no aparece. El inicio **no puede ser un día que ya pasó** (la API
  responde 400 con el mensaje junto al campo "Empieza el día"); al editar, el inicio que la regla ya tenía se
  conserva aunque sea viejo, que es el que ancla el ciclo.
- Se guarda en `tareas_repetitivas` como `cada_dias` y `fecha_inicio` (migración
  `0028_tareas_cada_tantos_dias`, con `check`s que exigen estos campos solo para este tipo). Las tareas se
  arman al leer como las demás, solo los días que le tocan; si la persona no entra por días, los que tocaban
  quedan atrasadas.
- Se dice en palabras: "Día por medio", "Cada 5 días a las 09:30". En la lista de Repetitivas forma su propio
  grupo, **"Cada varios días"**, entre las diarias y las semanales, y el filtro por periodicidad lo incluye.
- En el **calendario** aparece en los días que le tocan (también los futuros) y el filtro avanzado de
  repetición de **Tareas** suma **"Cada varios días"** (el de Contactos no).

### Tareas semanales de varios días

En "Todas las semanas" el formulario muestra siete botones (Lun a Dom) que se marcan y desmarcan; viene
marcado el día de hoy y hace falta al menos uno ("Elegí al menos un día de la semana."). Es una sola
tarea repetitiva que cae en cada uno de sus días, no varias copias. En la pestaña Repetitivas se lee
"Todos los lunes, miércoles y viernes", "Todos los sábados y domingos" o, con los siete, "Todos los
días"; la próxima vez es la del día marcado que viene antes. Se maneja con teclado (Tab para recorrer
los días, espacio para marcar) y cada botón tiene su casilla real debajo, con el nombre completo para
los lectores de pantalla. Cambiar los días rige desde hoy, como el resto de la regla. La lógica de
cuándo cae está en `packages/shared/src/tareas/cuando-cae.ts`; los recordatorios de contactos siguen
con un solo día de la semana.

### Categorías

- **Opcionales.** El formulario de tarea tiene un selector "Categoría (opcional)" con "Sin categoría" y
  las categorías de la persona; se elige al agregar y se cambia o se quita al editar. Si la persona no
  tiene ninguna categoría, el selector no se muestra. Una repetitiva guarda la categoría y se la pasa a
  cada tarea que arma; al cambiarla rige desde hoy, como el resto de la regla.
- **Por defecto.** Cada persona arranca con **Personal, Casa, Trabajo, Estudio, Salud, Compras y
  Trámites**, con colores bien distintos entre sí. Son suyas como cualquier otra: puede renombrarlas,
  cambiarles el color o eliminarlas. Se crean la primera vez que se miran sus categorías (también para
  las cuentas que ya existían) y una marca en el usuario (`categoriasDeTareasInicialesCreadas`) evita
  que vuelvan después de eliminarlas; quien ya tenía categorías propias no recibe las de por defecto.
- **Crear y editar.** Nombre de hasta 30 caracteres, único entre las de la persona sin distinguir
  mayúsculas, y un color (si no se elige, se propone el más distinto de los que ya hay). Hasta 30
  categorías por persona.
- **Eliminar.** Solo si ninguna **tarea pendiente** ni **tarea repetitiva** la usa; si no, el diálogo
  explica cuántas la retienen ("2 tareas pendientes y 1 repetitiva") y el servidor responde 409. Las
  tareas que ya se hicieron (y las eliminadas) no la retienen: pasan a "sin categoría", para que una
  rutina diaria no deje atada una categoría durante todo un año de historial. Se borra en duro (es
  configuración, no datos con historia).

### Cómo funciona

- **Dos tablas** (`packages/db/src/esquema/tareas.ts`, migración `0021_tareas`): `tareas_repetitivas`
  (la regla: cuándo cae, la hora, desde qué día rige y hasta qué día ya se armaron sus tareas) y
  `tareas` (lo que aparece en la lista y se tilda: su día, título, hora, notas y si se completó). Las
  de uso único son filas de `tareas` sin repetitiva; las que arma una repetitiva llevan su id. Una
  restricción única (`repetitiva_id`, `dia`) garantiza que una regla arma como mucho una tarea por día.
- **Las tareas de una repetitiva se arman al leer**, hasta hoy y nunca de días futuros
  (`generarTareasRepetitivas`): al abrir la lista (o el historial) se arman las de los días que faltan.
  No hay nada que mantener al día ni un job que tenga que correr para que la lista esté completa. Si la
  persona estuvo días sin entrar, al volver se arman los días que faltaron (hasta 31 hacia atrás), que
  quedan como atrasadas hasta resolverlas. Armar dos veces el mismo día no duplica nada, ni con pedidos a la
  vez.
- **Cada tarea es un registro propio**: se copia el título, así el historial es fiel aunque después se
  cambie o se elimine la regla. Cambiar la repetitiva rige desde hoy (descarta lo pendiente de hoy en
  adelante y lo vuelve a armar con la regla nueva); lo hecho y los días pasados no se tocan. Eliminarla
  saca lo pendiente de hoy y deja el historial.
- **"Hoy" es el de la zona horaria de la persona** (la de su cuenta), también para decidir qué se
  hizo "hoy".
- **Una tarea tiene tres estados: pendiente, completada o fallida.** Fallida (columna `fallada_en`,
  nunca a la vez con `completada_en`) es una atrasada que la persona decidió que ya no va a hacer. **Solo
  una tarea de un día anterior a hoy puede fallar** (la API responde 409 con la de hoy o las futuras, que
  todavía están a tiempo). Se puede deshacer en cualquier momento (vuelve a ser atrasada), y tildar una
  fallida la pasa a completada. Una fallida cuenta como no hecha para la racha, los rankings y el avance
  del día (no lo sube), pero ya no figura como atrasada ni como pendiente.
- **Fallar sola.** Al crear o editar una tarea repetitiva hay un checkbox, **desmarcado por defecto**, "Darla
  por fallida automáticamente si pasa el día". Con él, las tareas que arma esa repetitiva se dan por fallidas
  solas cuando pasa su día sin completarse (en vez de quedar atrasadas). Detalles: cada tarea armada **copia**
  la opción de su regla (`falla_sola` en `tareas` y en `tareas_repetitivas`), así cambiar la regla rige desde
  hoy como todo lo demás; se resuelve **al leer** (junto con armar las tareas que faltan), sin job; la tarea
  figura como fallida **al final de su propio día**, así que no aparece en "Fallidas hoy" ni cuenta contra el
  avance de hoy y en el historial queda en el día que le tocaba; si la persona la deshace (o destilda una
  completada), la opción se apaga **para esa tarea** y no vuelve a fallar sola. La lista de Repetitivas dice
  "Se da por fallida si pasa el día". Una tarea de uso único no tiene esta opción.
- **Una semana como atrasada y se da por fallida sola.** Toda tarea pendiente (suelta o de una repetitiva)
  que lleva **más de una semana atrasada** se marca como fallida sin que la persona haga nada (la semana se
  cuenta desde el día siguiente al suyo: una del día 13 sigue atrasada el 20 y falla el 21). Se resuelve al
  leer, junto con lo de "fallar sola" (columna `reactivada_en`, migración `0029_tareas_reactivada`); queda
  fallida **al final del día en que se cumplió el plazo**, así no aparece en "Fallidas hoy" ni cuenta en el
  avance de hoy y en el historial queda en el día que le tocaba. Si la persona la devuelve a pendiente
  ("Deshacer", o destilda una completada vieja), **se reinicia la semana** desde ese momento: no vuelve a
  fallar enseguida. El aviso de la sección Atrasadas lo dice.
- **Las atrasadas se arrastran sean sueltas o de una repetitiva**: la vitamina de ayer que no se tomó
  aparece como atrasada junto a la de hoy, hasta que se complete o se marque como fallida. (Antes, las de
  repetitiva no se arrastraban y quedaban solo en el historial; ver `docs/decisiones.md`.) Si la persona
  no entra por días, se acumulan hasta 31 de una rutina diaria.
- Una tarea de uso único no puede ponerse en un día que ya pasó (sí en hoy); una atrasada conserva su
  día al editarla.
- Las categorías están en `categorias_de_tareas` (migración `0022_categorias_de_tareas`); `tareas` y
  `tareas_repetitivas` tienen `categoria_id` (en nulo si no tienen), con `on delete set null`.
- Los días de una semanal se guardan en `tareas_repetitivas.dias_semana` (`smallint[]`, de 1 a 7, sin
  repetir; migraciones `0023` y `0024`, que copian el día que ya tenían las existentes y después quitan
  `dia_semana`). Las demás repeticiones lo dejan en nulo.
- Borrado lógico (`eliminado_en`) en tareas y repetitivas. Topes contra errores de carga: hasta 500
  tareas de uso único pendientes y 100 repetitivas por persona; título de hasta 120 caracteres y notas
  de hasta 500.
- **Limpieza**: el mismo job de pg-boss de contactos (`limpiarTareas`, cada hora) borra en definitivo
  lo eliminado hace más de 30 días y el historial de más de un año —lo completado, lo fallido y lo de
  repetitivas— (nunca una tarea de uso único que sigue pendiente).

### API

Todas exigen sesión y filtran por la persona de la sesión.

| Método y ruta | Qué hace |
|---|---|
| `GET /api/tareas` | La lista de hoy: `{ hoy, atrasadas, deHoy, hechasHoy, falladasHoy, masAdelante }` (arma antes las repetitivas que falten) |
| `POST /api/tareas` | Crea una tarea de uso único. 201. 400 si el día ya pasó; 409 con demasiadas pendientes |
| `PUT /api/tareas/:id` | Edita título, notas, categoría, hora y (si es de uso único) el día |
| `PATCH /api/tareas/:id/completada` | Tilda o destilda (`{ completada }`); sirve también para días anteriores. Tildar una fallida la pasa a completada |
| `PATCH /api/tareas/:id/fallida` | Marca como fallida una atrasada o una de hoy, o la vuelve a dejar pendiente (`{ fallida }`). Con una de un día futuro responde 409 |
| `DELETE /api/tareas/:id` | Borrado lógico |
| `GET /api/tareas/widgets` | Los datos de los widgets: lo de hoy, atrasadas, lo próximo, los últimos 7 días, la racha, las rutinas, `fallidas`, `porFallar`, `hechasHoyPorOrigen`, `periodicidades`, `fallanSolas`, `cadaVariosDias` y, en `categorias`, las tareas por categoría (pendientes, atrasadas, hechas del mes y cumplimiento) |
| `GET /api/tareas/historial` | Días anteriores con sus tareas (hechas, fallidas y pendientes) y `hechas` / `falladas` por día, `{ desde, hasta, dias, hayMas }`. Filtros opcionales por query (los que vienen en blanco no cuentan): `desde`, `hasta` (por defecto, los 7 días anteriores a hoy; se recortan a ayer y a un año atrás), `estado` (`pendiente`, `completada`, `fallida`), `categoriaId` (un número o `sin`) y `repeticion` (`unica`, `diaria`, `intervalo`, `semanal`, `mensual`, `anual`). Un filtro inválido responde 400 |
| `GET/POST /api/tareas/repetitivas`, `PUT/DELETE …/:id` | Las tareas repetitivas (`repeticion`: `diaria`, `intervalo`, `semanal`, `mensual` o `anual`; `intervalo` lleva `cadaDias` y `fechaInicio`), con su próxima vez y `fallaSola` (opcional al crear: sin indicarla es `false`; al editar, si no viene se conserva) |
| `GET/POST /api/tareas/categorias`, `PATCH/DELETE …/:id` | Las categorías (con cuántas tareas pendientes y repetitivas usa cada una). 409 si el nombre ya existe, si se llegó al máximo o si se elimina una que tiene tareas |

Una repetitiva semanal lleva `diasSemana` (arreglo de 1 a 7, al menos uno y sin repetir; el campo
viejo `diaSemana` ya no existe) y la respuesta lo devuelve ordenado.

`categoriaId` (número o `null`) viaja en el cuerpo de crear y editar una tarea o una repetitiva; si no
viene al editar, se conserva la que tenía. Una categoría que no existe o es de otra persona responde 400
con el error en el campo `categoriaId`.

Los errores de validación llevan el campo (`titulo`, `fecha`, `hora`, `diaDelMes`…) para mostrarlos
junto a lo que hay que corregir.

### Dónde está

- Esquema: `packages/db/src/esquema/tareas.ts`.
- Compartido: `packages/shared/src/tareas/` (constantes y esquemas Zod); `caeEnElDia` en
  `contactos/fechas.ts`.
- API: `apps/api/src/servicios/tareas/` (`tareas`, `repetitivas`, `categorias`, `widgets`,
  `limpieza`),
  `apps/api/src/rutas/tareas.ts`; la siembra, en `apps/api/src/scripts/sembrar-tareas.ts`.
- Web: `apps/web/src/app/tareas/`, `apps/web/src/componentes/tareas/` (los widgets, en `widgets/`) y
  `apps/web/src/lib/api-tareas.ts`.
- Tests: `*.integracion.test.ts` de servicios y rutas, `packages/shared/src/tareas/esquemas.test.ts` y
  `apps/web/e2e/tareas.spec.ts`.

### Límites conocidos

- Las tareas **no avisan** (ni correo ni notificación): la hora solo sirve para mostrarla y ordenar.
  Eso queda para el módulo de notificaciones.
- No hay prioridades, subtareas ni fechas límite aparte del día de la tarea. Las categorías todavía no
  sirven para filtrar la lista.
- Una tarea repetitiva no se puede convertir en una de uso único (ni al revés): se crea otra.
- Los widgets de tareas están solo en la columna lateral de su pantalla; la de inicio tiene un resumen de
  Tareas con lo más importante (ver "Pantalla de inicio").
- La lista de hoy no mira a futuro para las repetitivas ("Más adelante" solo muestra las de uso
  único): lo que viene de una regla se ve en la pestaña Repetitivas con su próxima fecha.

---

## Calendario

Un calendario para recorrer con comodidad que **junta en cada día lo que hay que tener presente**, venga
del módulo que venga, y en el que además se pueden **anotar eventos a mano**. Muestra:

- **Finanzas:** el día en que vence cada **deuda pendiente** que tiene fecha límite.
- **Contactos:** los **recordatorios** de los contactos, en cada día que caen (también los que se repiten).
- **Tareas:** las **tareas**, en el día que les toca. Las ya completadas se ocultan por defecto (ver
  "Eventos completados" más abajo).
- **Calendario:** los eventos que la persona agrega en el propio calendario.

Cada evento dice de dónde viene, con un texto y un ícono (nunca solo color), y se ordena por hora. Ver
"Los eventos", más abajo.

### La pantalla `/calendario`

No tiene widgets, así que, como la pantalla de inicio, usa el lugar del medio y el de la derecha: el
calendario ocupa todo el ancho disponible y **se estira con el alto de la ventana, hasta un máximo de 40 rem** (las filas del
mes y los meses del año crecen para llenarlo; el panel del día mide 30 rem), de modo que en una pantalla normal no hace falta la barra
de desplazamiento. En una ventana baja se esconde el subtítulo para dejarle más lugar, y por debajo de un
alto mínimo la pantalla se desplaza. A partir de 1280 px de ancho el panel del día queda a la derecha;
en pantallas más angostas pasa debajo.

- **Mes.** Una grilla de seis semanas, de lunes a domingo, con una división muy sutil entre casillas (sin
  columna de número de semana), los días de los meses vecinos en un gris más apagado y sobre un fondo grisáceo (así no se confunden con los del mes), el día de hoy con un aro y el día elegido en una pastilla que se
  desliza de un día al otro. Siempre mide lo mismo (seis filas), así no salta de alto al navegar. Los días
  que tienen eventos llevan abajo **un punto del color de cada origen que tenga algo ese día** (naranja
  Calendario, azul Finanzas, violeta Contactos, rosa Tareas), **sin importar cuántos eventos sean**: un día
  con diez tareas tiene un solo punto rosa, así nunca se llena de puntos (como mucho hay cuatro). Si el día
  tiene varios eventos, el **total** aparece en la esquina. No hay una leyenda escrita de las marcas: los
  botones de origen ya dicen qué color es cada uno, y el nombre accesible de cada día lo dice en palabras.
  El nombre accesible de la casilla lo dice con palabras ("jueves, 22 de octubre de 2026, hoy, 5 eventos:
  Calendario, Finanzas, Contactos, Tareas").
- **Filtro por origen.** Sobre la grilla hay cuatro botones —Calendario, Finanzas, Contactos y Tareas—
  que se prenden y se apagan: sirven a la vez de leyenda de los colores y para dejar de ver lo que no
  interesa (por ejemplo, las tareas). Apagado, un botón se ve tachado y con un círculo vacío. El filtro
  vale para los puntos y el total del mes y para la lista del día, se aplica al instante (sin volver a pedir nada) y
  **se guarda en la cuenta** (ver "Dónde se guarda el filtro"). Si un día tiene eventos ocultos, el panel lo dice ("2 eventos ocultos
  por el filtro"), así "no hay nada" no se confunde con "lo ocultaste". Si se agrega un evento propio con
  "Calendario" apagado, vuelve a prenderse solo (si no, parecería que no se guardó).
- **Eventos completados.** Lo ya completado **no se muestra por defecto**: el calendario sirve para ver
  lo que falta, y un mes lleno de cosas hechas lo taparía. Están cerrados (1) una **tarea ya tildada**
  (de hoy o de un día pasado, suelta o armada por una repetitiva), (2) una **tarea marcada como fallida**
  (una atrasada que se dio por perdida) y (3) un **recordatorio de Contactos
  cuyo día ya pasó** (un recordatorio no se tilda: se considera completado cuando pasó su fecha; el de hoy
  todavía no, y uno diario está completado en cada día anterior a hoy). En **"Más filtros"**, cada categoría
  tiene su fila **"Estado"**, con sus propios botones: **Tareas** tiene **Pendientes, Atrasadas y Finalizadas**;
  **Contactos**, **Próximos y Pasados**; **Finanzas**, **Pendientes, Atrasadas y Pagadas**; y **Calendario**
  (los eventos propios), **Futuros y Pasados** (son botones de estado, como los de origen, con las palabras en
  plural y el mismo ícono que la marca de la grilla; un estado apagado se ve tachado). Los de una categoría no
  tocan a las otras: mostrar las tareas finalizadas no trae los recordatorios pasados ni las deudas pagadas.
  **Por defecto están prendidos Pendientes y Atrasadas (de Tareas y de Finanzas), Próximos y Futuros**, así que
  lo finalizado, lo pagado y lo pasado no se ven hasta prender su botón. *Finalizadas* junta las completadas y
  las fallidas; "atrasada" es una tarea de un día anterior a hoy que no se hizo ni se dio por fallida, o una
  deuda cuya fecha límite ya pasó sin saldarse. Una deuda **pagada** es una saldada: se ve en el día de su
  fecha límite, con lo que se pagó ("Marcos te pagó $ 100,00") y la marca **"Pagada"**. Un evento propio es
  **futuro** hasta que termina su día (el de hoy todavía es futuro) y después **pasado**; al guardar uno en un
  día cuyo estado está oculto (por ejemplo, ayer), ese estado vuelve a prenderse solo. Con las
  finalizadas a la vista se distinguen de las pendientes: en la lista del día
  el título va **tachado y más apagado** y lleva la marca **"Completada"** o **"Fallida"** (con ícono, no
  solo estilo); en el mes, **el marcador de cada origen cambia con el estado**: **punto lleno** si hay algo
  pendiente; si no, un **triángulo de aviso** si hay al menos una **tarea atrasada** (de un día anterior a hoy, sin hacer
  ni fallar; también aparece con la marca "Atrasada" en la lista del día); y si todo está finalizado, **✓**
  si todo se completó, **✗** si todo falló y **–** si hubo de
  las dos. La prioridad es pendiente > atrasada > finalizada: una sola pendiente alcanza para que el día
  muestre el punto lleno. Los marcadores miden lo mismo y quedan en la misma línea; son círculos llenos del color del origen (el pendiente liso) y los cerrados llevan adentro una marca blanca —✓, ✗ o una barra— que se distingue mejor que un contorno; van sobre un anillo que los separa del fondo (también sobre el día elegido). El de **atrasada** no es un círculo sino un **triángulo de aviso** lleno del color del origen con un "!" blanco (`marca-de-atrasada.tsx`): la forma sola ya dice "ojo", aunque a 14 px el signo apenas se lea. Ocupa la misma caja que el círculo (todo el ancho), con el mismo grosor de trazo y el mismo anillo. El mismo triángulo (de Lucide, en contorno) va en el botón "Atrasadas" de "Más filtros" y en la etiqueta "Atrasada" de la lista del día. **Estas marcas son de las tareas.**
  Los **recordatorios de Contactos** solo son próximos o pasados: el próximo es el **círculo lleno** y el pasado
  el **círculo vacío** (solo el borde, del color del origen); si el día tiene uno próximo, manda el lleno. En
  la lista del día un recordatorio pasado lleva la marca "Pasado" (no "Completada"), y el nombre accesible de
  la casilla dice cuántos son pasados. Los **eventos propios** se marcan igual: futuro lleno, pasado vacío.
  Las **deudas de Finanzas** usan las marcas de las tareas: lleno si está pendiente, el **triángulo de aviso** si está atrasada y
  **✓** si está pagada; en la lista del día, "Atrasada" o "Pagada".
  El nombre accesible de la casilla dice cuántos
  están completados, fallidos y atrasados. Los estados que se ocultan se guardan en la cuenta, y "Mostrar todo" no los
  cambia. El botón "Más filtros" se marca (borde de acento) cuando los estados no son los de por defecto.
- **Filtros avanzados por repetición.** El botón **"Más filtros"** abre un panel donde, para **Tareas** y
  **Contactos**, se elige qué tipos de repetición mostrar: *Una sola vez* (las tareas sueltas y los
  recordatorios que no se repiten), *Diarias*, *Semanales*, *Mensuales* y *Anuales*. Por ejemplo, se pueden
  ocultar las tareas diarias —que ocuparían todos los días— y ver las semanales, mensuales y anuales. Tareas
  y Contactos se filtran por separado. El botón avisa con un número cuántos tipos hay ocultos (aun con el
  panel cerrado, así el filtro no pasa inadvertido) y aparece **"Mostrar todo"**, que quita todas las
  restricciones (también vuelve a prender los orígenes apagados). **Cada categoría va en su propio
  recuadro** (una al lado de la otra en pantallas anchas, una debajo de la otra en las angostas), con una
  franja de su color arriba con el ícono y el nombre, y adentro los grupos *Repetición* y *Estado*
  separados por una línea. El panel no lleva textos explicativos: los nombres de los botones alcanzan.
  Si un origen está apagado entero, sus botones se ven deshabilitados y la franja dice "Está oculto:
  prendelo arriba". El filtro vale para los puntos del mes, el total y la
  lista del día (que avisa cuántos eventos quedaron ocultos), y se guarda en la cuenta. En pantallas
  anchas el panel flota sobre la grilla (no la deforma); en las angostas se despliega en el lugar. Escape lo
  cierra y devuelve el foco al botón; **tocar o hacer clic afuera** del panel también lo cierra (lo elegido
  queda), sin tener que volver a "Más filtros".
- **Dónde se guarda el filtro.** Todo el filtro (orígenes, repeticiones y estados) se guarda **en la
  cuenta**, en la tabla `filtros_del_calendario` (una fila por persona, con tres columnas JSON de lo que se
  oculta), así se mantiene igual en cualquier navegador o dispositivo hasta que la persona lo vuelva a
  cambiar. Cada cambio se aplica al instante y se manda entero a la API (`PUT /api/calendario/filtro`) en
  segundo plano, en orden; si no se puede guardar, sigue aplicado en la pantalla y debajo de "Más filtros"
  aparece "No pudimos guardar el filtro…". Al abrir el calendario se pide el de la cuenta
  (`GET /api/calendario/filtro`; `null` si nunca se guardó, y entonces se usa el de por defecto) y, hasta
  que llega, la grilla espera en vez de mostrar algo que después se oculte. Antes el filtro vivía en el
  `localStorage` del navegador: la primera vez, si la cuenta no tiene filtro y el navegador sí, se lo pasa
  a la cuenta y se lo borra del navegador (`lib/preferencias-calendario.ts` solo hace eso ahora).
- **Año.** Los doce meses como mini calendarios (entran en cascada); tocar uno lo abre. Se llega con el
  selector "Mes / Año".
- **Panel del día elegido.** El número grande, el día de la semana y el mes, cuándo cae respecto de hoy
  ("Hoy", "Mañana", "En 12 días", "Hace 3 días"), la semana ISO y el día del año, los botones de día
  anterior y siguiente, un campo "Ir a una fecha" y, abajo, los **eventos del día** con el botón
  "Agregar evento". A partir de 1280 px mide lo mismo que el calendario y, si hay muchos eventos, la lista
  se desplaza por adentro (no estira la pantalla); en una ventana baja el número del día se achica para
  dejarle más lugar. Por debajo de ese ancho va debajo del calendario y crece con lo que tenga.
- **Cómo se navega**:
  - Con el mouse o el dedo: tocar un día, los botones de mes (o de año) anterior y siguiente y, en una
    pantalla táctil, deslizar hacia los costados para cambiar de mes. El botón "Hoy" aparece solo
    cuando se está lejos de hoy.
  - Con el teclado: se entra a la grilla en una sola casilla (la del día elegido) y adentro, las
    flechas mueven un día o una semana, Inicio y Fin van al lunes y al domingo, Re Pág y Av Pág cambian
    de mes (con Mayús, de año). Moverse con el teclado cambia el día elegido y el foco lo acompaña,
    también al pasar de un mes a otro.
  - Yendo directo a una fecha desde el campo del panel.
  - Al cambiar de mes se conserva el número de día elegido; si el mes no lo tiene (el 31 en abril),
    pasa al último día.
- **Animaciones**: la grilla se desplaza hacia el lado al que se va, el título del mes sube o baja, la
  pastilla se desliza con un resorte, pasar de mes a año es un zoom y el contenido del panel se
  desliza al cambiar de día. Con la preferencia de reducir movimiento todo cambia sin desplazarse.
- **Accesibilidad**: la grilla es una tabla con encabezados de columna y de fila; cada día tiene su
  fecha completa como nombre ("miércoles, 21 de octubre de 2026, hoy"), el elegido se marca como
  presionado y el día de hoy como fecha actual; el día elegido se anuncia al cambiar.

### Los eventos

Cada evento muestra su **hora** a la izquierda ("Todo el día" si no tiene), el título, una línea de
contexto, y una insignia con su **origen** (Finanzas, Contactos, Tareas o Calendario) con su ícono y su
color; el mismo color es el del **borde izquierdo** de la fila. El color ayuda a distinguirlos de un
vistazo pero nunca va solo. El orden es el del
día: primero lo de **todo el día** y después **de la hora más temprana a la más tardía**; con la misma hora,
por origen (Finanzas, Contactos, Tareas, Calendario) y por título.

| Origen | Qué muestra | Contexto | Se cambia en |
|---|---|---|---|
| Finanzas | "Vence: *concepto*" el día de la fecha límite de una deuda **no saldada**, sin hora | "Marcos te debe $ 1.500,00" o "Le debés $ 800,00 a *nombre*" (lo que falta pagar, no el monto original) | Finanzas |
| Contactos | El título del recordatorio, con su hora, en cada día que cae (única, diaria, semanal, mensual, anual) | El nombre del contacto | Contactos |
| Tareas | Las tareas, con su hora y en su día; las tildadas vienen marcadas `completado` y las eliminadas no aparecen | La categoría y "Se repite" | Tareas |
| Calendario | Lo que la persona agrega acá: título, día, hora opcional y notas | Las notas | El propio calendario |

- Los eventos de **otros módulos no se editan acá**: llevan un enlace ("Ver en Tareas: …") al módulo de
  origen. Los **manuales** se editan y se eliminan desde la lista (con confirmación al eliminar).
- **Agregar un evento**: botón "Agregar evento" del panel. El día que está elegido ya viene puesto; se pide
  el título, el día y, si se quiere, la hora y notas. Sin hora, es de todo el día. Los errores se explican
  junto a cada campo.
- **Las tareas repetitivas** se muestran también en los días que vienen (aunque todavía no existan como
  tarea, que se arma recién el día que llega), pero nunca antes del día en que se crearon. Una tarea
  atrasada, sea suelta o de una repetitiva, se queda en el día en que había que hacerla (y además está en
  "Atrasadas" de Tareas). Regla: lo pendiente que ve el calendario es lo mismo que ve la lista de Tareas;
  lo que se marcó como fallido figura como fallido y queda oculto por defecto.
- **Los recordatorios** se muestran en los días pasados también (el calendario se puede mirar hacia atrás),
  incluso los de una sola vez que ya pasaron: al pasar al histórico el evento sale de su entrada (si la persona
  la elimina o vacía el historial, ese evento deja de verse). Se ven como completados.
- No hay cumpleaños automáticos: si se quiere verlos, se crean como recordatorio anual del contacto.

### Cómo funciona

- **Los eventos se arman al leer.** Lo de otros módulos no se copia a ninguna tabla del calendario: cada
  módulo aporta los suyos a partir de sus propias tablas, así lo que se ve siempre coincide con el módulo de
  origen. Solo los eventos manuales se guardan (tabla `eventos_de_calendario`).
- La pantalla pide los eventos del **mes que se ve** (las seis semanas de la grilla, con los días de los
  meses vecinos); al cambiar de mes sigue mostrando lo anterior hasta que llega lo
  nuevo, así la grilla no parpadea. Agregar, editar o eliminar vuelve a pedirlos.
- **Todo es de días de calendario y horas de reloj de la persona** ("AAAA-MM-DD" y "HH:MM"), sin zona
  horaria: un evento "a las 15:00" es a las 15:00 de donde esté.
- **"Hoy" es el del dispositivo** y se calcula recién después de montarse la pantalla (en el servidor
  no se conoce la zona de quien mira): hasta entonces se reserva el lugar con un esqueleto del mismo
  tamaño. Se vuelve a calcular cada minuto, así a medianoche el marcador pasa solo al día nuevo.
- Las cuentas de calendario son funciones puras en `packages/shared/src/calendario/calendario.ts`
  (semanas de un mes, número de semana ISO, sumar meses, mismo día en otro mes), con tests propios.
- Rango: de 1900 a 2200. Los botones se deshabilitan al llegar a los extremos.

### API

Todas exigen sesión y filtran por la persona de la sesión (el `userId` sale siempre de la sesión; un evento
de otra persona responde 404).

| Método y ruta | Qué hace |
|---|---|
| `GET /api/calendario/eventos?desde=&hasta=` | Todos los eventos entre dos días (inclusive), de todos los módulos y ordenados. Hasta **70 días** de una vez. Devuelve `{ eventos: [{ id, origen, titulo, detalle, dia, hora, repeticion, completado }] }`; `repeticion` es `unica`, `diaria`, `semanal`, `mensual` o `anual` para Tareas (una suelta es `unica`) y Contactos, y `null` para Finanzas y los manuales; `completado` es `true` en las tareas tildadas y en los recordatorios de un día anterior a hoy (la web los oculta salvo que se pida verlos); Finanzas y los manuales traen `false` |
| `POST /api/calendario/eventos` | Agrega un evento manual (`titulo`, `notas`, `fecha`, `hora`). 201; 409 si ya tiene 2.000 |
| `PUT /api/calendario/eventos/:id` | Cambia un evento manual |
| `DELETE /api/calendario/eventos/:id` | Lo elimina (borrado lógico) |

### Reglas y límites

- Título de hasta 120 caracteres y notas de hasta 500; el día tiene que existir y estar entre 1900 y 2200;
  la hora, de 00:00 a 23:59. Un evento manual puede estar en un día pasado.
- **Hasta 2.000 eventos manuales** por persona (los eliminados no cuentan).
- Un evento manual eliminado se borra en definitivo a los 30 días (`limpiarCalendario`, en la misma corrida
  horaria que la de contactos y tareas). Los eventos que ya pasaron no se borran.

### Dónde está

- Compartido: `packages/shared/src/calendario/` (`calendario.ts` para las cuentas de fechas y `eventos.ts`
  para los tipos, el esquema del evento manual, `ocurrenciasEnRango` y el orden `compararEventos`).
- Base: `packages/db/src/esquema/calendario.ts` (migraciones `0025_eventos_de_calendario` y
  `0034_filtros_del_calendario`).
- API: `apps/api/src/rutas/calendario.ts`; `servicios/calendario/` (`eventos.ts` junta todo,
  `eventos-manuales.ts`, `filtro.ts`, `limpieza.ts`) y el aporte de cada módulo en `servicios/finanzas/calendario.ts`,
  `servicios/contactos/calendario.ts` y `servicios/tareas/calendario.ts`.
- Web: `apps/web/src/app/calendario/`, `apps/web/src/componentes/calendario/` (`calendario-completo`,
  `vista-de-mes`, `vista-de-anio`, `panel-del-dia`, `eventos-del-dia`, `formulario-de-evento`,
  `filtro-de-origenes`, `filtros-avanzados`, `usar-filtro-de-eventos`, `origenes`) y
  `apps/web/src/lib/api-calendario.ts` y `apps/web/src/lib/preferencias-calendario.ts`.
- Tests: `packages/shared/src/calendario/*.test.ts`, `apps/api/src/rutas/calendario.integracion.test.ts`,
  `apps/api/src/servicios/calendario/limpieza.integracion.test.ts` y `apps/web/e2e/calendario.spec.ts` y
  `calendario-eventos.spec.ts`.

### Límites conocidos

- Los eventos manuales son **de un solo día y no se repiten** (hay recordatorios y tareas repetitivas para
  eso) ni tienen hora de fin.
- La vista de año no marca los días con eventos (solo la de mes) y no hay vista de semana o de día.
- Desde el calendario no se tildan ni se editan las cosas de otros módulos.
- Las deudas sin fecha límite no aparecen.
- La grilla marca un punto por origen (como mucho cuatro) y el total de eventos; la lista completa está en
  el panel. No muestra "qué tan cargado" está un día más que con ese número. La vista de año no marca los días.
- El filtro es por origen, por estado y, para Tareas y Contactos, por repetición; no por palabra, por
  categoría de tarea ni por contacto. Finanzas y los eventos manuales no tienen repetición: en "Más filtros"
  solo tienen el estado.
- La repetición de una tarea ya armada es la de su regla; si la regla se borra del todo (a los 30 días de
  eliminarla) sus tareas viejas pasan a verse como "Una sola vez".
- Las semanas empiezan el lunes y no se puede cambiar.

---

## Pantalla de inicio

`/inicio` es para orientarse de un vistazo: un saludo con la fecha y un **carrusel con el resumen de cada
módulo**, en este orden: Finanzas, Calendario, Tareas y Contactos. Se ve un resumen a la vez y pasa solo al
siguiente cada **15 segundos**. La pantalla **entra entera en la ventana, sin desplazamiento vertical**.

Para no ver siempre lo mismo, **en cada visita se elige al azar** con qué pestaña arranca el carrusel y qué
**variante** muestra cada resumen (ver "Variantes"), sin repetir lo de la visita anterior: el navegador guarda
lo último que se eligió (`gestion.inicio.ultimaEleccion`). Se puede forzar con la dirección:
`/inicio?resumen=<módulo>&variante=<variante>` abre esa pestaña con esa variante. Dónde:
`lib/eleccion-del-inicio.ts`.

### El saludo

Una etiqueta **"Inicio"** (con el ícono del menú, para que quede claro en qué pantalla se está), **"Hola,
<nombre>"** en grande con la fecha de hoy debajo, y una **manito** a la izquierda. Va en la misma fila que las
pestañas del carrusel, alineado con el borde izquierdo de la tarjeta (en pantallas angostas, las pestañas bajan
a otra línea). En una ventana de menos de 701 px de alto el saludo se achica y la etiqueta se esconde, para que
la tarjeta entre sin cortarse.

**La entrada es una bienvenida en pasos**, para que la pantalla se arme en vez de aparecer de golpe:
1. La manito aparece con un resorte suave.
2. Sube la etiqueta.
3. "Hola, <nombre>" se escribe letra por letra.
4. Llega la fecha y la manito saluda.
5. Entran las pestañas y, por último, sube la tarjeta. Esto empieza con el saludo todavía en camino, así todo
   está en su lugar en menos de un segundo.

Pasarle el mouse a la manito la hace saludar de nuevo. Nada de esto bloquea la interacción. Con reducir
movimiento aparece todo quieto, de una vez.

### Cada resumen

Todos tienen la misma forma, para no tener que volver a aprender dónde está cada cosa: arriba el módulo
(ícono en su color de origen y nombre) con el enlace **"Ir a …"**; a la izquierda **una cifra destacada**,
a lo sumo **un aviso** (el más importante del módulo) y una **lista corta** de lo que viene (cuatro filas
como mucho, con "y N más"); a la derecha **un gráfico** con sus números y etiquetas escritos, que se lee sin
ejes. Pocos datos a propósito: el detalle está en cada módulo. Cada tarjeta lleva, arriba a la derecha, un
brillo suave del color del módulo, para reconocer de un vistazo en cuál se está.

Los gráficos no son todos de barras: se elige la forma que mejor cuenta cada dato (piezas en
`componentes/inicio/piezas-de-resumen.tsx`):

- **Dona** para repartos (en qué se va la plata, de dónde viene lo de la semana, lo que falta por categoría):
  el total en el centro y una leyenda con cada parte.
- **Agenda** para la semana que viene: una columna por día con un punto por cosa, del color del módulo que
  la trae (seis como mucho, después "+N"), y abajo cuántas son.
- **Casillas** para la constancia día a día: una casilla por día, todas del mismo alto (ocupan el recuadro
  entero) y más intensas cuanto más se hizo; con tilde los días cumplidos del todo, punteada si ese día no
  había nada.
- **Línea con área** para el gasto de los últimos días, con el promedio como línea punteada.
- **Barras** y **rankings** donde se comparan pocas cantidades una al lado de la otra.

| Resumen | Cifra destacada | Aviso (uno solo, el más grave) | Lista | Gráfico |
|---|---|---|---|---|
| **Finanzas** | Disponible (y lo que te deben y debés) | Cuenta en negativo › presupuesto superado › presupuesto por agotarse › moneda sin cotización › falta abrir un período / el último está cerrado | El período hasta hoy: entró, salió y lo que sobra (o falta) | Dona de en qué se fue la plata: las tres categorías principales y "Otras", con su % y el total gastado en el centro. Sin gastos todavía, lo que entró contra lo que salió |
| **Calendario** | Eventos de hoy (y cuántos más en los próximos 6 días) | — | Lo que viene: los próximos eventos de todos los módulos, con su ícono de origen, el día y la hora | Agenda de los próximos 7 días: un punto por cosa, del color de su módulo |
| **Tareas** | Hechas hoy ("3 de 5") con un anillo de avance, lo que falta y la racha | Tareas atrasadas (y cuál se da por fallida y cuándo) | Lo que falta hoy, con su hora | Hechas de las que había cada uno de los últimos 7 días |
| **Contactos** | Próximo cumpleaños (quién, cuántos cumple, cuándo); sin cumpleaños, cuántos contactos hay | Recordatorios de hoy | Próximos recordatorios, con el contacto y cuándo | Recordatorios en cada una de las próximas 4 semanas |

Esa es la variante **general** de cada uno. Las demás tienen la misma forma (cifra, aviso, lista y gráfico) y
el mismo aviso que la general:

| Resumen | Variante | Cifra destacada | Lista | Gráfico |
|---|---|---|---|---|
| **Finanzas** | `anterior` | Gasto contra el período anterior a la misma altura (±%) | Balance de los últimos períodos | Gasto acumulado día a día contra el anterior (línea punteada); sin ese dato, gasto de los últimos períodos |
| | `ritmo` | Cuánto se gasta por día en promedio | El gasto más grande, la categoría donde más y el último movimiento | Línea con área del gasto de los últimos días, con el promedio punteado |
| | `presupuestos` | "N de M en orden" (menos del 80 % usado), con lo gastado contra lo presupuestado | Lo que queda (o cuánto se pasó) de cada uno | Ranking del % usado, en verde, amarillo (80 % o más) o rojo (pasado) |
| **Tareas** | `racha` | Días seguidos al día, con el % cumplido de la semana en un anillo | Las rutinas de las últimas dos semanas, con hechas de total | Casillas de los últimos 7 días, más intensas cuanto más se cumplió (con tilde si se hizo todo) |
| | `viene` | Cuántas tareas hay con día más adelante y cuál es la próxima | Las próximas, con el día | Dona de lo que falta, por categoría (las cuatro principales y "Otras") |
| | `atender` | Cuántas están atrasadas y cuántas se dan por fallidas pronto | Las que fallaron en las últimas dos semanas | Atrasadas por categoría |
| **Contactos** | `cumpleanos` | Próximo cumpleaños | Los que siguen, con la fecha y cuántos cumplen | Cumpleaños por mes, con el actual resaltado |
| | `deudas` | Lo que te deben tus contactos (o lo que les debés) | El próximo vencimiento | Ranking de con quién hay más pendiente (verde te deben, rojo debés; las barras se comparan dentro de cada moneda) |
| | `semana` | Cuántos recordatorios cayeron en los últimos 7 días | Los que cayeron, con cuándo | Casillas de cada día, más intensas cuantos más cayeron |
| **Calendario** | `dia` | El día más cargado de la semana y cuántas cosas tiene | Lo de ese día | La semana día por día, con ese día resaltado |
| | `modulos` | Cuántas cosas hay en la semana y de dónde viene la mayoría | Lo próximo de cada origen | Dona por origen, con el color de cada módulo |

Una variante **sin datos para mostrar** (sin período anterior, sin presupuestos, sin tareas futuras, sin
cumpleaños, sin eventos…) cede su lugar a la general, que siempre tiene algo que decir.

- El de Calendario cuenta **solo lo que falta**: sin tareas hechas o fallidas ni recordatorios pasados, y sin
  aplicar el filtro guardado del calendario (eso es una forma de mirar el mes).
- Cada resumen usa **el mismo pedido y la misma clave de caché** que su módulo (`/api/finanzas/widgets`,
  `/api/calendario/eventos`, `/api/tareas/widgets`, `/api/contactos/widgets`): no hay endpoints nuevos.
  Las variantes sumaron tres datos a esos pedidos: todos los presupuestos con su % usado
  (`periodo.presupuestos.lista`), las próximas tareas con día futuro (`masAdelante.primeras`) y los
  próximos cumpleaños (`proximosCumpleanos`).
  Los cuatro se piden juntos al entrar, así pasar de uno a otro es instantáneo, y entrar después al módulo
  no vuelve a pedir nada.
- **Estados:** mientras carga, un esqueleto con la forma del resumen; si un módulo falla, su resumen lo dice
  ("No pudimos cargar el resumen de …") y los demás siguen; sin datos, cada uno dice algo útil (abrir el
  primer período, agregar el primer contacto, "No tenés tareas pendientes", etc.) y no muestra un gráfico vacío.

### El carrusel

- Arriba, **una pestaña por módulo** (ícono y nombre): dicen cuántos resúmenes hay y en cuál se está, y llevan
  directo a cualquiera. Mientras avanza solo, la pestaña activa se va llenando con una **barra fina** del color
  del módulo, así se ve cuándo va a cambiar. En pantallas angostas solo la activa muestra el nombre (las demás,
  el ícono; el nombre accesible está siempre).
- **Flechas** a los costados para el anterior y el siguiente (dan la vuelta), y en pantallas táctiles se
  **desliza** con el dedo.
- **Se detiene:** con el botón **Pausar** (queda quieto hasta tocar "Reanudar"), mientras el mouse está encima,
  mientras el foco del teclado está adentro y con la pestaña del navegador oculta. Con **reducir movimiento** no
  pasa solo (ni ofrece pausarlo) y los cambios no se deslizan. Cualquier cambio a mano vuelve a contar el
  tiempo desde cero.
- **Accesibilidad:** patrón de carrusel con pestañas de la WAI-ARIA (`tablist`/`tab`/`tabpanel`, una sola parada
  de tabulación, flechas, Inicio y Fin); mientras avanza solo los cambios no se anuncian y, detenido, sí. Cada
  gráfico es decorativo para un lector de pantalla y tiene su descripción en palabras.

### Sin desplazamiento vertical

La página marca su grilla con `data-pantalla-fija` (`EstructuraDeApp pantallaFija`): el marco de la aplicación
(barra, contenido y pie) mide entonces el alto de la ventana. El saludo y el carrusel ocupan **todo el ancho
disponible** (hasta 80 rem) y se **centran en el alto**: la tarjeta tiene un alto propio (32 rem; 36 rem en
ventanas de 1000 px de alto o más) en vez de estirarse hasta llenar la ventana, que dejaba los gráficos
altísimos y huecos en blanco adentro. Si la ventana no da, la tarjeta se achica.

Para que entre en pantallas chicas: en las angostas se omite la lista (queda la cifra, el aviso y el gráfico)
y en las bajas se esconde la frase al pie del gráfico, y el gráfico se achica. En una
ventana de menos de 560 px de alto no hay lugar para todo sin cortar algo: ahí la página vuelve a desplazarse
como cualquier otra (un resumen cortado es peor que un desplazamiento).

### Dónde está

- Web: `apps/web/src/app/inicio/page.tsx` y `apps/web/src/componentes/inicio/` (`panel-de-inicio` arma el
  carrusel y hace los pedidos, `saludo-de-inicio`, `carrusel-de-inicio`, `piezas-de-resumen` con las piezas comunes y el gráfico de
  barras con etiquetas, y un `resumen-de-…` por módulo). El alto fijo, en `.marco-de-la-app` de `globals.css` y
  `EstructuraDeApp`.
- Tests: `apps/web/e2e/inicio.spec.ts` (que entra entera en siete tamaños de ventana —de 360x640 a 1920x1080— sin
  cortarse, avance automático, pausa por botón, mouse, teclado y reducir movimiento, pestañas, flechas, teclado
  y deslizar, lo que dice cada resumen con datos y vacío, un módulo que falla, y axe en los cuatro resúmenes en
  modo claro y oscuro).

### Límites conocidos

- El orden de los resúmenes es fijo, y no se puede elegir cuáles ver ni cambiar el tiempo de cada uno.
- La pausa no se recuerda: al volver a entrar, el carrusel avanza solo otra vez.
- El resumen del Calendario mira siete días; para más, está el calendario.

---

## Sistema visual

Todos los colores, tamaños, radios y duraciones salen de `packages/ui-tokens`. Ningún
componente escribe un valor suelto.

- **Colores:** base neutra (zinc) y un único acento azul petróleo, reservado para la
  acción principal de cada pantalla, lo seleccionado, los enlaces y el foco. Aparte, cuatro
  **colores de origen** (naranja, azul, violeta y rosa, con su fondo suave y su texto) para
  distinguir de qué módulo viene algo mezclado con lo de otros (los eventos del calendario);
  siempre con ícono y nombre, y con el contraste verificado en los dos temas.
- **Marca:** la aplicación se llama gestorIA. Hay dos versiones del logotipo, una con el
  nombre y otra con solo el símbolo, más un favicon propio.
- **Modo claro y oscuro** desde el inicio, con un selector de dos posiciones en la barra
  superior. Mientras la persona no elija, la interfaz sigue la preferencia del sistema y
  cambia sola si el sistema cambia; una vez que elige, esa elección manda y se guarda en
  su navegador. Un script inline aplica el tema antes del primer pintado, para que no
  haya un destello blanco al entrar en oscuro.
- **Color de acento elegido por la persona:** al lado del selector de tema, con sesión, un
  botón "Color de la app" abre un diálogo con el tono del modo que se está viendo (el del
  otro modo se elige estando en ese modo), su código y "Restablecer" para volver al original;
  el resultado se ve directo en la app, sin vista previa aparte. El acento son cuatro tonos (`acento`, `acento-texto`, `acento-suave`,
  `acento-suave-texto`): `derivarAcento` (`packages/ui-tokens/src/acento-personalizado.ts`)
  los arma a partir del color elegido trabajando en OKLCH. El acento es el color tal cual si
  el texto encima y los enlaces sobre la superficie llegan a 4,5:1; si no, se le cambia solo
  la luminosidad, lo justo para llegar, sin tocar el tono. El fondo suave y su texto usan el
  tono del color con luminosidades fijas. El fondo animado gira al tono elegido (con la
  misma relación entre claro y oscuro que el original) y el brillo de bordes lo relee.
  Los colores se guardan en la cuenta (`PUT /api/yo/colores`, null es el de la app) y en una
  copia del navegador con los tonos ya derivados, que un script inline aplica antes del
  primer pintado; al salir se borra. Cambiar el color se ve al instante y se guarda un rato
  después de soltar el selector.
- **Fondo animado ajustable**, en el mismo diálogo, debajo del tono y también por modo:
  *Intensidad* (0 a 100 %; el 100 % es la opacidad más alta con la que el texto secundario
  sigue en 4,5:1 con cualquiera de los 360 tonos, y el 0 apaga el fondo y deja de dibujarlo),
  *Velocidad* (de quieto a 3×; multiplica el paso del tiempo, así cambiarla no hace saltar el
  fondo), *Tamaño de las manchas* (50 a 150 %) y *Tono secundario* (opcional: las manchas van
  y vienen entre el tono principal y este, por el camino corto del círculo de color), con
  "Restablecer" para volver al de siempre. Se guarda en la cuenta (`PUT /api/yo/fondo`, como
  texto JSON validado; null es el de la app). Los cambios se aplican en vivo sin reiniciar la
  animación. La intensidad también va en la copia del navegador, para que no haya destello.
- **Fondo animado:** quince formas de color difuminadas que se mueven, giran y cambian de
  tamaño y de color muy despacio detrás de todo el contenido, cubriendo siempre la
  ventana. El difuminado sale de dibujar un canvas a 1/24 del tamaño de la ventana y
  dejar que el navegador lo agrande, no de `filter: blur()`, que costaría muchísimo más:
  medido, son 0,08 ms por cuadro. Como máximo 30 cuadros por segundo, en pausa con la
  pestaña oculta y con un solo cuadro fijo si el sistema pide reducir movimiento. Más
  intenso en el tema oscuro, donde el lavado del claro no se percibiría. Decorativo: sin
  eventos de puntero, oculto a los lectores de pantalla y fuera del orden de tabulación.
- **Brillo de bordes:** en las tarjetas y paneles que agrupan contenido, el borde se
  ilumina según la cercanía del mouse, incluso desde afuera del contenedor. Está hecho con
  una capa SVG de dos rectángulos (una línea fina y un halo difuminado) cuyo trazo pinta un
  gradiente radial centrado en el puntero. Solo con mouse: en una pantalla táctil el efecto
  no existe y no se engancha ninguna escucha.
- **Elevación:** tres niveles con significado propio (apoyado, levantado, flotante), con
  sombras más marcadas en el modo oscuro, donde una sombra suave no se vería.
- **Tipografía:** Geist, servida desde nuestro dominio.
- **Animaciones:** tres duraciones con un para qué cada una (150 ms para la respuesta al
  mouse, 240 ms para cambios de estado, 380 ms para transiciones compuestas), curva de
  desaceleración y resortes para lo que responde a un clic directo. Todo lo que se puede
  tocar reacciona al hover, al presionado y al foco: sube o baja un nivel de elevación,
  los botones se levantan 2 px al pasar el mouse y todo se achica al 97 % al presionarlo.
  Las entradas de varios elementos van en cascada. Todo respeta la preferencia de reducir
  movimiento del sistema, que deja la respuesta pero le saca el desplazamiento.
- **Componentes con animación propia:** casillas cuyo tilde se dibuja y que tachan el
  texto de una tarea, interruptores con perilla deslizante, listas que entran en cascada y
  salen más rápido de lo que entran, y valores que pulsan al cambiar. Todos están en la
  guía de estilo aunque todavía no haya módulos que los usen.

Los tokens existen en dos formatos (TypeScript para el móvil, CSS para la web) y hay un
test que falla si se desincronizan.

**Guía de estilo interna** en `/guia-de-estilo`, solo accesible en desarrollo: muestra
tokens, tipografía, botones, campos, avisos, estados de carga y vacío, animaciones,
microinteracciones, casillas, interruptores, listas, brillo de bordes, fondo animado y
espaciado. Sirve para revisar contraste y consistencia en los dos temas de una sola
mirada. Todo componente nuevo se agrega ahí.

El selector de segmentos (pestañas con un fondo que se desliza) y el diálogo de
confirmación son primitivas aparte: el segundo va sobre el `<dialog>` nativo —foco
atrapado y cierre con Escape sin escribirlos a mano— en vez de una librería nueva. El
selector tiene dos modos con semántica de accesibilidad distinta: `"pestanas"` (por
defecto) cuando cada opción muestra un panel propio, y `"filtro"` cuando solo angosta
una lista que sigue siendo la misma —ahí usa `role="radiogroup"`, no pestañas, porque no
hay ningún panel al que un `aria-controls` pueda apuntar.

El título del diálogo usa un id generado con `useId()`, no uno fijo: una pantalla puede
tener más de un `Dialogo` montado a la vez (por ejemplo, "Agregar movimiento" junto con
el de "Editar" o "Eliminar" de una lista), y con un id fijo el `aria-labelledby` de uno
podía terminar apuntando al título del otro.

La **insignia** (`Insignia`) es la pastilla de estado (pendiente, bloqueada, correo sin
confirmar…): siempre ícono más texto, nunca un color solo, con los tonos de estado de
los tokens (éxito, advertencia, peligro). El botón también tiene una variante `peligro`,
con el mismo tono, reservada para acciones destructivas (bloquear una cuenta); nunca el
acento, que es solo para la acción principal de la pantalla.

Dónde: `packages/ui-tokens/`, `apps/web/src/componentes/ui/`,
`apps/web/src/componentes/tema.tsx`, `apps/web/src/componentes/layout/fondo-animado.tsx`,
`apps/web/src/componentes/ui/brillo/`. Los algoritmos del fondo y del brillo están
guardados en `docs/referencias/fondo-animado.md`.

En móvil todavía no está implementado ni el fondo animado ni el brillo de bordes.

---

## Pantallas de la web

### Marco común: barra superior y pie

Las dos viven en el layout raíz, no en cada pantalla, así son iguales en todas y no hay
que acordarse de agregarlas al crear una página.

La **barra superior** es `sticky`: acompaña el scroll sin tapar contenido. A la
izquierda el nombre del sistema, que lleva al inicio; a la derecha el selector de tema
y, solo si hay sesión, con qué cuenta se entró, el color de la app y el botón de salir
(en el celular, solo su ícono). Mientras la sesión se está resolviendo no se muestra
nada de esa parte: es preferible un hueco breve a que "Salir" aparezca y desaparezca.

**Pantallas angostas (menos de `lg`, 1024 px: celular y tablet).** El menú de la
izquierda y los widgets se ocultan y el contenido ocupa todo el ancho. La navegación
pasa a una **barra abajo** (`navegacion-inferior.tsx`), fija, con los mismos destinos
que el menú (Inicio, Finanzas, Contactos, Tareas y Calendario): ícono y nombre corto, el
actual resaltado con la misma pastilla que el menú. Abajo porque es lo que más se toca y
queda al alcance del pulgar; respeta la zona segura del celular y deja un espacio de su
alto al final del marco para no tapar el pie. Administración no entra ahí (sería un
sexto destino, solo para admins): queda como ícono en la barra de arriba. En pantallas
angostas la barra de scroll es fina y no se le reserva lugar (desde `lg` con mouse sí,
para que el contenido no se corra al cambiar de pantalla). Las pestañas
(`SelectorDeSegmentos`) nunca son más anchas que su contenedor: si no entran, se
desplazan de costado. `e2e/pantallas-chicas.spec.ts` recorre todas las pantallas a 360
y 390 px y lista cualquier elemento que asome por los costados.

El **pie** es deliberadamente escueto —es un sistema privado, no un sitio público— con
el nombre y el año. En desarrollo suma un enlace a la guía de estilo.

Ni la barra ni el pie tienen ancho máximo: ocupan todo el ancho de la ventana, con el
mismo margen lateral (`px-4 sm:px-8`) que el marco de tres columnas de abajo, para que
el logo y el menú de navegación queden alineados al mismo borde en vez de que la barra
quede en una franja centrada más angosta que el resto.

Dónde: `apps/web/src/componentes/layout/`, `apps/web/src/app/layout.tsx`.

### Entrada de cada módulo

Finanzas, Contactos, Tareas, Calendario y Administración se arman al entrar, con la misma bienvenida en
pasos que la pantalla de inicio (`componentes/layout/encabezado-de-modulo.tsx`):
1. El ícono del módulo (el del menú, en su color) aparece con un resorte suave.
2. El título se escribe letra por letra.
3. Sube la descripción.
4. Sube el contenido de la pantalla, con el título todavía en camino.

Dura menos de un segundo, es solo `transform` y `opacity`, y no bloquea nada: se puede usar la pantalla
mientras termina. El título conserva su nombre accesible entero (las letras sueltas se esconden de los
lectores de pantalla). Con reducir movimiento aparece todo quieto, de una vez.

### Marco de la aplicación: navegación, contenido y widgets

Las pantallas con sesión iniciada (`/inicio`, `/admin`, `/finanzas` y las que se sumen) usan
`EstructuraDeApp`, que divide el cuerpo en hasta tres columnas: **navegación** a la
izquierda, **contenido** en el medio (la más ancha, porque es lo que se está mirando)
y **widgets** a la derecha. Los widgets los pasa cada página (`widgets=`) y dependen de
dónde está parada la persona:

- **`/finanzas`** muestra los widgets de Finanzas en dos carruseles, uno de texto y otro de
  gráficos (ver "Widgets de Finanzas").
- **`/contactos`** hace lo mismo con los widgets de Contactos (ver "Contactos", Widgets).
- **`/inicio`** no tiene columna de widgets: su carrusel de resúmenes es el contenido principal,
  ocupa el lugar de las dos columnas y entra entero en la ventana (ver "Pantalla de inicio").
- Una pantalla sin widgets (`/admin`) queda con dos columnas, sin una tercera vacía.

Es una decisión explícita de estructura, tomada antes de empezar el primer módulo, para no
rehacer cada pantalla después.

Cada página la usa a propósito, componiéndola igual que cualquier otro componente
(nada de layouts de ruta implícitos: se ve en cada `page.tsx` qué marco tiene). Las
pantallas fuera de la aplicación (`/ingresar`, `/cambiar-password`,
`/correo-confirmado`) no la usan: son flujos de una sola tarea, sin nada a lo que
navegar todavía.

Las dos columnas laterales **se pueden esconder**, para quien prefiere no verlas (por ejemplo, los
widgets). **Esconder una columna no mueve ni cambia de tamaño nada del resto de la pantalla**: la grilla
conserva sus tres anchos, así que el contenido y la otra columna quedan exactamente donde estaban, y el
lugar de la escondida queda vacío. La columna se desliza hacia su borde mientras se desvanece
(`transform` y `opacity`) hasta quedar invisible: tampoco recibe el foco del teclado ni la lee un
lector de pantalla. Con la preferencia de reducir movimiento no hay desplazamiento ni pulso.

Cada una tiene una **pestaña pegada al borde de la ventana**, a media altura (la del menú a la
izquierda, la de los widgets a la derecha), que está siempre, con la columna abierta o cerrada:
- Abierta es una pastilla blanca con la flecha en el color de acento; **cerrada se llena de acento**,
  para que se encuentre fácil cuando la columna ya no está.
- La flecha **gira media vuelta con un resorte** al cambiar de estado, y al esconder la columna la
  pestaña emite **un único pulso** (un aro que se agranda y se apaga). Al recargar con la columna ya
  escondida no hay pulso ni giro: nace en su posición.
- Al pasar el mouse **se asoma** unos píxeles hacia el contenido y muestra al costado un cartel con lo que
  hace ("Ocultar el menú", "Mostrar los widgets"); con el teclado, el cartel aparece al enfocarla. Al
  presionarla se achica un poco.
- Lleva `aria-expanded`, `aria-controls` y el mismo texto como nombre accesible.

La elección es **por dispositivo** (`localStorage`, como el tema) y se recuerda al recargar y al cambiar
de pantalla; un script que corre antes del primer pintado pone el estado en `<html>`, así que quien dejó
una columna escondida nunca la ve abierta un instante. Solo hay pestaña donde la columna existe: la del
menú y la de los widgets desde `lg`, y la de los widgets únicamente en pantallas que los tienen (no en
`/inicio` ni `/admin`). Dónde: `pestana-de-columna.tsx`, `lib/columnas-plegables.ts`.

Las columnas laterales son `sticky`, con el tope pegado a la barra superior
(`--alto-navbar`, la misma variable que define su altura): acompañan el scroll hasta
que se terminan, no quedan clavadas sin importar cuánto contenido tengan. En pantallas
angostas no entran las tres columnas: los widgets se ocultan primero (`lg` en
adelante) y, si todavía no entra, también la navegación (`md` en adelante), dejando
solo el contenido central — en ese caso, entrar a cada módulo se hace desde la barra
superior.

**El contenido central queda centrado en la pantalla.** Como el menú (220 px) y los widgets (336 px)
miden distinto, centrarlo "entre las dos columnas" lo corría hacia un lado. Desde `xl` (1280 px) la
grilla tiene tres pistas: las de los costados son `1fr` con el mismo mínimo, así que miden lo mismo
(`minmax(336px, 1fr)` con widgets y `minmax(220px, 1fr)` sin ellos, como en administración) y el medio
llega a 56 rem; el menú se pega al borde izquierdo y los widgets al derecho dentro de su pista. Sin
lugar para igualar los costados (por debajo de `xl`) se usa el reparto de siempre. Esconder el menú o los
widgets no mueve el contenido. La excepción son **inicio y calendario**, páginas "fusionadas"
(`<EstructuraDeApp fusionada>`): su contenido ocupa también el lugar de los widgets y llega hasta el
margen derecho. Tests: `apps/web/e2e/layout.spec.ts`.

La grilla de las tres columnas no tiene ancho máximo ni se centra a sí misma: las
columnas laterales quedan pegadas a los bordes reales de la ventana (con el mismo
margen que la barra superior y el pie), no encerradas en una franja centrada que en
una pantalla ancha dejaría el menú flotando lejos del borde. Lo que sí tiene ancho
máximo y se centra es el **contenido**, dentro de su propia columna.

El **menú de navegación** mide lo que necesita su ítem más largo (todos los demás se
estiran a ese mismo ancho) y queda pegado a la izquierda de su columna, sin ocuparla
entera ni centrarse en ella. Al final, separado con una línea y un poco más de aire,
hay un enlace para cerrar sesión — la misma acción que el botón "Salir" de la barra
superior (los dos usan `usarCerrarSesion`, para no duplicar la lógica), pensada para
quien ya está mirando el menú y no quiere ir hasta arriba.

El **contenido central** (el título de cada pantalla y el texto que lo acompaña) va
centrado dentro de su columna, no pegado a un borde: mismo criterio que ya usaban las
pantallas antes de tener el marco de tres columnas.

Dónde: `apps/web/src/componentes/layout/estructura-de-app.tsx`,
`menu-de-navegacion.tsx`, `apps/web/src/lib/usar-cerrar-sesion.ts`.

### `/ingresar`

Entrar y crear cuenta en la misma pantalla, con un toggle entre las dos. Es la pantalla
por defecto sin sesión: cualquier ruta protegida redirige acá.

Detalles de uso:

- Los errores de un campo aparecen junto a ese campo, con ícono además del color.
- Al fallar el envío **no se pierde lo escrito**: se corrige solo lo que estaba mal.
- Se distingue "sin conexión" de "error del servidor", porque lo que tiene que hacer la
  persona es distinto.
- Validación al salir de cada campo, no en cada tecla.
- El botón muestra su estado mientras la operación está en curso.
- Se completa entero con el teclado y sin violaciones de accesibilidad (verificado con
  axe-core en los dos temas).

### `/inicio`

Protegida. Saluda por nombre, dice con qué cuenta se entró y muestra debajo los **widgets de
cada módulo** (Finanzas y Contactos, una sección cada uno) en una cuadrícula, todos a la vez y
con los avisos primero: en esta pantalla los widgets son el contenido principal y ocupan el
lugar de las columnas de contenido y de widgets, que acá se fusionan. Ver "Widgets de
Finanzas" y "Contactos" (Widgets) para qué muestra cada uno. Los módulos nuevos suman sus
widgets cuando se pidan.

### `/cambiar-password`

Protegida. A la que se llega empujado cuando `debeCambiarPassword` está prendido (ver
Autenticación, Cambio de contraseña obligatorio). Un solo formulario: contraseña
actual y la nueva dos veces.

### `/admin`

Protegida y solo para admins. Ver Autenticación, Panel de admin.

### `/finanzas`

Protegida. Ver Gestión de ingresos y gastos.

### `/contactos`

Protegida. Ver Contactos.

### `/tareas`

Protegida. Ver Tareas.

### `/calendario`

Protegida. Ver Calendario.

### Protección de rutas

`src/proxy.ts` redirige según haya cookie de sesión o no. **No es el control de
acceso**: solo mira si la cookie existe, sin validarla. Quien decide de verdad es la
API, que valida la sesión contra la base en cada petición. El proxy está para que nadie
vea un destello de la pantalla equivocada.

Por la misma razón, `GuardiaDeCambioPassword` (en el layout raíz) manda a
`/cambiar-password` a quien tenga el aviso prendido, sin importar en qué pantalla
protegida esté, y `GuardiaDeAdmin` manda a `/inicio` a quien entre a `/admin` sin ser
admin.

Dónde: `apps/web/src/app/`, `apps/web/src/proxy.ts`,
`apps/web/src/componentes/layout/guardia-cambio-password.tsx`,
`apps/web/src/componentes/layout/guardia-de-admin.tsx`.

---

## Calidad

- **Biome** para lint y formato, con finales de línea LF forzados.
- **Lefthook**: antes de cada commit, Biome sobre los archivos modificados y
  verificación de tipos de todo el monorepo; antes de cada push, la suite de tests.
- **Vitest**: 240 tests. Los de integración corren contra `gestion_test` real, sin mocks
  de la base, e incluyen todos los caminos de rechazo del login, el honeypot, el rate
  limiting, los intentos de asignarse rol, las acciones del panel de admin (aprobar,
  rechazar, bloquear, resetear contraseña) con su auditoría, el perfil de una cuenta y
  su historial filtrado, las acciones sin sesión de admin (`pnpm usuario:aprobar`), y que
  ninguna respuesta de error filtre nada técnico.
- **Playwright con axe-core**: 83 tests end-to-end en un navegador real, sobre el flujo
  completo de ingreso, el cambio de contraseña obligatorio, el panel de admin, el perfil
  de una cuenta, el teclado, el teléfono y la accesibilidad en los dos temas.

Dónde: `biome.json`, `lefthook.yml`, `apps/api/src/**/*.test.ts`,
`apps/web/e2e/`, `packages/testing/`.
