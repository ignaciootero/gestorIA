# Decisiones de arquitectura

Registro breve de las decisiones importantes: qué se decidió, por qué y qué se descartó.
Las más nuevas arriba.

---

## 2026-09-16 — Nombre y logotipo: gestorIA

**Decisión.** La aplicación se llama **gestorIA**, juego de palabras entre "gestoría" e
IA. Se escribe siempre con la g minúscula y las dos últimas letras en mayúscula, incluso
al principio de una oración.

**Dónde vive.** El nombre está una sola vez, en `packages/shared/src/marca.ts`, de donde
lo toman los títulos de la web, la barra, el pie y el asunto de los correos. No se
escribe a mano en las pantallas.

**Dos versiones del logotipo.** `<Logotipo />` con el nombre, para identificar la
aplicación; `<Isotipo />` solo el símbolo, para donde el nombre no entra o sería
redundante (favicon, ícono de la app, avatares). Más un favicon propio en
`apps/web/src/app/icon.svg`, con los colores fijos porque un archivo suelto no puede
heredar `currentColor`.

**Lo que encontró la guía de estilo.** Al mostrar el logotipo sobre las dos superficies
apareció que el "IA" en acento **desaparece sobre fondo de acento**. De ahí salió la
versión mono, obligatoria sobre fondos de color. Es exactamente para lo que sirve tener
una guía de estilo interna.

**Lo que NO se renombró.** Las bases de datos siguen llamándose `gestion` y
`gestion_test`, y el prefijo de las cookies sigue siendo `gestion`. Son nombres de
infraestructura, no de cara al usuario, y cambiarlos obligaría a recrear las bases y a
invalidar las sesiones abiertas a cambio de nada.

---

## 2026-09-16 — La estética pasa de minimalista a "limpia pero con vida"

**Decisión.** Cambia la dirección de `docs/guias/estetica.md`. Antes decía "bordes finos
en lugar de sombras", "sombras solo en elementos flotantes" y duraciones de 150-250 ms
con tope de 300. Ahora hay una escala de elevación con tres niveles, estados de hover y
presionado en todo lo interactivo, resortes, entradas en cascada y una duración larga de
380 ms para transiciones compuestas.

**Por qué.** Decisión del dueño del proyecto: la interfaz se sentía "demasiado simple,
muy aburrida". Una interfaz que no responde al mouse ni acompaña sus propios cambios se
siente muerta por prolija que esté.

**Qué no cambió, y no se negocia.** Respetar la preferencia de reducir movimiento del
sistema y mantener 60 fps. Eso no es preferencia estética sino calidad, así que quedó
escrito como tal al principio de la guía.

**Dos cosas que salieron de verificarlo.**

1. El foco de los campos ahora es un anillo de acento en lugar del contorno general. Se
   puede quitar el contorno **solo** porque se lo reemplaza por algo igual de visible;
   el color sale del acento con transparencia y no del acento suave, que sobre blanco es
   demasiado pálido para ser el único indicador.
2. Con la preferencia de reducir movimiento, el título de la pantalla de ingreso quedaba
   clavado 8 px desplazado, sin llegar nunca a su lugar: las variantes "sin movimiento"
   no declaraban la propiedad `y`, y sin un destino al que ir, Motion no mueve el
   elemento. La regla que quedó: con el movimiento reducido cambian la duración y la
   distancia, nunca **qué** propiedades se animan.

---

## 2026-09-16 — Transición entre los dos formularios de ingreso

**Decisión.** El cambio entre "Entrar" y "Crear cuenta" anima el alto de la tarjeta,
además del contenido, y el desplazamiento pasó de vertical a horizontal.

**Por qué.** La transición anterior se sentía brusca y el motivo principal no era la
animación del contenido sino que **la tarjeta saltaba de alto**: entrar tiene dos campos
y crear cuenta cinco, y ese cambio no se animaba. Además el contenido se movía en
vertical mientras las pestañas están una al lado de la otra, así que el movimiento no
coincidía con el de la pastilla que se desliza arriba.

**Cómo.** Un ResizeObserver mide el contenido y la tarjeta anima su alto hasta ese
valor. De paso también acompaña los cambios dentro de un mismo formulario: cuando
aparece un mensaje de error, la tarjeta crece en vez de dar un tirón.

