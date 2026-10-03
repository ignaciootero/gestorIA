# Funcionalidades

Qué hace el sistema hoy, cómo funciona a grandes rasgos y dónde está en el código.
Se actualiza con cada funcionalidad nueva (ver `docs/guias/convenciones.md`).

Estado: **pasos 1 a 7 de la hoja de ruta**. Hay infraestructura, autenticación, sistema
visual, panel de admin y el primer módulo de negocio: ingresos y gastos (núcleo
completo — dashboard, movimientos, categorías, cuentas, presupuestos y estadísticas;
los gastos recurrentes quedan para una etapa aparte). Todavía no hay móvil ni entrada
por lenguaje natural.

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
el objeto.

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
- `pnpm usuario:sembrar` carga cuentas de prueba pasando por el flujo real (registro,
  aprobación o rechazo, bloqueo, reseteo de contraseña), para tener un historial de
  auditoría creíble sin armarlo a mano. Todas quedan con el correo confirmado, admin
  incluido: verificar un correo de verdad es justamente la prueba manual que este script
  no reemplaza. Cada escenario es una combinación con sentido (por ejemplo, una cuenta
  bloqueada después de haber sido aprobada) y tiene un nombre fijo, así que
  `--listar` los muestra, `--solo <nombres>` carga solo algunos y `--borrar-todo` (pide
  confirmación) vacía usuarios, sesiones y auditoría antes de sembrar, para no chocar con
  una corrida anterior. Todas las acciones quedan atribuidas al admin de
  `ADMIN_USUARIO`/`ADMIN_EMAIL` (los mismos datos que `pnpm usuario:admin`): si esa cuenta
  ya existe se reusa tal cual, sin tocarle la contraseña; si no, se crea ahí mismo con la
  contraseña fija `adminadmin` (nunca con la de un admin real, que se pide por consola y
  no se guarda en ningún archivo). Pensado para desarrollo, nunca se corre en producción.
- El escenario `finanzas` (`apps/api/src/scripts/sembrar-finanzas.ts`) carga para el **admin**
  seis meses de finanzas que simulan el uso real, pasando por los mismos servicios que usa la
  API: cuentas (BROU, Efectivo, Tarjeta, Mercado Pago, Ahorros y una cuenta vieja), categorías
  propias, seis períodos que arrancan el día 5 (el último abierto, con movimientos de esta
  semana), unos 190 movimientos —sueldo, alquiler, servicios, supermercado, transporte,
  suscripciones, salidas, un viaje, ingresos extra—, transferencias (retiros, ahorro, pago de la
  tarjeta, recarga de la billetera), presupuestos y también lo que hace la gente: corregir un
  importe mal tipeado y una categoría equivocada, borrar movimientos repetidos, duplicar y editar
  uno, reemplazar una categoría por otra nueva, renombrar categorías y un período, ocultar la
  cuenta vieja, contar el efectivo y ajustar el saldo, eliminar un período de "pruebas" con sus
  movimientos y reabrir el período actual. Las fechas se calculan hacia atrás desde hoy y el
  "azar" tiene semilla fija, así que sale igual en cada corrida. **No pisa nada**: si el admin
  ya tiene períodos, lo saltea; `--reiniciar-finanzas` (pide confirmación) borra primero sus
  cuentas, categorías, períodos y movimientos y siembra de nuevo.

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

**Una sola moneda por usuario**, la de `usuarios.monedaPorDefecto`: ningún movimiento
ni cuenta guarda su propia moneda, ni hay conversión entre monedas. Es lo que decidió
`docs/decisiones.md` (2026-09-30) para que el resumen pueda mostrar un balance único y
claro. Los montos se guardan como enteros en centésimos y se formatean siempre con
`Intl` (`formatearMonto`, en `packages/shared`).

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

### Resumen (dashboard)

