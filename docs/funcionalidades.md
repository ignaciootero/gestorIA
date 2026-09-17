# Funcionalidades

Qué hace el sistema hoy, cómo funciona a grandes rasgos y dónde está en el código.
Se actualiza con cada funcionalidad nueva (ver `docs/guias/convenciones.md`).

Estado: **pasos 1 a 4 de la hoja de ruta**, con el paso 4 empezado: hay
infraestructura, autenticación, sistema visual y las pantallas de ingreso e inicio.
Todavía no hay módulos de negocio ni panel de admin.

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
  cierra todas las sesiones abiertas.

Hasta que exista el panel de admin (paso 5) estos scripts son la única forma de
aprobar una cuenta.

Dónde: `apps/api/src/scripts/`, `apps/api/src/servicios/usuarios/cuentas.ts`.

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
y, solo si hay sesión, con qué cuenta se entró y el botón de salir. Mientras la sesión
se está resolviendo no se muestra nada de esa parte: es preferible un hueco breve a que
"Salir" aparezca y desaparezca.

El **pie** es deliberadamente escueto —es un sistema privado, no un sitio público— con
el nombre y el año. En desarrollo suma un enlace a la guía de estilo.

Dónde: `apps/web/src/componentes/layout/`, `apps/web/src/app/layout.tsx`.

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

Placeholder, protegida. Saluda por nombre, dice con qué cuenta se entró y permite
salir. Los módulos se suman cuando se pidan.

### Protección de rutas

`src/proxy.ts` redirige según haya cookie de sesión o no. **No es el control de
acceso**: solo mira si la cookie existe, sin validarla. Quien decide de verdad es la
API, que valida la sesión contra la base en cada petición. El proxy está para que nadie
vea un destello de la pantalla equivocada.

Dónde: `apps/web/src/app/`, `apps/web/src/proxy.ts`.

---

## Calidad

- **Biome** para lint y formato, con finales de línea LF forzados.
- **Lefthook**: antes de cada commit, Biome sobre los archivos modificados y
  verificación de tipos de todo el monorepo; antes de cada push, la suite de tests.
- **Vitest**: 147 tests. Los de integración corren contra `gestion_test` real, sin mocks
  de la base, e incluyen todos los caminos de rechazo del login, el honeypot, el rate
  limiting, los intentos de asignarse rol y que ninguna respuesta de error filtre nada
  técnico.
- **Playwright con axe-core**: 21 tests end-to-end en un navegador real, sobre el flujo
  completo de ingreso, el teclado, el teléfono y la accesibilidad en los dos temas.

Dónde: `biome.json`, `lefthook.yml`, `apps/api/src/**/*.test.ts`,
`apps/web/e2e/`, `packages/testing/`.