**Excepción a la guía de estética.** Se anima `height`, que es una propiedad de layout y
no `transform` ni `opacity`. Es un solo elemento chico y era justamente el salto de alto
el problema, así que la regla se rompe a conciencia y queda anotado acá.

**Por qué sigue en `mode="wait"`.** Superponer los dos formularios sería algo más fluido,
pero los dos tienen un campo "Contraseña": tenerlos montados a la vez dejaría dos campos
con el mismo nombre accesible durante la transición, lo que confunde a un lector de
pantalla y vuelve frágiles los tests. La salida se acortó a 100 ms para compensar.

---

## 2026-09-16 — Barra superior y pie en el layout, y selector de tema de dos posiciones

**Decisión.** El selector de tema pasa de tres opciones (claro, oscuro, automático) a
dos, y se muda a una barra superior común a todas las pantallas. Se agrega un pie,
también común.

**Por qué el selector estaba en tres.** Son tres estados posibles, y con dos botones no
se puede representar "seguí al sistema". Se resolvió de otra forma: **la preferencia del
sistema sigue respetándose**, pero como estado inicial en vez de como opción. Mientras
no haya elección guardada, la interfaz sigue a Windows o al teléfono y cambia sola si el
sistema cambia; en cuanto la persona toca un botón, esa elección manda.

**Qué se pierde.** Quien elija un tema explícito no tiene forma de volver a "seguir al
sistema" sin borrar los datos del sitio. Es el precio de tener dos botones en vez de
tres. Si más adelante molesta, se recupera agregando la opción en un menú de
preferencias de la cuenta, sin ocupar lugar en la barra.

**Por qué el marco va en el layout raíz.** Si cada pantalla armara su propio
encabezado, terminarían distintos: ya estaba pasando, con `/ingresar`, `/inicio` y la
guía de estilo repitiendo el selector con márgenes distintos. El botón de salir también
se movió a la barra, que es donde la gente lo busca, y de paso despejó la pantalla de
inicio.

---

## 2026-09-16 — Para entrar hacen falta dos cosas: correo verificado y cuenta aprobada

**Decisión.** Se suma la verificación de correo por enlace. Los dos requisitos son
independientes y se exigen los dos: confirmar el correo no aprueba la cuenta, y que un
admin apruebe la cuenta no da por confirmado el correo.

**Por qué.** Resuelven problemas distintos. La verificación prueba que la dirección le
pertenece a quien se registró (si no, cualquiera puede registrarse con el correo de
otra persona). La aprobación decide si esa persona entra al sistema. Cubrir una sola
deja la otra puerta abierta.

**Cómo se implementa.** `requireEmailVerification` de Better Auth para lo primero, y
nuestro hook de `session.create.before` para lo segundo. Better Auth corta antes, así
que el orden de los mensajes es: primero `EMAIL_NO_VERIFICADO`, después
`CUENTA_PENDIENTE`.

**Consecuencia de usabilidad.** El correo y la pantalla posterior al registro explican
los **dos** pasos desde el principio. Si solo dijeran "confirmá tu correo", la persona
lo confirmaría, intentaría entrar y se toparía con otro rechazo sin entender por qué.

**El primer admin es la excepción.** Se crea con el correo dado por confirmado, porque
lo hace desde el servidor quien ya tiene acceso al `.env` y a la base: no hay nada que
verificar. Sin esa excepción quedaría sin poder entrar y sin nadie que lo aprobara.

---

## 2026-09-16 — Correo con Nodemailer, y al log cuando no hay SMTP

**Decisión.** El envío usa Nodemailer sobre SMTP configurado por variables de entorno.
Si el SMTP no está configurado, la API **no falla**: escribe el correo entero en el
log, con el enlace incluido.

**Por qué.** El entorno de desarrollo es Windows nativo sin Docker, así que no hay un
capturador de correo local tipo Mailpit. La alternativa era configurar un SMTP real
para poder probar, lo que obliga a tener credenciales a mano solo para ver una pantalla.
Escribir al log deja probar el flujo entero, incluido tocar el enlace, sin nada más.

**Riesgo.** En producción, un SMTP sin configurar significa que nadie puede confirmar
su cuenta. Por eso la API lo registra como `warn` al arrancar cuando `NODE_ENV` es
`production`.

---

## 2026-09-16 — Validación del registro también en el servidor

**Decisión.** La API valida el cuerpo de `/sign-up/email` con `esquemaRegistroServidor`,
el mismo Zod que usa el formulario, antes de dejar pasar la petición.