Lo primero que se ve al entrar: **balance** del período (ingresos menos gastos),
**ingresos**, **gastos** (los dos con el total del **período anterior** al lado, para
comparar), **disponible** (la suma del saldo de todas las cuentas activas — no es lo
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

Tres gráficos simples con **Recharts** (única librería de gráficos del stack, ver
`docs/librerias.md`): gastos por categoría del período (de mayor a menor, cada barra con el
color propio de su categoría) y la evolución de ingresos/gastos de los últimos 6
períodos hasta el elegido, con el nombre de cada uno en el eje (verde para ingresos, rojo
para gastos — mismo color que las flechas del listado de
movimientos). Los gráficos se cargan de forma diferida (`next/dynamic`, `ssr: false`)
para no engordar el paquete inicial de las otras pestañas del módulo.

**Evolución de categorías.** Un selector elige una categoría (por defecto, la que más se gastó
en el período que se está mirando; la interna de transferencias no se ofrece) y otro, "Qué
mirar", si se ven sus **gastos** o sus **ingresos**, cada uno en su propio gráfico: una misma
categoría puede tener las dos cosas, y en un mes más ingresos que gastos y en otro al revés. El
gráfico muestra, en **dos gráficas en una**, los últimos hasta **12 períodos** terminando en el
elegido:

- **Barras (eje izquierdo): el valor bruto** gastado (o ingresado) en la categoría en cada
  período, con el color de la categoría. Con gastos, si la categoría tiene **presupuesto**, una
  línea punteada marca su límite (con ingresos no se muestra: un presupuesto es un tope de gasto).
- **Línea (eje derecho): ese valor como porcentaje de los ingresos del período** (todos los
  ingresos, no solo los de esa categoría), con un decimal. Con gastos es "cuánto de lo que entró
  se fue en esta categoría" (250 gastados sobre 2.000 de ingresos son 12,5 %, y puede pasar del
  100 %); con ingresos es "qué parte de lo que entró vino de esta categoría". En un período
  **sin ingresos no hay porcentaje** y la línea se corta, en vez de mostrar un 0 % o un valor
  inventado.

Todos los períodos aparecen, con 0 si no hubo movimientos del tipo elegido, para que el gráfico no
salte; si no hubo en ninguno, en lugar del gráfico se explica que no hay gastos (o ingresos) en esa
categoría. Cuenta solo el tipo elegido: ni las transferencias ni los movimientos eliminados. Como
los períodos pueden durar distinto, los puntos no son del todo comparables. Viene de
`GET /api/finanzas/estadisticas/categoria?periodoId=&categoriaId=&tipo=gasto|ingreso` (sin
`tipo`, gasto), que devuelve `{ tipo, periodos: [{ periodoId, nombre, totalCentavos,
ingresosCentavos, porcentajeDeIngresos }], presupuestoCentavos }` y responde 404 si el período o
la categoría no son de la persona y 400 con un tipo inválido.

### Dónde está

- Esquema: `packages/db/src/esquema/finanzas.ts` (`periodos`, `categorias`,
  `cuentas_financieras`, `ajustes_de_saldo`, `movimientos`, `presupuestos`).
- Compartido: `packages/shared/src/finanzas/` (esquemas Zod, constantes —set de
  categorías con sus colores, categoría de transferencias—, `colores.ts` con el color más
  distinto y `periodos.ts` con el nombre sugerido), `packages/shared/src/formato/` (montos y
  fechas).
- API: `apps/api/src/servicios/finanzas/`, `apps/api/src/rutas/finanzas.ts`.
- Web: `apps/web/src/app/finanzas/`, `apps/web/src/componentes/finanzas/`,
  `apps/web/src/lib/api-finanzas.ts`, `apps/web/src/lib/preferencias-finanzas.ts`.

### Campos de importe

Todos los campos donde se escribe plata (importe de un movimiento, saldo inicial de una cuenta,
saldo al actualizarla y límite de un presupuesto) **separan los miles mientras se escribe**:
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
- Al **pegar** un importe de otro lado se interpreta solo ("1,234.56", "$ 250.5", "1.234,56"):
  si hay dos separadores el último es el decimal; si hay uno solo, es decimal cuando le siguen
  uno o dos dígitos ("250.5") y de miles cuando le siguen tres ("1.234").
- El **cursor se queda donde estaba** aunque el formato agregue o quite puntos, y borrar un dígito
  vuelve a ordenar los miles. Al salir del campo, una coma sin decimales ("12,") se limpia.
- Hacia el formulario sube un número (NaN si está vacío), igual que antes: los esquemas Zod y la
  API no cambian.

### Límites conocidos

- **Tope de un importe: 9.999.999.999** (`IMPORTE_MAXIMO`, en `packages/shared`), con hasta dos
  decimales y mayor que cero. Vale para cada movimiento, para el saldo inicial de una cuenta,
  para el saldo que se indica al actualizarla (también negativo) y para el límite de un
  presupuesto. Es un tope contra errores de tipeo, no técnico: el saldo de una cuenta y los
  totales de un período son sumas y pueden superarlo. Los montos se guardan en centésimos
  como `bigint`.

- **Una transferencia es entre cuentas del mismo usuario y en la misma moneda**: no hay
  conversión (la moneda es una sola por usuario, ver más arriba). Tampoco hay comisiones ni
  transferencias entre períodos: es un movimiento más, de una sola fecha.
- **Reemplazar una categoría no se puede deshacer** (los movimientos pasan a la categoría
  elegida y no se guarda de dónde venían). Hay una confirmación explícita, pero no un deshacer.
- Los colores de las categorías ya creadas no se recalculan solos al agregar otras: el más
  distinto se calcula al crear (o al reemplazar por una nueva) y después es editable.