**Por qué.** Antes, `nombre`, `apellido` y el largo del correo se validaban **solo en
el navegador**. Se comprobó con curl: un `nombre` de 5000 caracteres y un `nombre`
vacío entraban a la base con respuesta 200. La guía de seguridad es explícita —
"validar con Zod toda entrada que llegue a la API, nunca confiar en validaciones del
cliente"— así que era un defecto, no una limitación.

**Detalle.** Los errores vuelven con el detalle por campo y con los nombres que usa el
formulario (`usuario`, no `username`), para que la web pueda poner cada mensaje junto
al campo correcto.

---

## 2026-09-16 — Largo máximo de 24 caracteres y sin mensaje de registro

**Decisión.** `usuario`, `nombre`, `apellido` y `password` tienen un máximo de 24
caracteres. Se quitó el campo opcional "¿quién sos?" del registro, incluida su columna
en la base.

**Por qué.** Decisión del dueño del proyecto. Los límites se definen una sola vez en
`LARGO_MAXIMO_CAMPO` (`packages/shared`), de donde salen tanto el formulario como la
validación del servidor y los mensajes de error.

**Sobre el límite de la contraseña.** Empezó en 20 y se subió a 24 el mismo día. Con 24
entran las contraseñas que generan por defecto casi todos los gestores; las de 32, que
algunos usan, siguen quedando afuera, igual que las frases largas. Para una contraseña
el largo es la defensa que más pesa, así que queda anotado: subirlo es un cambio de una
línea (`LARGO_MAXIMO_CAMPO`) y no invalida ninguna contraseña existente.

**Migración.** `DROP COLUMN mensaje_registro`. Es destructiva, pero se verificó antes
de aplicarla que no había ninguna fila con dato en esa columna.

**Actualizado en `CLAUDE.md`:** la sección de autenticación y administración.

---

## 2026-09-16 — Se puede entrar con usuario o con correo, indistinto

**Decisión.** Un solo campo en el formulario acepta las dos cosas: si tiene arroba se
usa el endpoint de correo, si no el de usuario.

**Por qué.** `CLAUDE.md` decía "email y contraseña", pero al definir los datos de la
primera cuenta apareció también un usuario único (`iotero`). Obligar a recordar con
cuál de los dos se registró uno es exactamente el tipo de fricción que la guía de
usabilidad pide evitar.

**Consecuencia.** Se usa el plugin `username` de Better Auth. Su validador de usuario
acepta mayúsculas a propósito: también corre al iniciar sesión, y quien escribe
"IOtero" tiene que encontrar su cuenta igual. La normalización a minúsculas la hace la
librería.

**Actualizado en `CLAUDE.md`:** la sección de autenticación.

---

## 2026-09-16 — La contraseña del admin no vive en el `.env`

**Decisión.** El script `pnpm usuario:admin` pide la contraseña por consola, oculta, en
lugar de leerla de una variable de entorno. La variable `ADMIN_PASSWORD` sigue
existiendo pero solo como salida para entornos sin terminal (el seed en el VPS).

**Por qué.** `CLAUDE.md` decía "datos de variables de entorno" para el admin. Pero una
contraseña en el `.env` queda en texto plano en disco para siempre, aunque el archivo
no se versione, y si se pasara como argumento del comando quedaría en el historial del
shell. Pedirla al momento significa que se escribe, se usa y se olvida.

**Cómo funciona.** Modo crudo de stdin, sin APIs privadas de Node ni comandos del
sistema, así que funciona igual en Windows y en Linux
(`apps/api/src/scripts/pedir-password.ts`).

**Actualizado en `CLAUDE.md`:** la sección de autenticación y administración.

---

## 2026-09-16 — Caché de sesión en cookie desactivada

**Decisión.** `session.cookieCache` queda en `false`, aunque Better Auth la trae
activada y ahorra una consulta por petición.

**Por qué.** Con la caché activada, Better Auth confía en una cookie firmada durante
unos minutos sin consultar la base. Eso significa que bloquear una cuenta, rechazarla o
cerrarle las sesiones tras un reseteo de contraseña **no tendría efecto** hasta que la
caché venciera: alguien a quien acabás de bloquear seguiría navegando.

Lo detectaron dos tests que fallaron al verificar que cerrar sesión invalida el acceso
de inmediato.

**Costo.** Una consulta por petición, resuelta por el índice único del token de sesión.
Ante el conflicto entre seguridad y rendimiento, manda la seguridad (`CLAUDE.md`,
Prioridades ante conflictos).

---

## 2026-09-16 — Tablas de autenticación con nombres en español

**Decisión.** Los modelos de Better Auth se mapean a `usuarios`, `sesiones`, `cuentas`,
`verificaciones` y `limites_peticiones`. Sus **campos** conservan los nombres que impone
la librería (`name`, `email`, `emailVerified`, `role`, `banned`); los campos propios del
proyecto van en español (`nombre`, `apellido`, `estado`, `zonaHoraria`).

**Por qué.** La guía de convenciones pide tablas del dominio en español. Los usuarios
son la entidad más central del sistema, y una tabla `user` suelta entre `gastos`,
`contactos` y `facturas` se lee mal. Los campos, en cambio, son parte de la API de
Better Auth: renombrarlos obligaría a mapear cada uno a mano y a revisar ese mapeo en
cada actualización de la librería, sin ganar nada.

**Nota sobre `name`.** Better Auth exige un campo `name`. Se guarda como nombre
completo para mostrar, y además están `nombre` y `apellido` por separado, que es lo que
se necesita para saludar o para ordenar. Hay algo de duplicación, a cambio de no pelear
con la librería.

---

## 2026-09-16 — Contraste de `texto-secundario` corregido a zinc-600

**Decisión.** En modo claro, `texto-secundario` pasó de zinc-500 (`#71717a`) a zinc-600
(`#52525b`).

**Por qué.** Los tests de accesibilidad con axe-core detectaron que zinc-500 sobre
`superficie-suave` da una relación de contraste de 4,39:1, por debajo del mínimo de
4,5:1 que pide WCAG AA. La guía de estética exige verificar contraste accesible en
ambos modos.

**Cómo se evita que vuelva a pasar.** Los tests end-to-end corren axe sobre las
pantallas en los dos temas, así que un token con contraste insuficiente rompe la suite.

---

## 2026-09-16 — Guías movidas a `docs/guias/`

**Decisión.** Las guías de trabajo pasaron de `docs/` a `docs/guias/`.

**Por qué.** `CLAUDE.md` y las propias guías ya referenciaban `docs/guias/`, y la carpeta
existía vacía. Se corrigió la ubicación real en vez de las referencias.

---

## 2026-09-16 — Node 24 ejecuta TypeScript, sin `tsx` ni `dotenv`

**Decisión.** En desarrollo la API corre con `node --watch src/index.ts`, sin
transpilador intermedio. Las variables de entorno se cargan con `--env-file-if-exists` y
`process.loadEnvFile()`.

**Por qué.** Node 24 borra los tipos de los archivos `.ts` de forma nativa y trae carga
de `.env` incorporada. Nos ahorra dos dependencias, una capa de indirección y la
posibilidad de que lo que corre en desarrollo no sea lo mismo que se compila.

**Qué hace falta para que funcione.** Node borra tipos pero no transforma sintaxis, así
que el `tsconfig` activa `erasableSyntaxOnly`: prohíbe `enum`, `namespace` y parámetros
con modificador de acceso. Por eso los códigos de error son un objeto `as const` y no un
`enum`. Además `rewriteRelativeImportExtensions` permite escribir los imports relativos
con `.ts` (lo que Node necesita para ejecutarlos) y que `tsc` los reescriba a `.js` al
emitir (lo que Node necesita en `dist/`).

**Alternativas descartadas.**
- `tsx`: funciona bien, pero es una dependencia más y una capa más entre lo que escribís
  y lo que corre.
- `tsup` / `esbuild` para el build de producción: no hace falta. `tsc` alcanza.
- Ejecutar los paquetes internos sin compilar ("just-in-time"): Node no borra tipos
  dentro de `node_modules`, y la API corre sin bundler. Ver la decisión siguiente.

---

## 2026-09-16 — `packages/db` se compila con `tsc`

**Decisión.** Los paquetes internos se compilan a `dist/` y su `exports` apunta a `dist`
para el runtime y a `src` para los tipos.

**Por qué.** Es lo que recomienda Turborepo cuando el consumidor no tiene bundler, que
es el caso de la API sobre Node. Además Turborepo puede cachear el `build`.

**Alternativa descartada.** Exportar el `src` directamente. Es más simple de escribir,
pero requiere que quien importa transpile TypeScript, y Node no lo hace dentro de
`node_modules`.