- **Gastos recurrentes** (alquiler, suscripciones) y sus "próximos gastos" quedan para
  una etapa aparte: no están implementados todavía (CLAUDE.md, hoja de ruta, paso 7 —
  "cada módulo se implementa solo cuando se pida explícitamente").
- Una sola moneda por usuario (ver más arriba): no sirve para llevar cuentas en más de
  una moneda a la vez.
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

## Sistema visual

Todos los colores, tamaños, radios y duraciones salen de `packages/ui-tokens`. Ningún
componente escribe un valor suelto.

- **Colores:** base neutra (zinc) y un único acento azul petróleo, reservado para la
  acción principal de cada pantalla, lo seleccionado, los enlaces y el foco.
- **Marca:** la aplicación se llama gestorIA. Hay dos versiones del logotipo, una con el
  nombre y otra con solo el símbolo, más un favicon propio.
- **Modo claro y oscuro** desde el inicio, con un selector de dos posiciones en la barra
  superior. Mientras la persona no elija, la interfaz sigue la preferencia del sistema y
  cambia sola si el sistema cambia; una vez que elige, esa elección manda y se guarda en
  su navegador. Un script inline aplica el tema antes del primer pintado, para que no
  haya un destello blanco al entrar en oscuro.
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
y, solo si hay sesión, con qué cuenta se entró y el botón de salir. Hay un ícono por
cada módulo del menú de navegación (por ahora, Finanzas, y Admin si la cuenta lo es)
—solo en pantallas angostas, donde no entra el menú de navegación de la izquierda (ver
más abajo); de `md` en adelante esos mismos enlaces ya están ahí. Este patrón de "un
ícono por módulo" funciona con dos, pero no escala: el tercer módulo va a necesitar un
menú propio para pantallas angostas en vez de seguir sumando íconos
(`docs/decisiones.md`, 2026-09-30). Mientras la sesión se está resolviendo no se
muestra nada de esa parte: es preferible un hueco breve a que "Salir" aparezca y
desaparezca.

El **pie** es deliberadamente escueto —es un sistema privado, no un sitio público— con
el nombre y el año. En desarrollo suma un enlace a la guía de estilo.

Ni la barra ni el pie tienen ancho máximo: ocupan todo el ancho de la ventana, con el
mismo margen lateral (`px-4 sm:px-8`) que el marco de tres columnas de abajo, para que
el logo y el menú de navegación queden alineados al mismo borde en vez de que la barra
quede en una franja centrada más angosta que el resto.

Dónde: `apps/web/src/componentes/layout/`, `apps/web/src/app/layout.tsx`.

### Marco de la aplicación: tres columnas

Las pantallas con sesión iniciada (`/inicio`, `/admin`, `/finanzas` y las que se sumen) usan
`EstructuraDeApp`, que divide el cuerpo en tres columnas: **navegación** a la
izquierda, **contenido** en el medio (la más ancha, porque es lo que se está mirando)
y **widgets** a la derecha, que por ahora solo reserva el lugar —se completa con datos
reales junto con los módulos que se los den. Es una decisión explícita de estructura,
tomada antes de empezar el primer módulo, para no rehacer cada pantalla después.

Cada página la usa a propósito, componiéndola igual que cualquier otro componente
(nada de layouts de ruta implícitos: se ve en cada `page.tsx` qué marco tiene). Las
pantallas fuera de la aplicación (`/ingresar`, `/cambiar-password`,
`/correo-confirmado`) no la usan: son flujos de una sola tarea, sin nada a lo que
navegar todavía.

Las columnas laterales son `sticky`, con el tope pegado a la barra superior
(`--alto-navbar`, la misma variable que define su altura): acompañan el scroll hasta
que se terminan, no quedan clavadas sin importar cuánto contenido tengan. En pantallas
angostas no entran las tres columnas: los widgets se ocultan primero (`lg` en
adelante) y, si todavía no entra, también la navegación (`md` en adelante), dejando
solo el contenido central — en ese caso, entrar a cada módulo se hace desde la barra
superior.

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
`menu-de-navegacion.tsx`, `panel-de-widgets.tsx`, `apps/web/src/lib/usar-cerrar-sesion.ts`.

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

Placeholder, protegida, dentro del marco de tres columnas. Saluda por nombre, dice con
qué cuenta se entró y permite salir. Los módulos se suman cuando se pidan.

### `/cambiar-password`

Protegida. A la que se llega empujado cuando `debeCambiarPassword` está prendido (ver
Autenticación, Cambio de contraseña obligatorio). Un solo formulario: contraseña
actual y la nueva dos veces.

### `/admin`

Protegida y solo para admins. Ver Autenticación, Panel de admin.

### `/finanzas`

Protegida. Ver Gestión de ingresos y gastos.

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