---

## 2026-09-16 — TypeScript 7 (compilador nativo)

**Decisión.** Se adopta TypeScript 7.0, el compilador reescrito en Go, estable desde
julio de 2026.

**Por qué.** Mismo paquete y mismo comando `tsc`, entre 8 y 12 veces más rápido. En un
hook de pre-commit que verifica tipos de todo el monorepo, eso se nota en cada commit.

**Riesgo conocido y por qué no nos afecta hoy.** TypeScript 7 no tiene API programática
estable hasta la 7.1, lo que rompe herramientas que importan el compilador
(typescript-eslint, ts-morph, transformadores propios). Ninguna de las nuestras lo hace:
Biome está escrito en Rust, Vitest transpila con esbuild y drizzle-kit también.

**A revisar.** Al incorporar Next.js (paso 3) y Expo (paso 6) hay que verificar que
soporten TypeScript 7. Si alguno no, la salida es fijar `typescript` en `6.0.3` en el
catálogo de `pnpm-workspace.yaml`: es un solo cambio en un solo archivo.

---

## 2026-09-16 — Un único `.env` en la raíz, con variables sueltas y no una URL

**Decisión.** Un solo archivo `.env` en la raíz del monorepo. La conexión a PostgreSQL
se configura con variables sueltas (`POSTGRES_HOST`, `POSTGRES_USER`,
`POSTGRES_PASSWORD`…) y no con una `DATABASE_URL`.

**Por qué.** Con una URL, una contraseña con caracteres especiales (`@`, `:`, `/`) hay
que codificarla, y es una fuente de errores difíciles de diagnosticar. Con variables
sueltas se pasan tal cual al driver. Además el script que crea las bases necesita
conectarse a la base `postgres` con las mismas credenciales pero otra base: con
variables sueltas es cambiar un campo.

**Consecuencia.** El nombre de la base de tests es una variable propia
(`POSTGRES_DB_TEST`), y el mismo código elige una u otra con un parámetro. No hay un
segundo archivo `.env.test` que mantener sincronizado.

---

## 2026-09-16 — El cliente de base de datos recibe su configuración

**Decisión.** `crearClienteDb(config)` recibe la configuración como parámetro en vez de
leer el entorno por su cuenta. Lo mismo `crearApp({ cliente, logger, entorno })`.

**Por qué.** Es lo que permite que los tests apunten a `gestion_test`, o directamente a
una base inexistente para probar el camino de fallo, sin variables globales ni mocks.
El test de "base no disponible" usa un error real del driver, no un mock: es la única
forma de saber que el 503 y el formato de error salen bien de verdad.

---

## 2026-09-16 — El comodín `*` en CORS no se puede configurar

**Decisión.** La validación con Zod de `ORIGENES_PERMITIDOS` rechaza `*` y rechaza una
lista vacía.

**Por qué.** La guía de seguridad prohíbe `*`. Dejarlo como una regla escrita que alguien
puede violar copiando un `.env` de ejemplo es más frágil que hacer que la API
directamente no arranque.

---

## 2026-09-16 — Errores: un formato único con `idPeticion`

**Decisión.** Toda respuesta de error tiene la forma
`{ error: { codigo, mensaje, campos?, idPeticion } }`. El `idPeticion` es el mismo que
aparece en los logs de esa petición.

**Por qué.** El formato lo pide la guía de convenciones. El `idPeticion` en la respuesta
es un agregado: cuando un usuario reporta un problema, alcanza con ese identificador
para encontrar en los logs todo lo que pasó, sin pedirle nada más y sin haberle mostrado
ningún detalle técnico.

---

## 2026-09-17 — El fondo animado se difumina agrandando un canvas chico

**Decisión.** El fondo es un `<canvas>` fijo que se pinta a 1/24 del tamaño de la ventana
y que CSS estira a pantalla completa. **No se usa `filter: blur()`.**

**Por qué.** Un `blur` de radio grande sobre un área del tamaño de la ventana es de las
operaciones más caras que hace el navegador, y con formas que además cambian de tamaño,
de giro y de color habría que recalcularlo en cada cuadro. Dibujar quince gradientes
radiales sobre un lienzo de 80×45 píxeles cuesta, medido, **0,08 ms por cuadro**; el
suavizado del estirado sale gratis porque lo hace el compositor al escalar la imagen.

**Consecuencia.** El fondo cubre **toda la ventana**, no solo el cuerpo: al ser `fixed` ya
no depende del alto del documento ni del scroll. La barra superior y el pie quedan encima
con superficie translúcida, así que se siguen distinguiendo del fondo. El canvas necesita
JavaScript, de modo que el componente es de cliente, con tope de 30 cuadros por segundo,
pausa con la pestaña oculta y un único cuadro fijo con la preferencia de reducir
movimiento. La contrapartida es que el efecto tiene un piso de resolución: con un factor
de difuminado mucho más chico se verían los bordes de las formas.

---

## 2026-09-17 — El brillo de bordes se dibuja con SVG, no con máscaras CSS

**Decisión.** El borde iluminado son dos rectángulos SVG superpuestos —uno fino y otro
difuminado como halo— con el trazo pintado por un gradiente radial centrado en el mouse.
No se usa `mask-composite` ni `color-mix`.

**Por qué.** La versión con máscaras existió y se descartó. El truco de "degradado
recortado al borde" necesita `mask-image` con dos capas, `mask-clip` distinto en cada una
y `mask-composite: exclude`, más el prefijo `-webkit-` con otro valor (`xor`): cuatro
propiedades que se comportan distinto entre navegadores y que, si una falla, no degradan
—tapan el contenido con un rectángulo de color—. Un trazo SVG con un gradiente es una
funcionalidad de 1999 que se comporta igual en todos lados, y además permite el halo
difuminado, que con máscaras habría que simular con un segundo elemento.

**Consecuencia.** El efecto necesita un elemento más en el DOM por contenedor y un bucle
de `requestAnimationFrame` que actualiza atributos. Se paga con un único bucle para toda
la página —no uno por tarjeta—, que además solo corre mientras hay un mouse en la ventana.
Medido con el mouse recorriendo el borde del panel: **60 fps exactos, sin un solo cuadro
por encima de 20 ms**.

---

## 2026-09-17 — El contraste del fondo se verifica a mano, no con axe

**Decisión.** Hay un test en `packages/ui-tokens` que compone el peor caso posible del
fondo animado sobre el color de fondo —recorriendo los 360 grados de tono que puede tomar
una forma y los dos extremos del desplazamiento de luminosidad— y exige 4,5:1 para el
texto normal y el secundario.

**Por qué.** axe calcula el contraste mirando el fondo de los elementos **ancestros**, y el
fondo animado es un canvas hermano, fijo y por detrás. Para axe el texto está sobre el
color de fondo a secas, así que una intensidad demasiado alta pasaría todos los tests de
accesibilidad y aun así dejaría texto ilegible. Ya pasó una vez con una versión anterior
del fondo: subir la opacidad dejó el texto secundario en 3,9:1 y lo único que lo detectó
fue este cálculo.

**Detalle que importa.** El peor caso **no** es una forma sola con su alfa: las formas se
apilan y varios gradientes sobre el mismo punto convergen al color pleno. El alfa efectivo
que llega a la pantalla es la intensidad del canvas.

---

## 2026-09-17 — Las microinteracciones tienen su propia escala de duración

**Decisión.** `--anim-duracion` (220 ms) convive con `--duracion-rapida/normal/lenta`
(150/240/380 ms) en vez de reutilizar una de ellas. El presionado usa el 40 % de esa base.

**Por qué.** Describen cosas distintas. Las tres primeras son cambios de estado de la
pantalla: algo aparece, algo cambia de tamaño, un panel entra. La nueva es el *tacto*: lo
que pasa mientras el mouse está encima de un botón. Tener una sola duración para el tacto
hace que todos los controles se sientan igual, que es justo lo que se busca; meterlo en la
escala de tres invitaría a elegir distinto en cada componente.

---

## 2026-09-17 — La elevación al hover es exclusiva de los botones

**Decisión.** Solo los botones se levantan al pasar el mouse. Las tarjetas, las filas y
todo lo demás responden con un fondo suave, y las que agrupan contenido con el brillo del
borde. Se quitó el levantado y el cambio de borde que tenía `Tarjeta interactiva`.

**Por qué.** Si todo lo que queda debajo del cursor se desplaza, la pantalla se vuelve
inestable y el movimiento deja de significar algo: cuando todo reacciona igual, nada
indica qué es lo accionable. Reservarlo para el botón le devuelve el significado.
