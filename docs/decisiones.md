# Decisiones de arquitectura

Registro breve de las decisiones importantes: qué se decidió, por qué y qué se descartó.
Las más nuevas arriba.

---

## 2026-11-05 — Navegación de abajo en pantallas angostas

**Decisión.** Debajo de `lg` (1024 px) no hay menú a la izquierda: la navegación es una barra fija
abajo con los cinco destinos (ícono y nombre corto). Reemplaza a los íconos sueltos de la barra de
arriba (2026-09-30), que solo cubrían Finanzas y dejaban sin acceso a Contactos, Tareas y
Calendario desde el celular. Administración queda como ícono arriba. El menú lateral pasa de
aparecer en `md` a aparecer en `lg`.

**Por qué.** En un celular sobra alto y falta ancho: una barra abajo gasta 64 px de alto y ninguno
de ancho, mientras el menú lateral se llevaba 220 de 375. Abajo y no en un menú desplegable porque
se ve siempre dónde se está y queda al alcance del pulgar. Entre 768 y 1024 px (tablet, celular
horizontal) el menú lateral dejaba al contenido demasiado angosto: ahí también va la barra.

---

## 2026-11-05 — Ajustes del fondo animado elegidos por la persona

**Decisión.** En el diálogo del color, debajo del tono, cada persona ajusta el fondo de cada modo:
intensidad, velocidad, tamaño de las manchas y un segundo tono opcional. Se guardan en la cuenta
como porcentajes enteros (`usuarios.fondo_claro` y `_oscuro`, texto JSON validado con Zod; null es
el de la app). La intensidad se ofrece como porcentaje de un tope (`INTENSIDAD_MAXIMA_DEL_FONDO`:
0,32 en claro y 0,30 en oscuro).

**Por qué.** El tope sale del contraste, no del gusto: con el color de acento libre, el fondo puede
tener cualquier tono, y el test de contraste pasó a recorrer los 360 (antes solo los cercanos al
verde agua). Así ningún ajuste deja el texto ilegible. Porcentajes y no los valores internos para
que el esquema sea simple y lo elegido siga significando lo mismo si cambian los valores base.
Texto JSON y no jsonb porque viaja en la sesión de Better Auth como un campo más del usuario. Los
ajustes se aplican en vivo leyendo una referencia en cada cuadro, sin reiniciar la animación: si
no, el fondo saltaría con cada movimiento de un deslizador. Se dejaron afuera la cantidad de
manchas y su forma: cambian poco lo que se percibe y suman controles.

---

## 2026-11-05 — Color de acento elegido por la persona

**Decisión.** Cada persona puede elegir el color de acento con un selector libre (cualquier
color), uno para el modo claro y otro para el oscuro, con un botón para volver al verde agua.
Se guarda en la cuenta (`usuarios.color_de_acento_claro` y `_oscuro`, null es el de la app). De
cada color se derivan los cuatro tonos del acento en OKLCH (`derivarAcento`, en
`packages/ui-tokens`): el acento es el color elegido si se lee bien, y si no se le cambia solo la
luminosidad hasta llegar a 4,5:1; el fondo suave y su texto usan el tono con luminosidades fijas.

**Por qué.** Un selector libre no puede garantizar contraste por sí solo: un amarillo clarito con
texto blanco no se lee. Ajustar la luminosidad respeta lo que la persona eligió (el tono) y deja
la app accesible con cualquier color, sin listas cerradas. OKLCH y no HSL porque su luminosidad es
perceptual: con HSL, un amarillo y un azul "igual de claros" se ven muy distintos. En la cuenta y
no en el navegador para que el color siga a la persona en todos sus dispositivos; igual se guarda
una copia con los tonos derivados en el navegador, que se aplica antes del primer pintado (como el
tema), porque la sesión llega tarde y si no se vería un destello del verde agua al cargar. Sin
librería de colores: las conversiones son unas pocas fórmulas publicadas y quedan testeadas.

**Consecuencia.** El acento puede coincidir con colores que ya tienen significado (el verde de
éxito, los colores de origen de cada módulo): es elección de la persona, y ningún significado
depende solo del color (siempre hay ícono o texto).

---

## 2026-11-04 — Con movimiento reducido cambia la duración, no el HTML inicial

**Decisión.** En los componentes que se renderizan en el servidor, la preferencia de reducir movimiento solo cambia la
duración de una animación o el destino de un gesto, nunca el estado inicial ni si el gesto existe. La pestaña de columna
(`PestanaDeColumna`) tiene siempre `whileHover` y `whileTap`, que con movimiento reducido no mueven nada. El encabezado de
ingreso arranca siempre corrido 8 px y con movimiento reducido llega en duración cero.

**Por qué.** En el servidor `useReducedMotion` todavía no conoce la preferencia (devuelve `null`). Con movimiento reducido,
el HTML del cliente salía distinto del del servidor y Next.js mostraba un error de hidratación ("1 Issue"). En la pestaña
la diferencia era el `tabindex` que Motion agrega a lo que tiene `whileTap`; en el ingreso, el `transform` inicial. Lo que
se renderiza solo en el cliente, después de cargar datos, no tiene este problema. Quedó como regla en
`docs/guias/estetica.md`.

## 2026-11-04 — Pantalla de inicio: tarjeta de alto propio, más ancha y con el saludo integrado

**Decisión.** El carrusel de inicio ocupa todo el ancho disponible (hasta 80 rem, antes 64) y la
tarjeta tiene un alto propio (32 rem; 36 rem en ventanas de 1000 px de alto o más) en vez de estirarse
hasta llenar la ventana. Saludo, pestañas y tarjeta se centran en el alto. El saludo deja de estar
suelto y centrado arriba: va a la izquierda de las pestañas, alineado con la tarjeta, en grande y con
una etiqueta "Inicio". La pantalla entra como una bienvenida en pasos: la manito, el saludo letra por
letra, la fecha y después las pestañas y la tarjeta. En ventanas de menos de 701 px de alto el saludo
se achica (variante `ventana-alta` en globals.css).

**Por qué.** Estirada, la tarjeta dejaba los gráficos de barras altísimos y la columna de texto con
un hueco en blanco; y en pantallas anchas sobraban cientos de píxeles a los costados. Con un alto
propio, lo que sobra queda afuera de la tarjeta, repartido arriba y abajo. Se descartó llenar el alto
con más datos (la pantalla es para orientarse de un vistazo) y estirar solo el gráfico con una
proporción fija (seguía dejando aire en la columna de texto).

---

## 2026-11-04 — Se trabaja directo en `main`, sin ramas

**Decisión.** Los commits van directo a `main`, sin ramas por funcionalidad.

**Por qué.** Hay una sola persona trabajando: las ramas solo agregaban pasos. `main` sigue siempre
funcionando, porque los hooks (formato, tipos y, antes de cada push, todos los tests) son los mismos.

---

## 2026-11-04 — Widgets de Contactos: solo lo que sirve en el día a día

**Decisión.** Los widgets de la columna de Contactos quedan en: próximo cumpleaños, próximo
recordatorio, resumen de la semana pasada (la lista de lo que cayó en los últimos 7 días, sin cifra),
cumpleaños por mes (barras de enero a diciembre, con el número de cada mes debajo y el mes actual en
otro color), deudas con contactos (*Tus contactos te deben*, *Les debés* y el próximo vencimiento) y
el aviso de contactos sin teléfono ni correo, más los avisos de "sin contactos" y "recordatorios de
hoy". Se sacaron *Tus contactos*, *Favoritos*, *Tus etiquetas*, *Empresas por rubro*, *Con quién más
gastaste*, *Historial de la semana* y *Recordatorios por repetición*, y sus datos de
`GET /api/contactos/widgets`. *Tus contactos te deben* es un ranking, para que haya más de un gráfico. El gráfico de barras acepta `resaltada` para elegir qué barra
destacar (por defecto, la última), `colorDeLaResaltada` para pintarla de otro color y `etiquetas`
para escribir una debajo de cada barra.

**Por qué.** Los que se sacaron describían la agenda (cuántos hay, cómo se reparten) pero no
ayudaban a hacer nada; lo que importa es qué viene (cumpleaños, recordatorios, vencimientos) y qué
falta arreglar (deudas, contactos sin datos). Las deudas solo cuentan las que son con un contacto:
las de un nombre escrito a mano ya están en Finanzas. Una deuda pasa a ser aviso a 7 días de su
fecha límite o si ya venció. Los montos nunca se suman entre monedas.

---

## 2026-11-03 — Datos de prueba: tres cuentas fijas en vez de escenarios

**Decisión.** `pnpm usuario:sembrar` carga siempre lo mismo: `iotero` (admin, con el panel lleno),
`dpaolillo1` (un año de uso) y `dpaolillo2` (vacía), más cuentas en distintos estados para el panel. Se
sacaron los escenarios sueltos (`--solo`, `--listar`) y la dependencia de `ADMIN_*` del `.env`: el admin de
prueba es siempre `iotero`. Detalle en `docs/funcionalidades.md`.

**Por qué así.**
- **Contraseñas cortas a pedido** (`iotero`, `dpaolillo1`): se registran con una válida y se les guarda el
  hash de la pedida, con el algoritmo de Better Auth. No se bajó el mínimo de la aplicación: el registro
  sigue exigiendo 8 caracteres, y el ingreso ya no exigía largo (para contraseñas viejas). Son cuentas de
  prueba con contraseñas publicadas en el repositorio: solo para ambientes de prueba.
- **Todo fechado hacia atrás** (altas, cambios de estado, auditoría, última conexión, contactos, deudas,
  recordatorios): un panel donde "todo pasó hoy" no muestra cómo se ve con uso real.
- **La carga no manda correos**, aunque haya SMTP en el `.env`: registrar cada cuenta disparaba el correo de
  verificación a direcciones `@ejemplo.test`, que rebotan y agotan el cupo diario del servidor de correo (pasó
  con el Gmail de desarrollo al cargar las 15 cuentas).
- **Un año sin reescribir las semillas**: Finanzas acepta cuántos meses y la semilla del azar, Tareas cuántos
  días de historial (se arma por tramos de 31 días, el máximo que arma el servicio por vez), y el histórico de
  recordatorios se genera por tramos de 60 días, como la limpieza periódica con la aplicación en uso. Los
  contactos de dpaolillo1 son una carga propia (`sembrar-contactos-de-un-anio.ts`) para que no se vea igual
  que el admin.
- **Saldos que dependen de lo que pasó**: a fin de mes se paga la tarjeta entera y se ahorra lo que sobra en
  el banco. Con montos fijos (pensados para seis meses), un año dejaba el BROU en -$ 111.000.

---

## 2026-11-03 — Ambiente de prueba en Render, en el plan gratuito

**Decisión.** Un ambiente de prueba en Render (gratis), descrito en `render.yaml`: **un solo servicio web con
la web y la API juntas** y una base PostgreSQL gratuita, sin SMTP. La producción sigue prevista en un VPS con
Coolify; esto es para probar y mostrar. Detalle en `docs/despliegue-render.md`.

**Por qué así.**
- **Web y API en el mismo servicio, con la web reenviando `/api/...`.** `onrender.com` está en la lista de
  sufijos públicos: dos subdominios suyos no comparten cookies, así que con dos servicios la web nunca vería la
  sesión que arma la API (y los navegadores bloquean cada vez más las cookies de terceros). El reenvío
  (`rewrites` de Next, activo solo con `URL_API_INTERNA`) deja todo en un mismo sitio. De paso hay un solo
  servicio que se duerme y se despierta, no dos.
- **Migraciones al arrancar y scripts desde la máquina local**: el plan gratuito no tiene "pre-deploy command"
  ni consola. El admin se crea con el script de siempre contra la base de Render (`contra-render.ts`), así la
  contraseña sigue sin quedar en ningún archivo.
- **Las URLs salen de `RENDER_EXTERNAL_URL`** y la base de `DATABASE_URL` (Render no da host ni puerto por
  separado en el Blueprint): no hay que cargar cada URL a mano.
- **Sin correo**, como se pidió: el enlace de verificación queda en el log del servicio.

**Arreglos que salieron al desplegar con https** (valen también para la producción):
- `proxy.ts` de la web no reconocía la cookie de sesión con el prefijo `__Secure-` que Better Auth usa con
  https: con sesión iniciada, redirigía siempre a /ingresar.
- `proxy.ts` también interceptaba `/api/...`: con la API detrás de la web, el propio pedido de ingreso se
  redirigía a /ingresar. Ahora `/api/` queda fuera.

**Sobre "sin servicios con plan gratuito limitado"** (CLAUDE.md): Render no es una dependencia del código; el
ambiente se puede tirar o mudar sin tocar nada de la aplicación. Sus límites (se duerme a los 15 minutos, la
base vence a los 30 días) están documentados.

**Alternativas descartadas.** Dos servicios (web y API) con un dominio propio en común para compartir cookies
(hace falta comprar un dominio); dos servicios con cookies `SameSite=None` (los navegadores las bloquean como
de terceros); un Dockerfile propio (más para mantener, y el entorno Node de Render alcanza).

---

## 2026-11-03 — Pantalla de inicio: un carrusel con el resumen de cada módulo, sin desplazamiento

**Decisión.** La pantalla de inicio dejó de ser una cuadrícula con todos los widgets de Finanzas y Contactos
(una mezcla larga y difícil de leer) y pasó a ser un **carrusel con un resumen por módulo** —Finanzas,
Calendario, Tareas y Contactos— que pasa solo cada 15 segundos y **entra entero en la ventana**. Cada resumen
tiene la misma forma: una cifra destacada, a lo sumo un aviso (el más grave), una lista corta y **un gráfico
con sus números escritos**. El detalle queda en cada módulo; los widgets siguen en la columna lateral de
Finanzas, Contactos y Tareas.

**Por qué así.**
- **Una sola cosa a la vez** (guía de usabilidad): un resumen por vista se entiende sin esfuerzo; la cuadrícula
  obligaba a recorrer una docena de tarjetas para encontrar lo importante.
- **Misma forma en los cuatro**: lo que cambia es el dato, no dónde buscarlo.
- **Gráficos con etiquetas escritas** (barras con el número arriba y el día o la semana abajo) en vez de mini
  gráficos sin ejes: en una pantalla para mirar de pasada, hay que leerlos sin interpretar escalas.
- **Sin endpoints nuevos**: cada resumen usa el pedido y la clave de caché de su módulo, así no hay dos cálculos
  del mismo dato y los resúmenes se ponen al día con cualquier cambio en el módulo. Los cuatro se piden juntos al
  entrar: pasar de uno a otro es instantáneo.
- **Se puede detener** (WCAG 2.2.2): botón de pausa, además de detenerse con el mouse encima y con el foco del
  teclado adentro; con reducir movimiento no avanza solo. Patrón de carrusel con pestañas de la WAI-ARIA: las
  pestañas dicen cuántos resúmenes hay y llevan directo a cualquiera, y la activa muestra cuánto falta para el
  cambio.
- **Sin desplazamiento vertical**: la pantalla marca su grilla con `data-pantalla-fija` y el marco de la
  aplicación pasa a medir el alto de la ventana (un selector `:has` en `globals.css`), sin que el marco tenga que
  saber de pantallas. En pantallas angostas se omite la lista y en las bajas se esconden detalles secundarios.
  **Por debajo de 560 px de alto la página vuelve a desplazarse**: un resumen cortado es peor que un
  desplazamiento.
- **15 segundos por resumen** (12 en los widgets laterales): un resumen tiene una cifra, una lista y un gráfico.
- **Cada resumen lleva el color de origen de su módulo** (ícono, barras y la barra de tiempo de su pestaña):
  es el mismo uso que en el calendario —distinguir módulos que se muestran juntos— y siempre va con ícono y
  nombre. Se actualizó la guía de estética (Colores).

**Alternativas descartadas.** Mantener la cuadrícula y achicarla (sigue siendo mucho para mirar de una vez);
mostrar los cuatro resúmenes a la vez en una grilla de 2x2 (no entran sin scroll con un gráfico legible cada uno,
y vuelve a ser una mezcla); un endpoint propio para el inicio (duplicaría cálculos que ya hacen los widgets);
una librería de carruseles (es poco código con Motion, que ya está, y la accesibilidad hay que cuidarla igual).

---

## 2026-10-22 — Tareas: las atrasadas de más de una semana fallan solas

**Decisión.** Una tarea pendiente (suelta o de repetitiva) que lleva más de 7 días atrasada se da por fallida
automáticamente. La semana cuenta desde el día siguiente al de la tarea; si la persona la devuelve a pendiente,
la cuenta arranca de nuevo desde ese momento.

**Por qué.** Al arrastrar también las repetitivas, una rutina que se descuida acumula atrasadas (hasta 31) y la
lista se vuelve inmanejable; tras una semana ya es improbable que se haga y la persona prefiere que quede como
fallida. Se evitó otra salida (borrarlas) para no perder el historial.

**Cómo.** Columna `reactivada_en` en `tareas` (se completa al deshacer una fallida o destildar una completada,
solo si de verdad cambió de estado). La lectura (`darPorFallidasLasVencidas`) falla las que cumplen el plazo y
les pone como momento el **final del día en que se cumplió**, igual que "fallar sola": así no ensucia "Fallidas
hoy" ni el avance de hoy. Sin `reactivada_en` el plazo se mide por el día de la tarea. Lo que ya estaba
atrasado de antes de este cambio falla en la primera lectura.

**Alternativas descartadas.** Un job aparte (una lectura ya hace todo lo demás y no hay nada que mantener al día);
no reiniciar el plazo al deshacer (la tarea volvería a fallar de inmediato y deshacer no serviría).

---

## 2026-10-22 — Tareas: historial con filtros, avance solo de hoy y secciones que se animan enteras

**Historial.** Antes se paginaba de a 14 días con tareas ("Ver días anteriores"). Ahora, por defecto, **7 días**
y filtros por fechas, estado, categoría y periodicidad **en el servidor** (una consulta con los filtros en el
`where`, un `left join` con la repetitiva para la periodicidad, tope de 1000 tareas). Se descartó filtrar en la
web porque el historial puede llegar a un año de tareas; se descartó seguir paginando porque con filtros por
fecha la persona ya elige cuánto ver, y una sola consulta acotada es más simple. Un rango se recorta a ayer y a
un año atrás.

**Avance de hoy.** El porcentaje cuenta solo las tareas de hoy. Con las atrasadas adentro (y arrastrando
repetitivas), una rutina olvidada tiraba abajo el día entero y completar una vieja lo inflaba: mezclaba "cómo me
fue hoy" con "lo que debo". Las atrasadas tienen su sección. El widget "Avance de hoy" y los
datos "hoy" de la API de widgets siguen la misma regla (solo lo de hoy; las atrasadas tienen su propio widget), para
que el widget y la pestaña no muestren números distintos.

**Secciones plegables.** Se abren con un solo movimiento: `Plegable` anima la altura del contenedor y su
opacidad, y la lista de adentro no hace su cascada de entrada. Antes el contenedor aparecía de golpe mientras los
elementos se deslizaban, y por un instante se solapaban. Se anima `height` (la guía lo permite en un elemento
acotado), recortando el contenido solo mientras dura la animación.

**Filas.** La casilla va centrada verticalmente en la fila y, en una atrasada, la cruz de "fallida" a su
derecha. Para eso `Casilla` aprendió a llevar algo `junto` a la caja y algo `debajo` de la etiqueta (sin
tacharlo), con el nombre accesible aparte (`nombre`), porque el contenido de la `<label>` ya no es solo el
título.

---

## 2026-10-22 — Tareas que se repiten "cada varios días"

**Decisión.** Una repetición más para las tareas, `intervalo` ("cada N días", N de 2 a 365), con una **fecha de
inicio** elegida (hoy por defecto) y hora opcional. El ciclo se cuenta desde esa fecha.

**Cómo.** Dos columnas nuevas en `tareas_repetitivas` (`cada_dias`, `fecha_inicio`) y los `check`s reescritos para
que cada repetición use solo lo suyo (migración `0028`). No se reutilizó `desde` (el día en que se creó la
regla, que sirve para no inventar un pasado): una cosa es desde cuándo existe la regla y otra desde cuándo se
cuenta el ciclo. El inicio no puede estar en el pasado (como las tareas sueltas), salvo el que la regla ya tenía
al editarla. Se agregó a `RepeticionDeTarea` pero **no** a la `Repeticion` de los recordatorios, que no la
necesitan; para el filtro del calendario se creó `RepeticionDeEvento` (las de siempre más `intervalo`) y solo las
Tareas ofrecen "Cada varios días".

**Por qué no "días de por medio" a secas.** "Cada N días" cubre día por medio (N=2) y todo lo demás con un solo
campo, sin casos especiales. N=1 se rechaza porque ya existe "Todos los días".

**Alternativas descartadas.** Reusar la semanal con dos semanas (no cubre "día por medio"); contar el ciclo desde
la fecha de creación (la persona quiere elegir cuándo arranca).

---

## 2026-10-22 — Tareas fallidas: las atrasadas de repetitivas se arrastran y se pueden dar por perdidas

**Decisión.** Una tarea tiene tres estados: pendiente, completada o **fallida**. Toda tarea que pasó su día
sin completarse —**suelta o de una repetitiva**— queda como atrasada y se arrastra. La persona tiene tres
salidas: tildarla, marcarla como fallida (ya no se va a hacer) o dejarla pendiente. Esto **reemplaza** lo
decidido el 2026-10-21 ("Las repetitivas no se arrastran como atrasadas"), a pedido de la persona.

**Cómo.** Columna `fallada_en` en `tareas` (migración `0026_tareas_falladas`), con un `check` que impide
estar completada y fallida a la vez, y el índice de pendientes la excluye. `PATCH /api/tareas/:id/fallida` solo
acepta tareas de un día anterior a hoy (409 con las de hoy o futuras: todavía están a tiempo). Tildar una
fallida la pasa a completada; deshacer la fallida la devuelve a atrasada. En la lista de hoy hay una sección
plegada "Fallidas hoy" (como "Hechas hoy") para poder deshacer un error; el historial muestra las fallidas y
cuenta "2 de 4 hechas, 1 fallida". En el calendario una fallida figura como `fallido` y se oculta por defecto
igual que lo completado (filtro por estado).

**Fallar sola (opcional por repetitiva).** Un checkbox al crear/editar una repetitiva, desmarcado por defecto,
hace que sus tareas pasen a fallidas cuando termina su día. Se guarda en la regla y **cada tarea armada lo copia**
(`falla_sola`), igual que el título: cambiar la regla rige desde hoy y lo ya armado no cambia de reglas a mitad de
camino. Se resuelve al leer, sin job, al final del día de cada tarea (así no ensucia "Fallidas hoy" ni el avance
de hoy). Deshacer una fallida automática apaga la opción en esa tarea: si no, volvería a fallar en la próxima
lectura y la persona no podría dejarla pendiente.

**Por qué se llama "fallida".** Fue el nombre de la persona; es corto y se entiende ("ya no la hice"). Todo el
texto vive en pocos lugares de la web por si se prefiere otro ("no hecha", "omitida").

**Costos asumidos.** Una rutina diaria que no se atiende acumula atrasadas: hasta **31** (el tope con el que ya
se arman las tareas al volver). Es lo que se pidió; la salida es marcarlas como fallidas. Una fallida cuenta como
no hecha para la racha, los rankings y el avance del día (no lo sube): marcar algo como fallido no es "hacerlo".

**Alternativas descartadas.** Acotar las atrasadas de repetitivas a los últimos días (menos ruido, pero oculta
cosas sin avisar); una acción masiva "marcar todas como fallidas" (puede venir después si molesta acumular).

---

## 2026-10-22 — Colores de origen y filtro por origen en el calendario

**Decisión.** Se agregó una paleta categórica de cuatro colores de origen a los tokens
(`origen-manual` naranja, `origen-finanzas` azul, `origen-contactos` violeta, `origen-tareas` rosa; cada uno con
`-fondo` y `-texto`, en claro y oscuro). En el calendario marcan de dónde viene cada evento: borde y insignia
en la lista del día, y **un punto por origen** (más el total de eventos si son varios) en cada día de la grilla.
Encima de la grilla, cuatro botones prendibles filtran por origen y a la vez hacen de leyenda; el filtro se
aplica en el cliente sobre lo ya pedido y se guarda en `localStorage` como la lista de orígenes **ocultos**.

**Por qué.** La primera versión marcaba los días con puntos grises y distinguía el origen solo con la
insignia: no se veía de un vistazo qué tenía cada día. Los colores ayudan a escanear, pero la guía de estética
reserva el color de estado y el acento para su significado, así que se creó una paleta aparte (distinta del
acento y de los tres estados) en lugar de reutilizar `exito`/`peligro`, que dirían otra cosa. Ningún significado
depende solo del color: cada origen va con ícono y nombre, y el texto sobre el fondo suave cumple 4,5:1 y el
color pleno 3:1 (test en `packages/ui-tokens`). Se guardan los ocultos y no los visibles para que un origen
nuevo aparezca visible sin migrar nada. Filtrar en el cliente es instantáneo y no pide nada de nuevo.

**Marca de cada día.** Cada día del mes lleva **un punto por origen que tenga algo**, sin importar cuántos
eventos sean, más el total en la esquina si son varios. Se probaron dos formas de mostrar "cuán cargado está
un día" y se descartaron: un fondo cada vez más intenso según la cantidad (no convenció: es un gris que no
dice de qué es la carga y compite con la pastilla del día elegido) y una barrita por evento hasta un tope (con
muchos eventos la casilla se llena de marcas, que es justo lo que se quería evitar). Un punto por origen tiene
un máximo natural de cuatro, no depende de cuántos eventos haya y se apoya en los colores de origen, y el
número de la esquina deja la cantidad a la vista sin dibujar nada más.

**Filtro avanzado por repetición.** Cada evento de Tareas y Contactos lleva su `repeticion` (`unica`, `diaria`,
`semanal`, `mensual`, `anual`; null en Finanzas y los manuales), que la API ya conocía (de la regla de la
repetitiva o del recordatorio) y ahora expone. La web filtra con `pasaElFiltro` (`packages/shared`, con tests)
sobre lo ya pedido y guarda **lo oculto** por origen en `localStorage`. Se hizo así y no con un campo de
búsqueda o categorías porque lo que pidió la persona es no ver "lo que se repite todos los días" y sí lo
semanal, mensual y anual: una rutina diaria enciende todos los días del mes y vuelve inútil el calendario
para ver lo demás. Para que no ocupe lugar fijo, el panel vive detrás de un botón "Más filtros" que avisa
cuántos tipos hay ocultos; en pantallas anchas flota sobre la grilla porque el calendario tiene alto fijo y
empujarlo la deformaba. Se aplica también a Contactos (los recordatorios tienen las mismas repeticiones) por
coherencia y sin costo extra.

**Completados: ocultos por defecto, a pedido.** Antes la API no devolvía las tareas tildadas; ahora las
devuelve con `completado: true` (las eliminadas siguen sin aparecer) y la web decide con el mismo filtro. Así
pedir "mostrar completadas" es instantáneo y no hace otro viaje, a cambio de unas pocas filas más por mes
(una tarea por día como mucho por repetitiva). Por defecto se ocultan porque el calendario es para ver lo que
falta; opt-in, guardado en este navegador, y a diferencia de lo demás se guarda como "mostrar" porque lo que
se cambia es el valor por defecto. Lo completado se distingue con **tachado + marca "Completada" + ícono** en
la lista del día y con un **punto vacío** en el mes (lleno si algo del día sigue pendiente); nunca solo con
color. "Mostrar todo" no toca esta opción: es un modo de ver, no una restricción de qué hay.
(Después el interruptor único pasó a un **filtro por estado**: Pendientes, Atrasadas y Finalizadas (completadas
y fallidas juntas), con solo Pendientes y Atrasadas prendidos por defecto. El estado se calcula en
`packages/shared` con `estadoDeEvento(evento, hoy)`. Se guardan los estados **ocultos** en
`gestoria:calendario:estados-ocultos`; una lista, aunque esté vacía, es una elección, y cualquier otra cosa
vuelve a los de por defecto. Lo guardado cuando "completada" y "fallida" eran dos estados se lee como
"finalizadas ocultas". La clave vieja `mostrar-completados` ya no se lee. El marcador del mes se resuelve con
`marcadorDeEventos`: pendiente > atrasada > finalizada, y con todo finalizado, completada / fallida / mixta
(los recordatorios de Contactos solo tienen "próximo" —círculo lleno— y "pasado" —círculo vacío—)
según cómo terminó, así un día con una sola tarea pendiente nunca parece cerrado.)
(Más tarde el filtro de estado pasó a ser **por categoría**: Tareas tiene Pendientes, Atrasadas y
Finalizadas, y Contactos, Próximos y Pasados, cada uno en su grupo de "Más filtros" junto a sus
repeticiones; Finanzas y los manuales no se filtran por estado, porque no lo tienen. Un único filtro para
todo obligaba a que "Finalizadas" significara también "recordatorios pasados" y "Pendientes" escondiera los
vencimientos de Finanzas. El estado de cada origen sale de `estadoParaFiltrar(evento, hoy)` y los ocultos se
guardan por origen (`{ tareas: [...], contactos: [...] }`, como las repeticiones) en la misma clave; lo
guardado como lista se lee como estados de las tareas, y si ocultaba las finalizadas también oculta los
recordatorios pasados, que es lo que pasaba antes.) Los recordatorios
de Contactos no se tildan, así que se consideran completados cuando **su día ya pasó** (antes de hoy en la
zona de la persona; el de hoy no): una regla simple que no inventa un estado nuevo para guardar. Los
vencimientos de deudas siguen sin completarse hasta que se saldan.

**Lo pendiente del calendario coincide con Tareas.** Una tarea de repetitiva de un día pasado sin hacer
se veía en el calendario pero no en Tareas (entonces las repetitivas no se arrastraban). Primero se resolvió
ocultándola del calendario; después se decidió arrastrarlas también en Tareas (ver "Tareas fallidas"), con lo
que ahora ambos módulos muestran lo mismo. Hay un test que compara ambas listas.

**Alternativas descartadas.** Un punto por evento (se llena con muchos); filtrar
en el servidor (un viaje más por cada clic, sin ventaja: ya se trajo todo el mes); guardar el filtro en la
cuenta (es una comodidad por dispositivo, no un dato de la persona).

---

## 2026-10-22 — El calendario arma los eventos al leer; solo los manuales se guardan

**Decisión.** El calendario muestra, por día, lo que aporta cada módulo (vencimiento de deudas pendientes de
Finanzas, recordatorios de Contactos, tareas pendientes de Tareas) más los eventos que la persona anota a
mano. Lo de otros módulos **no se copia**: cada módulo expone una función `eventosDe<Modulo>` (en su
carpeta, como los `widgets.ts`) que lee sus propias tablas y devuelve eventos de un tipo común
(`EventoDeCalendario`, en `packages/shared`); `servicios/calendario/eventos.ts` los junta, los ordena y los
devuelve por `GET /api/calendario/eventos?desde&hasta` (hasta 70 días: las seis semanas de un mes). Solo los
manuales viven en una tabla nueva, `eventos_de_calendario` (un día, hora opcional, notas, borrado lógico).
Los que se repiten (recordatorios, tareas repetitivas) se expanden con `ocurrenciasEnRango`, que usa la
misma pregunta de cada módulo ("¿cuál es el próximo día que cae, desde este?"), así el calendario no tiene
su propia versión de las reglas de repetición.

**Por qué.** Una tabla de eventos que copiara deudas, recordatorios y tareas habría que mantenerla
sincronizada al editar, completar o eliminar cualquiera de ellos, y se desfasaría ante el primer olvido.
Armarlos al leer cuesta una consulta por módulo sobre un rango chico (con índices ya existentes) y nunca
miente. Los repetidos tampoco se guardan por día: se guarda la regla y se calcula. Para tareas
repetitivas se agregan además los días futuros (que todavía no existen como fila), pero nunca antes de su
`desde`; para hoy y los pasados valen solo las filas reales.

**Reglas elegidas.** Solo cuentan las deudas no saldadas con fecha límite y las tareas pendientes (una
tildada ya no pide nada). Los eventos de otros módulos se ven pero no se editan en el calendario: llevan al
módulo de origen, que es el dueño del dato. El origen se indica con texto e ícono, no con color: el color
se reserva para el estado (docs/guias/estetica.md). Los manuales son de un solo día y sin repetición ni
hora de fin; un tope de 2.000 por persona evita abusos.

**Alternativas descartadas.** (1) Tabla única de eventos con copias de cada módulo: sincronización frágil.
(2) RRULE para los manuales (CLAUDE.md pide RRULE para recurrencias de calendario): no se pidió y los
repetidos ya se resuelven con recordatorios y tareas repetitivas; queda como mejora si hace falta, con una
dependencia a consultar antes. (3) Que el panel del día estire la pantalla con una lista larga: se prefirió
que mida lo mismo que el calendario y la lista se desplace por adentro.

---

## 2026-10-21 — Deudas con un contacto o con solo un nombre, y etiquetas de contactos por defecto

*Deudas.* Una deuda dejó de exigir un contacto: se elige "Un contacto" u "Otra persona o lugar" (un
texto). En la base, `contacto_id` pasó a admitir null y se agregó `nombre_libre`, con una restricción
(`num_nonnulls(contacto_id, nombre_libre) = 1`) que garantiza que haya uno solo de los dos. *Alternativa
descartada:* crear un contacto "de mentira" por cada nombre suelto: llenaba la libreta de contactos que
la persona no quería, y no se distinguía lo que es un contacto de lo que no. La lista dice con texto cuál
es cuál, y un contacto lleva a su ficha por `/contactos?contacto=<id>` (se eligió un parámetro de la
dirección porque sirve para enlazar desde cualquier pantalla y no necesita estado compartido; la
dirección se limpia al cerrar la ficha). La regla "un contacto, un nombre, ninguno de los dos" vive en
una función compartida (`avisosDeConQuien`) porque Zod no corre las reglas entre campos si otro campo ya
falló, y el formulario necesita avisar todo junto. *Efecto:* "contactos con deuda" cuenta solo contactos.
De paso se corrigió que la ficha de un contacto no mostraba su nombre.

*Etiquetas por defecto.* Cada persona arranca con Familia, Amigos, Trabajo y Servicios. Como borrar una
etiqueta es un borrado en duro, "si no tiene ninguna, se las crea" las habría resucitado al eliminar la
última; por eso hay una marca en el usuario (`etiquetas_iniciales_creadas`), que se reclama y se
siembra en una sola transacción (dos pedidos a la vez no las duplican ni ven la lista vacía). Se crean
al mirar las etiquetas por primera vez y no al registrarse, para que también las tengan las cuentas
existentes (si no tenían etiquetas propias) y no dependa de por dónde se creó la cuenta. Los tests
arrancan las cuentas ya marcadas (sin etiquetas) para contar solo lo que crean; `conEtiquetasIniciales`
las deja como una cuenta recién creada.

*Fecha límite.* Las deudas tienen una fecha límite opcional (`fecha_limite`, con la restricción de que no sea anterior a `fecha`). Se eligió `date` como el resto de las fechas de la deuda ("AAAA-MM-DD", sin zona), para que "vence el 31/12" sea ese día para cualquiera. No se muestra ningún estado de "vencida" ni se avisa nada todavía: se guarda el dato para generar avisos y recordatorios cuando se pida. Al editar, un campo ausente deja el límite como estaba y uno vacío lo quita, así un cliente que no lo conoce no lo borra sin querer.

*Widgets.* Más margen: la columna mide 336 px desde 1280 px de ventana (antes 288) y los carruseles se
separan 32 px (antes 20). El texto que no entra se desliza solo (ver Widgets de Finanzas).

---

## 2026-10-21 — Widgets de la columna lateral: dos carruseles por categoría, más grandes y más lentos

Los tres carruseles repartidos a la ronda mostraban demasiada información a la vez y la cambiaban cada
7 segundos, antes de poder leerla. Ahora la columna lateral tiene **dos carruseles, uno por categoría**:
arriba el de **texto** (cifras, curiosidades y avisos) y abajo el de **gráficos** (los que llevan un mini
gráfico: línea, barras, comparación, anillo, avance o ranking). Cada widget declara su `categoria` en
`DatoDeWidget` (campo obligatorio, así un widget nuevo no puede quedar sin clasificar), y
`ColumnaDeCarruseles` los separa; el módulo que arma los widgets no sabe cuántos carruseles hay. Si una
categoría no tiene widgets no se muestra su carrusel (sin períodos solo hay los de texto). Sumar una
categoría nueva (por ejemplo "lista") es agregarla a `CATEGORIAS_DE_WIDGET` y darle widgets: aparece
como un carrusel más.

*Por qué la categoría es un campo y no se deduce de si hay `visual`:* hoy coinciden (un gráfico lleva
`visual`, un texto no), pero la categoría es una decisión de dónde se muestra, y las próximas pueden no
depender del gráfico. A cambio hay que cuidar que coincidan; el test que recorre los widgets de la
columna lo cubre. Un widget que a veces lleva gráfico y a veces no (*Gasto por día*: con menos de dos días
no hay barras) cambia de categoría según los datos.

*Más grandes y más informativos.* Cada carrusel pasó de 192 a 256 px de alto y la tarjeta tiene una
versión `grande` (cifra de 30 a 36 px, texto de 14 px, gráficos más altos). Las de texto suman **datos de
apoyo** (`extras`: filas "etiqueta — valor", por ejemplo *Entró / Salió* en el disponible, *Pesa en tus
gastos* en el gasto más grande o el detalle por moneda de lo que te deben); la pantalla de inicio,
con tarjetas chicas, no los muestra. Los widgets siguen durando **12 segundos** (antes 7) y las demás
reglas del carrusel no cambian (flechas por fuera, pausa con mouse y teclado, reducir movimiento). *No se
ensanchó la columna* (sigue en 288 px): el contenido ya tiene poco ancho en ventanas medianas, y el
espacio de más lo daba la altura.

*Sin huecos ni palabras cortadas.* La primera versión (288 px de alto, contenido pegado arriba) dejaba
espacios en blanco abajo y cortaba con puntos suspensivos cifras largas ("US$ 120,00 · …"), nombres
("Ali…") y datos de apoyo. Se probó mirando capturas de cada widget con datos reales y se resolvió así:
(1) la tarjeta **reparte el alto**: los gráficos (líneas, barras) crecen para llenarlo y los rankings y
comparaciones distribuyen sus filas; (2) las de texto con poco que mostrar (sin gráfico y a lo sumo un
dato de apoyo) **agrandan la cifra y el detalle y se centran**; (3) **nada se corta con "…"**: las
cifras largas achican la letra y pasan a otro renglón, los nombres del ranking y los datos de apoyo se
parten en renglones; (4) los avisos y el resto de los widgets de texto llevan datos de apoyo propios
(las cuentas en rojo, los presupuestos pasados, lo que te queda del presupuesto...). El alto bajó a 256
px: con 288 el contenido de la mayoría no alcanzaba para llenarlo. *Costo aceptado:* con muy pocos datos
(un ranking de una sola fila) igual queda aire, porque no hay más para mostrar.

---

## 2026-10-12 — Widgets: contenido de la pantalla de inicio y carrusel contextual en la columna lateral

*Actualización 2026-10-21:* los tres carruseles pasaron a ser dos, por categoría (ver la decisión de esa fecha, más arriba).

*Actualización 2026-10-14:* las flechas solo aparecen con el mouse sobre el carrusel (antes, siempre
visibles), los carruseles quedaron un poco más separados (20 px) y las dos columnas laterales se
pueden esconder (ver más abajo, "Columnas laterales plegables").

Los widgets dejaron de ser un lugar reservado. En **`/inicio`** ya no hay columna de widgets aparte:
sus widgets (cifras, curiosidades y avisos de cada módulo sobre la persona) *son* el contenido
principal y ocupan el espacio de las dos columnas, porque esa pantalla no tiene otra cosa que mostrar.
En el resto de las pantallas la columna derecha es **contextual**: cada página pasa sus widgets a
`EstructuraDeApp` (`widgets=`), Finanzas muestra los suyos en un **carrusel** y las pantallas que no
tienen (administración) se quedan con dos columnas en vez de una tercera vacía o un cartel de "más
adelante". Un solo carrusel arriba de todo dejaba casi toda la columna (que mide el alto de la
ventana y acompaña el scroll) vacía, así que son **tres carruseles**: la lista se reparte a la ronda
entre ellos, para que los avisos más graves queden a la vista a la vez. Primero se repartieron de punta
a punta de la columna y quedaron demasiado separados; ahora van **juntos y centrados**, con margen de
sobra arriba y abajo. Los tres duran lo mismo y arrancan a la vez, así que cambian juntos (una versión
anterior les daba ritmos distintos, 7, 8,5 y 10 segundos, para que no parpadeara toda la columna; se
descartó a pedido de la persona usuaria: cambiar a la vez se ve más ordenado). Cada carrusel tiene su
propio temporizador, así que solo se desfasan si alguien interviene en uno: tocar una flecha lo
reinicia y detenerlo con el mouse o el teclado lo pausa, sin tocar a los otros. Los módulos nuevos suman sus widgets escribiendo una función que arme una lista de
`DatoDeWidget`; el carrusel y la tarjeta no saben de ningún módulo.

*Un solo pedido.* Los datos salen de `GET /api/finanzas/widgets`, que no recibe parámetros (el
servidor elige el período abierto o, si no hay, el más reciente) y arma todo reutilizando los
servicios de resumen, estadísticas comparativas y presupuestos. *Alternativa descartada:* que el
cliente pidiera resumen, estadísticas, presupuestos y cuentas por separado y armara los avisos: eran
cuatro o cinco pedidos en cada visita a la pantalla de inicio y la decisión de cuándo avisar (un
presupuesto al 80 %, una cuenta en rojo) quedaba en el cliente, contra el principio de que la lógica
de negocio vive en la API y la comparten web, móvil y la futura entrada por lenguaje natural. La API
devuelve **datos y no frases**: el texto de cada widget se escribe en el cliente.

*Carrusel: solo flechas, por fuera de la tarjeta.* Cada carrusel tiene únicamente dos flechas, una a
cada lado y fuera de la tarjeta, siempre visibles. Antes eran pestañas que aparecían encima de los
bordes de la tarjeta al pasar el mouse, y tapaban parte del contenido (cifras alineadas a la derecha);
sacarlas afuera costó ensanchar la columna lateral de 260 a 288 px (la tarjeta queda de ~232 px). Se descartaron, a pedido de la persona usuaria,
el contador o paginado ("1 de 3", puntos) y la barra de tiempo restante, que se probó antes (era el
propio temporizador, pero se sentía de más). Al no haber fila de controles debajo de la tarjeta, cada
carrusel ocupa unos 40 px menos y los tres entran en ventanas más bajas. Se detiene con el mouse encima
o con el foco del teclado (`:focus-visible`: tocar una flecha con el mouse deja el foco ahí y no debe
dejar el carrusel quieto). *Costo aceptado:* no hay botón de pausa explícito; WCAG 2.2.2 pide un
mecanismo para frenar el contenido que se mueve solo más de 5 segundos, y detenerse con el mouse o el
foco lo cubre solo en parte (quien no puede apuntar con el mouse ni navegar con el teclado hasta el
carrusel no puede frenarlo). Se puede volver a agregar si hace falta, junto a una de las flechas. Con
la preferencia de reducir movimiento **no avanza solo** (lo que molesta es el movimiento). Mientras
avanza solo no anuncia los cambios a los lectores de pantalla; sí al detenerlo o navegar a mano. Se
sigue al widget por su `id` y no por su posición, para que una actualización de datos no lo cambie de
lugar. En la pantalla de inicio, donde sobra espacio, se muestran **todos a la vez** en una cuadrícula:
ciclar escondería información sin necesidad.

*Variedad de widgets.* No todos los widgets son una cifra con una frase: cada uno lleva la forma que
mejor cuenta su dato (línea, barras, anillo, barra de avance, ranking o comparación; ver
`docs/funcionalidades.md`). `DatoDeWidget` tiene un `visual` opcional y la tarjeta se arma según su
tipo, sin saber de qué módulo viene. Los gráficos son SVG y `div`s hechos a mano, **sin librería**: el
módulo ya usa Recharts en las estadísticas, pero a este tamaño no hacen falta ejes, leyendas ni
tooltips, y la guía de rendimiento pide no sumar peso al cliente. La API sigue devolviendo datos (series
de números), no dibujos ni frases. Los gráficos son decorativos para los lectores de pantalla porque
el texto de la tarjeta ya dice lo mismo.

*Columnas laterales plegables.* Tanto el menú como los widgets se pueden esconder con una pestaña
pegada al borde de la ventana (pedido de la persona usuaria: por si prefiere no ver los widgets).
Decisiones: (1) *Esconder una columna no toca nada más de la pantalla.* Una primera versión achicaba la
columna a cero y el contenido se ensanchaba y se recentraba: la persona lo vio como que "se afectaba el
resto de la pantalla" y pidió lo contrario. Ahora la grilla conserva sus tres anchos y la columna se
desliza hacia su borde, se desvanece y queda invisible; el lugar queda vacío. *Costo:* esconder una
columna no le da más ancho al contenido (que de todos modos tiene un ancho máximo por pantalla). (2) *El
estado lo lleva un atributo de `<html>`* (`data-menu` y `data-widgets` en "cerrado"), no estado de React.
Un script inline antes del primer pintado lo pone leyendo `localStorage`, igual que el tema: si lo
hiciera React después de hidratar, quien dejó una columna escondida la vería abierta un instante y luego
irse sola. Eso obliga a que el servidor y el cliente difieran en los atributos de `<html>`, por eso se
agregó `suppressHydrationWarning` a esa etiqueta (que además silencia un aviso de desarrollo que ya
producía el script del tema). `useSyncExternalStore` deja que los botones lean el atributo sin
desajustes de hidratación. (3) *Es una preferencia del dispositivo y no de la cuenta*, como el tema: no
hay endpoint ni columna en la base. Si algún día hace falta que viaje entre dispositivos, es un campo
más del usuario. (4) *Escondida es "invisible", no solo fuera de lugar*: así sale del orden de
tabulación y del árbol de accesibilidad; la visibilidad cambia al final al esconder y al principio al
mostrar, para no cortar la animación. (5) *Las pestañas son `fixed` y no viven dentro de las
columnas*: así siguen ahí cuando la columna ya no se ve. (6) *Diseño de la pestaña.* Una primera
versión era un botón gris con una flecha que cambiaba de dirección de golpe, y se pidió algo más
llamativo y animado. Ahora: cerrada se llena de acento (es lo que la hace fácil de encontrar), la
flecha gira con un resorte (con `initial={false}`: si no, arrancaba en 0° y giraba en cada carga de
página), un solo pulso al esconder la columna (no infinito: una animación que nunca termina distrae y
la guía de estética pide animación con intención), se asoma al pasar el mouse y muestra un cartel con lo
que hace. Todo con `transform` y `opacity`. Es una excepción acotada a "un solo acento por pantalla":
la pestaña cerrada es la única forma de recuperar la columna. *Descartado:* un botón dentro de la
propia columna (desaparece junto con ella) y guardar la preferencia en la cuenta (más costo para algo
que cada dispositivo puede querer distinto).

 cambia de widget solo y sus textos coinciden con los de la
pantalla de Finanzas, `finanzas.spec.ts` corre con reducir movimiento (se queda en el primer widget);
el avance automático se prueba aparte, en `widgets.spec.ts`, con el reloj falso de Playwright.

---

## 2026-10-03 — Campos de importe: texto con separador de miles en lugar de type="number"

Para mostrar los miles separados mientras se escribe se reemplazó el `<input type="number">` de
los cuatro campos de dinero por un campo de texto (`inputMode="decimal"`, que en el móvil sigue
abriendo el teclado numérico). *Por qué:* un campo numérico nativo solo admite dígitos, el punto y
el signo, y el navegador decide cómo mostrarlo; no hay forma de agregarle separadores.
*Alternativas descartadas:* una librería de máscaras (dependencia nueva para algo acotado, y la
guía pide consultar antes) y formatear solo al salir del campo (la persona no ve los miles
mientras escribe, que era el pedido). El formato se arma con `Intl` (no a mano) y vive en
`packages/shared` para poder probarlo con tests unitarios; el componente solo maneja el cursor y
los eventos. *Decisiones de comportamiento:* un punto escrito vale como decimal (la tecla del
teclado numérico) porque los miles se ponen solos y nadie necesita escribirlos; un importe pegado
se interpreta por una regla (último separador = decimal; uno solo y con tres dígitos detrás =
miles) en vez de suponer el formato. *Costo:* se pierden las flechitas de subir y bajar del campo
numérico (en un importe nadie las usaba) y la validación del navegador (`min`, `max`, `step`), que
ya se hacía con Zod.

---

## 2026-10-03 — Importes en bigint y tope de 9.999.999.999

El tope de un importe pasó de 10.000.000 a 9.999.999.999 (pedido por la persona usuaria). Con
las columnas `integer` de 32 bits (centésimos, unos 21 millones) no entraba, así que los cinco
campos de dinero (`movimientos.importe_centavos`, `cuentas_financieras.saldo_inicial_centavos`,
`ajustes_de_saldo.saldo_indicado_centavos` y `diferencia_centavos`,
`presupuestos.monto_centavos`) pasaron a `bigint` con la migración `0012`: es un ensanchamiento,
no pierde ni altera datos. En Drizzle son `bigint({ mode: "number" })`, que se leen como número
de JavaScript (exacto hasta 2^53 centésimos, unos 90 billones: sobra). *Descartado:* guardar
como `numeric` (devuelve texto y obliga a convertir en todos lados) o como texto/BigInt de
JavaScript (complica todo el código por un rango que no hace falta). **Había además un error
latente**: las sumas SQL (ingresos y gastos del período, saldo de cuentas, estadísticas,
presupuestos) se convertían con `::integer`, así que sumar varios importes grandes fallaba con
"integer out of range" mucho antes del tope; ahora se convierten con `::bigint` y `mapWith(Number)`.
Otro detalle: una consulta cruda (el historial de la cuenta) devuelve las columnas `bigint`
como texto, por lo que sus montos se convierten con `Number(...)` al armar la respuesta.
El 9.999.999.999 se interpretó así a partir de "9.999.9999.999" (dígitos repetidos al tipear).

---

## 2026-10-03 — Transferencias: casilla en el formulario y categoría fuera de las listas

Se cambió la forma de cargar una transferencia y se escondió su categoría. Antes había que
elegir "Transferencia entre Cuentas" en el selector de categorías, y esa categoría aparecía en
la lista de categorías marcada "Especial" y sin botón de eliminar: no se podía eliminar, ni
reemplazar y confundía a quien la veía mezclada con las suyas. Ahora el formulario de movimientos
tiene una casilla "Es una transferencia entre mis cuentas" y la categoría es un detalle interno:
no se lista, no se ofrece y no se filtra por ella (las transferencias se filtran con
"Transferencias", que es un tipo). **El modelo de datos y la API no cambian**: la categoría sigue
existiendo, identificada por `sistema = 'transferencia'`, y el cliente la asigna sola al marcar
la casilla (la API sigue exigiendo que una transferencia use esa categoría y que nadie más la
use). *Descartado:* quitar la categoría del modelo y dejar la transferencia sin categoría
(obligaría a cambiar la columna, las consultas, el reemplazo y los datos ya cargados, para un
problema que era solo de pantalla). *Consecuencia:* como se filtra en el cliente, quien llame a
la API directamente la sigue viendo, y la categoría ya no se puede renombrar ni recolorear desde
la interfaz; su nombre queda reservado (no se puede crear otra categoría igual).

---

## 2026-10-03 — Períodos: reabrir uno cerrado y eliminar uno (con sus movimientos)

**Reabrir.** Se puede reabrir un período cerrado si no hay otro abierto, como se pidió, **y**
si es el último. La segunda condición no se pidió pero no es opcional: un período cerrado tiene
un fin, y reabrirlo se lo quita, así que pasa a extenderse hacia adelante; si ya existía uno
posterior se pisarían, y "dos períodos no se solapan" es una regla de fondo (los movimientos
caerían en dos períodos a la vez). *Descartado:* reabrir el anterior moviendo o recortando al
posterior (cambia datos que la persona no tocó) y permitirlo igual (rompe la regla). La barra
ofrece el botón solo cuando se cumple; la API responde 409 con el nombre del período que lo
impide. Se mantiene el nombre, la apertura y los movimientos: solo se quita el cierre.

**Eliminar.** Primero se decidió permitirlo solo sin movimientos; se cambió el mismo día: se
puede eliminar siempre, y si tiene movimientos **se eliminan con el período**, con un aviso que
dice cuántos y que no hay vuelta atrás. Se hace una baja física de los movimientos (también de los
ya eliminados por la persona), en una sola transacción: el período de un movimiento es obligatorio,
así que no hay otro lugar donde dejarlos, y reasignarlos a otro período falsearía su fecha. Es el
único caso del módulo donde el borrado lógico se vuelve físico. *Alternativa descartada:* un
borrado lógico del período con sus movimientos (permitiría deshacer, pero obligaría a filtrar
períodos eliminados en todo el módulo y a liberar su nombre aparte; nadie la pidió y sumaría
complejidad). **Los saldos no se tocan a mano**: se calculan al leer a partir de los movimientos
(ver "Cuentas"), así que quitar los movimientos los revierte de forma exacta, incluidas las
transferencias (una sola fila que afecta a origen y destino). Los ajustes manuales de saldo no
pertenecen a un período y se conservan; el efecto es que el saldo de una cuenta ajustada puede
dejar de coincidir con el "saldo indicado" del historial, porque ese número era el saldo en ese
momento, con los movimientos de entonces. Para que el aviso diga cuántos movimientos se pierden,
el listado de períodos trae `cantidadMovimientos`, calculado con una sola consulta agrupada. Si un
movimiento se carga justo mientras se elimina, la clave foránea frena la operación, la transacción
se revierte y se responde 409 para reintentar.

---

## 2026-10-02 — Categorías con id numérico y color distinto, transferencias entre cuentas y reemplazo en lugar de eliminar

**Id numérico en las categorías.** `categorias.id` pasa de `uuid` a un entero autogenerado, a
pedido (como `periodos.id`); el nombre sigue siendo único, ahora también por un índice único
parcial (`lower(nombre)` entre las no eliminadas) y no solo por el servicio. La migración
(`0009`) crea la columna numérica al lado, reescribe `movimientos.categoria_id` y
`presupuestos.categoria_id` por join y recién después reemplaza la columna vieja, así que no
se pierde ninguna relación; probada en una transacción que se revierte con datos de ejemplo
(incluido un nombre repetido, que se desempata con "(2)" antes de crear el índice). Un
`ALTER TYPE` directo no servía: los uuid no se convierten en números. El servicio comparaba
nombres con `ILIKE`, donde `_` y `%` eran comodines ("R_pa" coincidía con "Ropa"); ahora se
compara con `lower(...) = lower(...)`.

**Colores: una función, no una paleta a ojo.** `colorMasDistinto` (shared) elige entre unos
~150 candidatos (matices cada 10° en cuatro combinaciones de saturación/luminosidad, más dos
grises) el que maximiza la distancia mínima a los colores en uso, midiendo en CIE L*a*b* (ΔE
de 1976, suficiente para esto). Con ella se calculó el set por defecto en cadena empezando por
el amarillo de las transferencias (11 colores, distancia mínima entre pares ≈ 42, verificada
por un test) y se usa para las categorías nuevas (también cuando se reemplaza por una nueva).
Es determinista, lo que permite probarla. *Descartado:* elegir al azar de una paleta corta
(lo que había: se repetían y se parecían); y una librería de colores (dependencia nueva para
una cuenta chica). Para las cuentas existentes, dos migraciones de datos (`0010`, `0011`)
actualizan a los colores nuevos solo las categorías por defecto que nadie tocó (mismo nombre y
todavía el color de siembra, o el gris previo a los colores); las renombradas o recoloreadas
quedan como están. Un motivo concreto: "Entretenimiento" estaba en ámbar, casi igual al
amarillo de las transferencias.

**Transferencias: un movimiento "neutro" con cuenta de origen y de destino.** Se interpretó que
la "nueva categoría neutro" del pedido es un nuevo **tipo** de movimiento (junto a ingreso y
gasto), no una categoría más. Se guarda como **una sola fila** (`cuenta_destino_id` nueva,
nula salvo en transferencias) y no como dos filas enlazadas (una de salida y otra de entrada):
con una fila, editar o eliminar la transferencia actualiza las dos cuentas atómicamente y no
puede quedar una mitad huérfana ni con montos distintos; el costo es que las consultas de saldo
e historial miran las dos columnas. Dos `check` en la base lo sostienen: `tipo = 'neutro'` ⇔
hay destino, y destino ≠ origen. El saldo resta la transferencia en el origen y la suma en el
destino; ingresos, gastos, balance, presupuestos y estadísticas ya filtraban por tipo, así que
la ignoran sin cambios. La cuenta de destino cuenta como "con movimientos" (no se puede
eliminar) y el listado filtrado por cuenta incluye las transferencias que le llegan.

**Categoría especial identificada por código.** `categorias.sistema = 'transferencia'`
(índice único parcial: una por usuario) en lugar de buscarla por nombre, porque el nombre se
puede cambiar. Se puede renombrar y recolorear pero no eliminar ni reemplazar, no admite
presupuesto, y la regla se cierra en los dos sentidos en el servicio: una transferencia solo
usa esa categoría y esa categoría solo la usan transferencias. Se crea al pedir las categorías
(también para quienes ya tenían de antes, con inserción `ON CONFLICT DO NOTHING` que resiste
pedidos simultáneos); no va en una migración por el mismo criterio de "datos de la cuenta" del
resto del set. Si había una común con el mismo nombre, se le agrega "(propia)": adoptarla habría
mezclado ingresos y gastos con la especial.

**Dónde se ofrece.** La categoría aparece en el formulario de movimientos y el botón
"Transferir" en el panel de cuentas solo con dos o más cuentas **activas** (no ocultas). Elegir
la categoría cambia el formulario (sin tipo; origen y destino) y el mismo formulario, con una
bandera, es el diálogo del panel de cuentas: un solo camino de código para las dos entradas. La
categoría de transferencias no se recuerda como "última usada" (proponerla por defecto sería un
error esperando). Una transferencia necesita un período como cualquier movimiento: desde el
panel de cuentas, sin período abierto, el formulario avisa junto a la fecha.

**Color del tipo neutro: amarillo en el punto, ámbar en el texto.** El pedido fue amarillo. El
amarillo puro no se lee sobre el fondo claro, así que el punto de la categoría usa el amarillo y
el texto, los montos y las insignias usan el token ámbar (`advertencia`), el mismo que ya usa
el sistema para ese tono. Ícono propio (flechas cruzadas) y sin signo: no depende solo del
color.

**Eliminar vs. reemplazar una categoría.** Con movimientos no se elimina (409); se **reemplaza**
por otra existente o nueva y todo lo histórico se ajusta, en una transacción: todos sus
movimientos (también los eliminados lógicamente, para que ninguno apunte a una categoría
borrada) pasan a la elegida, el presupuesto se mueve si el destino no tiene uno (si lo tiene, se
conserva el del destino), y la original se elimina. *Decisión sobre el presupuesto:* conservar el
del destino es lo menos destructivo, porque no hay forma de combinar dos límites sin inventar
una regla. Se rechaza, sin tocar nada, reemplazar por sí misma, por la especial, por una eliminada
o ajena. No hay "deshacer": hay una confirmación explícita.

---

## 2026-10-02 — Cuentas: ajustes manuales de saldo, historial y ocultar en lugar de eliminar

**El saldo inicial editable se reemplaza por ajustes con historial.** Hasta ahora el
saldo inicial de una cuenta se podía corregir en cualquier momento (decisión del
2026-10-01): era un dato pisado, sin rastro de qué había antes. Se pidió poder cargar lo
que hay "hoy" en cada cuenta sin que sea un movimiento del período **y** que cada cuenta
lleve su historial de esos cambios. Resultado: la tabla nueva `ajustes_de_saldo`; el saldo
inicial solo se fija al crear la cuenta (y se muestra en el historial como dato) y todo
cambio posterior es un ajuste: `saldo = inicial + movimientos + ajustes`. *Descartado:*
convertir el ajuste en un movimiento especial (rompe "no es del período" y contamina los
totales); y guardar el saldo como columna actualizada (se desincroniza al editar o borrar
movimientos, ya se había decidido calcularlo al leer).

**Un ajuste guarda lo indicado y la diferencia.** `saldoIndicadoCentavos` (lo que dijo la
persona) y `diferenciaCentavos` (lo que movió el saldo, con signo, calculado por el
servidor contra el saldo que la cuenta mostraba). La diferencia es lo que suma; lo indicado
es lo que se muestra en el historial ("Saldo indicado: $ X"). No se calcula un "saldo
después de cada renglón" repitiendo la historia por fecha: con movimientos de fecha futura
quedaría inconsistente, y no hace falta para entender el historial. Los ajustes son
inmutables y no se borran. Es una foto de ese momento: si en paralelo se carga un
movimiento, el saldo resultante puede diferir del indicado (no hay bloqueo entre los dos
pedidos; con un grupo reducido de usuarios no vale la complejidad).

**Historial unificado con `UNION ALL`.** Movimientos y ajustes se listan juntos con una
sola consulta paginada (más el total, sumando dos conteos), ordenados por fecha. La API
devuelve el efecto con signo sobre el saldo en ambos casos, así el cliente no repite la
regla de ingreso/gasto. Se distinguen con una insignia, no solo con color. Se agregó el
tono "info" a la insignia (mismos colores que el aviso informativo) para el ajuste manual.

**Saldo calculado con consultas agrupadas separadas.** Unir movimientos y ajustes a la
cuenta con dos `LEFT JOIN` multiplicaría las filas y descuadraría las sumas; se agrega
cada uno por cuenta en su propia consulta y se junta en el servicio.

**Ocultar vs. eliminar.** Una cuenta con movimientos no se puede eliminar (409); se puede
ocultar (`ocultaEn`), y deja de ofrecerse al cargar un movimiento nuevo. Sin movimientos
(los eliminados lógicamente no cuentan) sí se puede eliminar. Una cuenta oculta **sigue
sumando al disponible**: es plata que se tiene, el ocultar es sobre qué se ofrece al cargar
movimientos. Decisión tomada sin consultar: si preferís que no sume, es una línea en
`obtenerResumen`. Un movimiento existente en una cuenta que luego se oculta se puede seguir
editando sin cambiarle la cuenta; mover un movimiento a una cuenta oculta o duplicarlo se
rechaza. *Sobre datos viejos:* las cuentas ya eliminadas lógicamente que tenían movimientos
(posible hasta ahora) quedan eliminadas, sin convertirlas en ocultas: no se migraron.

---

## 2026-10-01 — Períodos propios en lugar de meses calendario

**Qué.** Resumen, movimientos, presupuestos y estadísticas dejan de agruparse por mes y
pasan a agruparse por **período**: un tramo de tiempo que abre y cierra la persona, con
fecha y hora. Reglas (detalle de uso en `docs/funcionalidades.md`): uno solo abierto a la
vez; sin solapamientos pero con huecos permitidos; al cerrar se ofrece abrir el siguiente,
que continúa en el instante del cierre; nombre único por usuario, sugerido a partir del
mes de apertura con número incremental si ya existe; cada movimiento pertenece a un solo
período.

**Intervalo semiabierto `[apertura, cierre)`.** El período incluye su apertura y no su
cierre. Así el siguiente puede abrir exactamente en el cierre del anterior —lo que
significa "continuar"— sin que un movimiento justo en ese instante caiga en los dos.

**El movimiento pasa de `date` a `timestamptz`, y el período se deduce de la fecha.**
Como los períodos tienen hora, un movimiento solo con día no alcanza para decir a cuál
pertenece cuando un período cierra a mitad de día. Se guarda además `periodoId` (la
relación explícita que pidió el requerimiento, indexada para los totales); el servidor lo
calcula al crear o editar y lo vuelve a verificar al cerrar un período (el cierre debe ser
posterior al último movimiento). Una fecha fuera de todo período se rechaza: es lo que
mantiene la invariante "ningún movimiento fuera del rango de su período". *Descartado:*
dejar `fecha` como día y elegir el período a mano (permite movimientos fuera de rango y
los totales dejan de coincidir con las fechas); y fecha libre con `periodoId` como simple
etiqueta (mismo problema).

**Identidad numérica interna.** `periodos.id` es un entero autogenerado que la persona
nunca ve; los movimientos lo referencian. El nombre es solo una etiqueta única por usuario
(índice único sobre `lower(nombre)`), así que renombrar no toca ningún movimiento. Es una
excepción a los `uuid` del resto del módulo, a pedido: el identificador no se expone en la
interfaz y la API siempre filtra por usuario, así que un id correlativo no filtra nada.

**La base garantiza lo que puede; el solapamiento lo valida el servicio.** Con índices: un
solo abierto por usuario (índice único parcial), nombre único, y `cierre > apertura`
(`check`). Que dos períodos no se solapen lo comprueba `abrirPeriodo` en el servicio. Una
restricción de exclusión (`EXCLUDE USING gist`) lo garantizaría en la base, pero exige la
extensión `btree_gist`, que no está en el stack definido y habría que habilitarla en cada
entorno; el riesgo que se acepta es una carrera entre dos pedidos simultáneos de la misma
persona, muy improbable con un grupo reducido de usuarios. Si el uso crece, se reconsidera.
Lo que sí se resolvió sin carrera: los dos únicos escenarios simultáneos plausibles (dos
aperturas a la vez, un nombre repetido) caen en los índices únicos y se traducen a
errores claros.

**Reglas de fechas.** La apertura no puede ser futura (los movimientos de hoy quedarían
sin período) ni anterior al cierre de otro período (el abierto no tiene cierre, así que
pisaría a los siguientes). El cierre no puede ser futuro, tiene que ser posterior a la
apertura y a todos los movimientos del período. Sin cierre explícito se usa la hora del
servidor, no la del cliente, para no depender del reloj del dispositivo.

**Presupuestos y estadísticas.** El presupuesto sigue siendo un límite por categoría sin
historial, y vale igual para todos los períodos; lo que cambia es contra qué gasto se mide
(el del período elegido). La evolución muestra los últimos 6 períodos hasta el elegido;
como pueden durar distinto, las barras son orientativas. El resumen compara contra el
período inmediato anterior por apertura.

**Pantallas.** Una barra de período común a las pestañas (selector, rango, renombrar,
cerrar y abrir). Sin período abierto, "Agregar movimiento" avisa y ofrece abrir uno. Se
quitaron los filtros "Desde/Hasta" del listado: dentro de un período no aportaban y el
período ya recorta la lista. Un hallazgo de implementación: al pasar de un diálogo a otro
(cerrar un período y ofrecer el siguiente), el evento `close` del primer `<dialog>` llega
después y limpiaba el estado del segundo; cada diálogo ahora limpia el estado solo si sigue
siendo el suyo.

**Migración de datos (`0007`).** Los movimientos existentes se convierten a las 12:00
locales del usuario (no tenían hora) y se les arma un período por cada mes calendario con
movimientos, en la zona del usuario, con nombre "Setiembre 2026"; el del mes actual queda
abierto, y las fechas posteriores a este mes caen en ese período abierto (no tiene cierre,
así no se superpone con uno cerrado). Incluye los movimientos eliminados lógicamente, que
también necesitan período. El SQL generado por drizzle-kit se retocó a mano porque no sabe
migrar datos. Se probó con datos de ejemplo en una transacción que se revierte.

**Formato regional.** `Intl` con `es-UY` da "setiembre" (la grafía uruguaya) y no
"septiembre": es la correcta para la región por defecto del proyecto, y los nombres de
período sugeridos la usan.

---

## 2026-10-01 — Ajustes al módulo de ingresos y gastos: color por categoría, saldo corregible y un bug de accesibilidad compartido

**Color por categoría.** Se agregó una columna `color` (`#rrggbb`) a `categorias`, con
`check` de formato en la base. Se eligió un `<input type="color">` nativo en vez de un
selector de paleta propio: sin dependencia nueva, el navegador ya resuelve su UI y da
cualquier color, no solo los de una paleta fija. Las categorías nuevas proponen un color
al azar de una paleta corta (mismo criterio que los colores de las categorías por
defecto) para no obligar a elegir uno, pero sigue siendo editable.

**Categoría "Ingresos" agregada a las 9 por defecto.** Pensada para sueldos y otras
entradas de dinero. No hay una partición dura entre "categorías de ingreso" y "de
gasto": es una categoría más, que el usuario puede usar donde le sirva.

**El saldo inicial de una cuenta ahora se puede corregir en cualquier momento, no solo
al crearla.** El pedido original lo había dejado fijo tras la creación; en el uso real
hace falta poder decir "esto es lo que tengo ahora" en cualquier momento (por ejemplo,
si no se cargó bien al principio), sin que cuente como un ingreso del mes. Como el saldo
mostrado siempre se calcula al leer (`saldoInicialCentavos` + movimientos), corregirlo
no reescribe ningún movimiento existente ni genera uno nuevo.

**Bug encontrado al probar en navegador: id fijo en `Dialogo`.** El componente
compartido `Dialogo` (`apps/web/src/componentes/ui/dialogo.tsx`) usaba
`id="dialogo-titulo"` fijo para su `<h2>`, referenciado por `aria-labelledby`. Mientras
una pantalla tuviera un solo diálogo a la vez (como el panel de admin, hasta ahora) no
se notaba; el módulo de finanzas monta varios a la vez con normalidad (por ejemplo,
"Agregar movimiento" junto con "Editar"/"Eliminar" de una lista), y ahí los ids
chocaban: el `aria-labelledby` de un diálogo podía terminar apuntando al título de otro.
Se cambió a un id generado con `useId()`, único por instancia. Encontrado probando a
mano en el navegador, no por los tests automáticos de accesibilidad (axe no lo marcaba:
los diálogos en conflicto estaban cerrados —`<dialog>` sin `open`— al momento del
chequeo, y el navegador no les da caja ni los incluye en el árbol de accesibilidad).

**Colores de ingreso/gasto: verde y rojo, consistentes en todo el módulo.** Decisión
anterior (2026-09-30) evitaba el rojo para "gasto" porque el token `peligro` tiene su
significado reservado (error/vencido). Pedido explícito del usuario: usar rojo para
egresos y verde para ingresos, con más peso visual (flechas más grandes y de trazo más
grueso). Se aplicó de punta a punta —flechas y montos en movimientos, barras del
gráfico de evolución— para que sea un único criterio, no una excepción en un solo lugar.

---

## 2026-09-30 — Módulo de ingresos y gastos: moneda única, nombres de tabla y accesos móviles

**Una sola moneda por usuario.** `docs/guias/convenciones.md` dejaba pendiente si manejar
varias monedas o no. Se resolvió por **una sola**, la de `usuarios.monedaPorDefecto`: ni
cuentas ni movimientos guardan su propia moneda, y no hay conversión. Es lo que permite
que el resumen muestre un balance único y claro "en pocos segundos" (pedido explícito de
usabilidad); con monedas mezcladas, "el balance" dejaría de ser un solo número. Si más
adelante hace falta multi-moneda real, es una decisión aparte, no una ampliación de esta.

**`cuentas_financieras`, no `cuentas`.** Better Auth ya usa la tabla `cuentas` para las
cuentas de proveedor (OAuth). Los medios de pago del usuario (efectivo, banco, tarjeta...)
se guardan en `cuentas_financieras` para no chocar ni confundirse con esa.

**Categorías y cuentas por defecto, sembradas por usuario, no por migración.** Cada
persona recibe las 9 categorías y las 4 cuentas por defecto la primera vez que el
servicio las lista (si todavía no tiene ninguna). Quedan como datos normales de su
cuenta, que puede renombrar o borrar igual que a las que crea ella misma (CLAUDE.md,
"Categorías, monedas y similares como datos, no hardcodeadas"), sin tocar el flujo de
registro de Better Auth.

**Borrado lógico en categorías y cuentas, no solo en movimientos.** La guía de seguridad
pide borrado lógico para "datos de usuario" como los gastos; acá se extendió a categorías
y cuentas por una razón distinta: borrarlas de verdad rompería la referencia de los
movimientos viejos que las usan. Con `eliminadoEn` se ocultan de los selectores sin que un
movimiento histórico pierda su categoría o su cuenta.

**Recharts para los gráficos.** El stack no tenía ninguna librería de gráficos. Se eligió
Recharts (MIT) en vez de construir barras y líneas a mano, por ser la opción estándar para
React con menos código propio que mantener; se carga de forma diferida para no engordar
las demás pestañas del módulo (ver `docs/librerias.md`).

**Acceso en pantallas angostas: un ícono por módulo, no escalable.** El menú de
navegación de la izquierda se oculta por debajo de `md`. Hasta ahora "Admin" tenía un
ícono de respaldo en la barra superior para esos casos; "Finanzas" suma un segundo ícono
con el mismo patrón. Funciona con dos módulos, pero no escala: el tercer módulo va a
necesitar un menú propio para pantallas angostas (por ejemplo, un menú desplegable) en vez
de seguir agregando íconos a la barra.

---

## 2026-09-27 — Marco de tres columnas para las pantallas de la aplicación

**Decisión.** Antes de empezar el primer módulo real, se definió la estructura visual
que van a compartir todas las pantallas con sesión iniciada: tres columnas —navegación
a la izquierda, contenido en el medio (la más ancha) y widgets a la derecha, que por
ahora solo reserva el lugar. `EstructuraDeApp` la implementa con CSS grid
(`220px_minmax(0,1fr)_260px`), y cada página la compone explícitamente en su
`page.tsx`, en vez de un layout de ruta implícito: es más fácil de leer en un proyecto
que también es de aprendizaje (CLAUDE.md, "no ocultar complejidad detrás de magia"), y
evita que una pantalla quede adentro del marco sin que se note por qué.

**Columnas laterales fijas mientras se scrollea.** Se resolvió con `position: sticky`
y no `fixed`: `sticky` "acompaña" el scroll hasta que la columna se termina, así que si
el día de mañana el menú o los widgets crecen más que una pantalla, no quedan cortados
sin forma de llegar al final (con `fixed` sí pasaría). El tope de la columna coincide
con la altura del Navbar a través de una variable compartida (`--alto-navbar`), para
que las dos cosas no se puedan desincronizar si alguna cambia de tamaño.

**Responsivo.** Con las tres columnas fijas en ancho, no entran en una pantalla
angosta. Se ocultan en dos pasos en vez de uno: primero los widgets (`lg`, 1024px),
por ser lo menos esencial; si todavía no entra, también la navegación (`md`, 768px).
El enlace al panel de admin, que ahora vive en el menú de navegación, se duplica en la
barra superior pero solo visible por debajo de `md` (`md:hidden`): así nunca hay una
pantalla donde ese destino sea inalcanzable, sin mostrar el mismo enlace dos veces a la
vez.

**Descartado.** Un layout anidado de Next.js (`app/(app)/layout.tsx`) habría evitado
repetir `<EstructuraDeApp>` en cada página, pero es exactamente el tipo de "magia" que
el proyecto evita: qué marco tiene una pantalla dejaría de verse en su propio archivo.

---

## 2026-09-27 — Todas las cuentas sembradas quedan con el correo confirmado

**Decisión.** `pnpm usuario:sembrar` tenía dos escenarios que dejaban el correo sin
confirmar a propósito (`pendiente-nueva`, `aprobada-sin-confirmar`), para mostrar que
aprobación y verificación son dos requisitos independientes. Se sacaron: ahora **todas**
las cuentas sembradas quedan con el correo confirmado, admin incluido. Pedido explícito:
la verificación de correo de verdad (crear una cuenta y tocar el enlace) se prueba a
mano, así que dejarla sin confirmar en un escenario sembrado no sumaba nada.

**Por qué se sacaron esos dos escenarios en vez de solo confirmarles el correo.** Con
todo confirmado, `pendiente-nueva` quedaba idéntico a `pendiente-confirmada` (misma
cuenta: pendiente y con el correo confirmado) y `aprobada-sin-confirmar` quedaba
idéntico a `aprobada`. Mantenerlos como alias duplicados de otro escenario no aportaba
nada y complicaba elegir con `--solo`. `pendiente-confirmada` se renombró a `pendiente`
al quedar como el único escenario en ese estado.

---

## 2026-09-27 — `pnpm usuario:sembrar` también crea (o reusa) el admin

**Decisión.** `pnpm usuario:sembrar` dejó de depender de que ya exista un admin: ahora se
asegura de que exista la cuenta de `ADMIN_USUARIO`/`ADMIN_NOMBRE`/`ADMIN_APELLIDO`/
`ADMIN_EMAIL` del `.env` (los mismos datos que usa `pnpm usuario:admin`) y le atribuye
**todas** las acciones sembradas. Reemplaza al diseño anterior (2026-09-22): buscar
cualquier admin existente y, si no había ninguno, dejar las acciones como "Acción por
consola". Pedido explícito: después de vaciar la base de desarrollo con
`--borrar-todo`, no quedaba ningún admin y no había forma de entrar al panel sin correr
otro comando aparte.

**Contraseña fija, pero nunca la de un admin real.** Si la cuenta ya existe (de una
corrida anterior, o de un `pnpm usuario:admin` de verdad) se reusa tal cual, sin tocarle
la contraseña. Si no existe, se crea con la contraseña fija `"adminadmin"` — nunca con la
de un admin real, que sigue pidiéndose por consola y sin guardarse en ningún archivo
(`crear-admin.ts` no cambió). La lectura de las variables del `.env` se compartía por
copiar y pegar entre los dos scripts; se extrajo a `apps/api/src/scripts/datos-admin.ts`
para que no pudieran desincronizarse.

---

## 2026-09-27 — `gestion_test` queda vacía después de correr toda la suite

**Decisión.** Cada test de integración y end-to-end ya vaciaba `gestion_test` antes de
correr (`beforeEach`/`test.beforeEach`), pero nada la vaciaba después del último: la
corrida terminaba con lo que hubiera dejado ese último test, no con la base como estaba
antes de arrancar. Se agregó un `globalSetup` de Vitest
(`apps/api/src/pruebas/limpieza-global.ts`) y un `globalTeardown` de Playwright
(`apps/web/e2e/limpieza-global.ts`), cada uno corriendo una sola vez al final de toda la
corrida (no por test), que vacían las mismas tablas que ya vacía cada test individual.

**Por qué no alcanzaba con el `beforeEach` de cada test.** Ese `beforeEach` garantiza que
cada test arranca de cero, pero nada corre después del último test de la corrida: ese
vacío queda para quien mire la base después (o para la _próxima_ corrida, que de todos
modos la vuelve a vaciar al principio, pero mientras tanto la base no refleja lo que
había antes).

**Por qué no una transacción con rollback.** Envolver toda la suite en una única
transacción que se revierte al final evitaría el problema de raíz, pero los tests de
integración pegan peticiones HTTP reales a través de Hono, que abre su propia conexión
por pedido: no hay una única transacción que pueda compartirse entre esas conexiones sin
reescribir cómo se maneja el cliente de base en los tests. Vaciar dos veces (antes de
cada test y una vez más al final) es más simple y ya usa exactamente el mismo mecanismo
que ya existía.

**Decisión.** Nuevo script (`apps/api/src/scripts/sembrar-datos-de-prueba.ts`) que carga
varias cuentas de prueba, cada una pasando por una secuencia de estados con sentido
(registro → confirmación del correo antes o después de que un admin la resuelva →
aprobación, rechazo, bloqueo o reseteo de contraseña), en vez de dejarlas directo en el
estado final. El objetivo es poder mirar el panel de admin (Cuentas, Auditoría, el perfil
de una cuenta) y ver algo creíble, no una cuenta que "nació aprobada" sin ningún rastro.

**Por qué no reusar las fábricas de los tests.** Tanto `apps/web/e2e/utilidades.ts` como
`apps/api/src/pruebas/auth-de-prueba.ts` arman el estado con un `UPDATE` directo
(`ponerEstado`, `verificarEmail`): rápido y sin auditoría, que es exactamente lo que un
test necesita (no le importa el historial, solo el estado final) y exactamente lo que
este script no puede usar. Cambiar esas fábricas para que auditen habría roto tests que
hoy esperan el historial vacío (por ejemplo "sin acciones todavía muestra el estado
vacío"). Quedan separados a propósito.

**Bloquear y resetear contraseña van directo a la fila, no por Better Auth.** El plugin
de admin de Better Auth (`auth.api.banUser`, `auth.api.setUserPassword`) exige una sesión
real en el contexto (`ctx.context.session`), que un script no tiene. En vez de fabricar
una sesión falsa, el script escribe los mismos campos que esos endpoints tocarían
(`banned`, `banReason`, `debeCambiarPassword`) directo con Drizzle y registra la
auditoría a mano, igual que ya se resolvió para `pnpm usuario:aprobar`. Para el reseteo
de contraseña ni siquiera hace falta generar una contraseña temporal de verdad: lo único
que el escenario necesita demostrar es `debeCambiarPassword`, no el hash.

**Nombres fijos, no aleatorios, con una forma de evitar choques.** A diferencia de las
fábricas de test (que generan un sufijo único por llamada para poder correr mil veces
sin chocar), acá cada escenario tiene usuario y correo fijos y descriptivos
(`franco.bloqueado`, `carla.aprobada`...), para reconocerlos de un vistazo en el panel.
El costo es que correrlo dos veces sin `--borrar-todo` pisaría cuentas existentes; se
resuelve salteando con un aviso el escenario que ya existe, y con `--borrar-todo` (con
confirmación, o `--forzar` para saltearla) para el que prefiere empezar de cero.

---

## 2026-09-22 — `pnpm usuario:aprobar` también audita

**Decisión.** Aprobar o rechazar una cuenta con `pnpm usuario:aprobar` quedaba fuera de
la auditoría: el script llama al servicio directo, sin pasar por la ruta del panel que
registra la acción. Alguien que aprobara así una cuenta la veía activarse, pero la
acción no aparecía en el historial de nadie —ni en Auditoría ni en el perfil de esa
cuenta—, sin ningún aviso de que faltaba.

**Con qué admin se registra.** El script no tiene sesión: no hay a quién atribuírsela.
Se registra con `adminId: null` en vez de inventar una cuenta "sistema" o pedirle un id
por parámetro. La tabla ya toleraba `adminId` nulo (la FK usa `onDelete: "set null"` para
cuando se borra el admin), así que no hizo falta ningún cambio de esquema, solo ensanchar
el tipo `NuevaEntradaAuditoria` que lo exigía como `string`.

**Un texto distinto al de "cuenta eliminada".** Antes, un `adminId` nulo y un `adminId`
que apuntaba a una cuenta ya borrada cascadeaban al mismo texto ("(cuenta eliminada)"),
que para una acción que nunca tuvo admin es engañoso. Ahora `EntradaDeAuditoria`
distingue los dos casos: "Acción por consola" para el primero, "(cuenta eliminada)" solo
para el segundo.

**Lo que quedó afuera.** El script también permite `--pendiente` (volver una cuenta
aprobada o rechazada a pendiente), que no tiene un tipo de acción en
`ACCIONES_AUDITORIA` ni existe como opción en el panel. Inventar uno para un caso de uso
manual y excepcional no valía la pena todavía; ese camino sigue sin quedar registrado.

---

## 2026-09-22 — Perfil de cuenta: una fecha de estado, una última conexión calculada

**Decisión.** El perfil de una cuenta (`/admin/cuentas/:id`) pedía mostrar tres fechas
distintas según el estado (solicitud, aprobación, rechazo) y agregar "última conexión".
En vez de tres columnas para las fechas, `usuarios` tiene una sola,
`estadoActualizadoEn`: se pisa cada vez que cambia el estado, así que mientras la cuenta
sigue pendiente coincide con la fecha de creación y en cuanto se resuelve pasa a ser esa
fecha. También ordena el listado de Cuentas, de la más reciente a la más vieja: al
revés que Solicitudes (una cola a procesar en orden), Cuentas es un feed de actividad
donde lo que se acaba de resolver tiene que aparecer primero, no perderse al final.

**Última conexión sin columna propia.** En vez de agregar `ultimaConexionEn` a
`usuarios` (que habría que recordar tocar en cada login), se calcula con
`MAX(sesiones.updatedAt)` para esa cuenta. Better Auth ya extiende esa columna en cada
sesión activa (`session.updateAge`), así que el dato ya estaba ahí; guardarlo de nuevo en
otro lado era el mismo riesgo de desincronización que ya se había evitado con
`estadoActualizadoEn` para las otras fechas.

**Historial reutilizado, no reescrito.** El perfil muestra el mismo historial que la
pestaña de Auditoría, filtrado por `objetivoId` (con su propio índice), a través del
mismo componente (`EntradaDeAuditoria`). Con el nombre del objetivo siempre a la vista en
el encabezado de la página, repetirlo en cada fila del historial era redundante; se
agregó una redacción alternativa por acción ("bloqueó esta cuenta" en vez de "bloqueó
a") para que la oración no quedara cortada al ocultarlo.

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

---

## 2026-09-17 — Bloquear, desbloquear y listar del panel llaman directo a Better Auth

**Decisión.** El panel de admin no tiene rutas propias para bloquear (`ban-user`) ni
desbloquear (`unban-user`) una cuenta: la web las llama directo con
`authCliente.admin.banUser` / `unbanUser`, igual que ya hacía `changePassword`. Lo propio
del proyecto sobre esas dos acciones —dejarlas en la auditoría— lo agrega un hook `after`
en `crear-auth.ts`, que corre después de la ruta de Better Auth sin envolverla.

**Por qué.** `apps/api/src/rutas/auth.ts` ya establece la regla de no reimplementar rutas
de Better Auth, y bloquear una cuenta no tiene ninguna lógica propia que agregar: Better
Auth ya cierra las sesiones abiertas y ya impide que un admin se bloquee a sí mismo. Armar
un endpoint propio solo para poder auditar hubiera significado reescribir esas dos
protecciones o confiar en que el cliente nunca las salteara.

**El hook `after` corre también si la ruta de Better Auth falló** (por ejemplo, al
intentar auto-bloquearse), porque la sesión ya está cargada en el contexto antes de que el
endpoint valide nada. Por eso el hook descarta el caso de error mirando si
`ctx.context.returned` es una instancia de `APIError`, tanto acá como en el de
`/change-password`.

**El reseteo de contraseña es la excepción** con ruta propia
(`POST /api/admin/cuentas/:id/resetear-password`): necesita generar la contraseña
temporal en el servidor, y no hay endpoint de Better Auth que la genere y la devuelva.

---

## 2026-09-17 — La contraseña temporal del reseteo la genera el servidor, no el admin

**Decisión.** Al resetear la contraseña de una cuenta desde el panel, no hay ningún campo
para que el admin escriba una contraseña: el servidor genera 16 caracteres al azar
(`crypto.randomBytes(12).toString("base64url")`) y los muestra una sola vez, con un botón
para copiarlos. No queda guardada en ningún lado en texto plano, ni en la base ni en el
log.

**Por qué.** Dejar que el admin eligiera la contraseña agrega una superficie de error
(contraseñas débiles, repetidas entre cuentas, anotadas en algún lado) sin ninguna
ventaja: de cualquier forma hay que comunicársela a la persona por otro medio, y con
`debeCambiarPassword` prendido esa contraseña dura hasta el primer ingreso.

---

## 2026-09-17 — El diálogo de confirmación usa `<dialog>`, no una librería nueva

**Decisión.** `Dialogo` (bloquear, desbloquear, resetear contraseña, rechazar una
solicitud) está construido sobre el elemento nativo `<dialog>` con `showModal()`.

**Por qué.** `showModal()` ya trae foco atrapado, cierre con Escape y una capa de fondo
propia (`::backdrop`), que es exactamente lo que pide docs/guias/usabilidad.md para
confirmar una acción destructiva o irreversible. Construirlo a mano (o sumar una
dependencia) habría significado reimplementar el atrapado de foco, que es la parte más
fácil de hacer mal.

---

## 2026-09-17 — `authCliente` necesita un import de tipos que no se usa en valor

**Decisión.** `apps/web/src/lib/auth-cliente.ts` importa `AccessControl` y `Role` de
`better-auth/plugins/access` solo para reexportarlos, sin usarlos en ningún valor.

**Por qué.** Con `adminClient()` sumado a los plugins, TypeScript no puede nombrar el tipo
inferido de `authCliente` sin esos dos tipos (error TS2883, "cannot be named without a
reference"): `declaration: true` en la config base exige que todo tipo exportado sea
"portable", y `adminClient()` arma su tipo con `AccessControl`/`Role` de un módulo que el
archivo no importaba. Traerlos al alcance del archivo —aunque no se usen como valores— es
lo que le permite al compilador nombrarlos.

---

## 2026-10-03 — Antes de proponer un commit se valida el índice con el hook, y el commit se arma completo

**Decisión.** Al terminar un paso, se hace `git add` de todo lo que lo compone (sin dejar
archivos a medias entre el índice y el árbol de trabajo) y se corre
`pnpm exec lefthook run pre-commit` antes de proponer el mensaje de commit. Si hay trabajo
de otro paso en curso que no entra en el commit, se avisa en vez de dejarlo mezclado.

**Por qué.** El hook `pre-commit` de Lefthook revisa el *índice*: aparta los cambios sin
stagear mientras corre, pero los archivos sin trackear siguen en disco. Con un commit
parcial (por ejemplo, el panel de admin en el índice y el módulo de finanzas sin stagear)
el chequeo de tipos ve archivos nuevos que importan código que "todavía no existe" en esa
versión del índice y falla con decenas de errores, aunque el árbol completo esté limpio
(`pnpm lint` y `pnpm typecheck` pasan). Parece un problema de lint, pero es un snapshot
incoherente.

**Alternativas descartadas.** Quitar el chequeo de tipos del hook (pierde la red de
seguridad) o saltear los hooks con `--no-verify` (prohibido por docs/guias/convenciones.md).

---

## 2026-10-03 — En las estadísticas, un "día" es un bloque de 24 horas desde la apertura

**Decisión.** El ritmo de gasto y el gasto promedio por día cuentan los días como bloques de 24
horas desde el instante en que abrió el período (el día 1 son sus primeras 24 horas), no como
días de calendario.

**Por qué.** Un período lo abre y cierra la persona, no es un mes calendario: puede arrancar a
las 15:30 de un miércoles. Alinear los períodos por "número de día" necesita un día que sea
igual para todos, y las 24 horas desde la apertura lo son sin mirar la zona horaria de la
persona (que obligaría a agrupar en SQL por día local y a lidiar con cambios de hora). El costo
es que el "día 1" no coincide con el día del calendario; se acepta porque lo que se compara es
la altura relativa dentro de cada período, no la fecha.

**Alternativas descartadas.** Días de calendario en la zona de la persona (más fiel a lo que ve,
pero un período que arranca a mitad del día tendría un día 1 corto y desalinearía la
comparación); y comparar por fecha absoluta (no sirve entre períodos distintos).

---

## 2026-10-03 — `formatearPorcentaje` pasa a `packages/shared`

**Decisión.** El formato de porcentajes (`Intl.NumberFormat` con `style: "percent"`) vive en
`packages/shared/src/formato/porcentaje.ts`, junto a los de montos y fechas.

**Por qué.** Lo usaban el gráfico de evolución de gastos por categoría y la nueva comparación de
categorías; docs/guias/convenciones.md pide formatear siempre con utilidades compartidas.

---

## 2026-10-03 — Los bloques de estadísticas se presentan en orden aleatorio

**Decisión.** En la pestaña Estadísticas, los datos rápidos van siempre arriba y los otros cinco
bloques se mezclan. El orden se sortea una vez por visita a la pestaña (o al cambiar de período) y
no se vuelve a sortear mientras se está en ella. La categoría de "Evolución de gastos por categoría" también
se sortea al abrir, entre las que tuvieron gastos en el período.

**Por qué.** Lo que queda abajo se mira menos, y con un orden fijo siempre sería lo mismo. Sortear
una sola vez por visita evita que algo se mueva mientras la persona lee o apunta con el mouse: el
sorteo en cada render sería inestable. Se sortea entre las categorías con gastos porque una categoría
vacía mostraría un estado vacío en el lugar del gráfico.

**Costo asumido.** Va en contra de la consistencia que pide docs/guias/usabilidad.md (lo mismo, en el
mismo lugar): se acepta a pedido del usuario, y se compensa con que cada bloque es una región con
nombre y con que el orden no cambia dentro de una visita. Por lo mismo, los tests ubican los bloques
por su nombre y nunca por su posición (`bloque(page, nombre)` en apps/web/e2e/finanzas.spec.ts).

---

## 2026-10-03 — "Evolución de gastos por categoría" muestra solo gastos

**Decisión.** Se quitó de la pantalla el selector "Qué mirar" (gastos o ingresos) de la evolución
de una categoría: ahora solo muestra lo gastado.

**Por qué.** Pedido del usuario: simplifica el bloque (un control menos) y los ingresos ya se ven en
el gráfico de ingresos y gastos.

**Qué quedó igual.** El endpoint `GET /api/finanzas/estadisticas/categoria` conserva el parámetro
`tipo` (`gasto` por defecto, o `ingreso`) con sus tests: es un servicio reutilizable (docs/guias:
formularios, jobs y la futura IA usan los mismos servicios) y quitarlo no simplifica la pantalla.
Si más adelante no hace falta, se puede borrar junto con sus tests.

---

## 2026-10-03 — El balance por período se dibuja como una barra apilada, no como línea ni como barras negativas

**Decisión.** En "Ingresos y gastos de los últimos períodos" cada período es una sola barra: lo gastado
(rojo) y, si sobró plata, lo que sobró (verde) hasta lo ingresado, con una raya que marca lo que entró y
un tramo rayado para lo gastado de más.

**Por qué.** Los dos primeros intentos fallaron con un período en déficit grande: (1) una línea de balance
sobre las barras estiraba el eje hacia abajo, aplastaba las barras y dibujaba una curva que atravesaba todo,
además de sugerir una continuidad entre períodos que no existe; (2) un segundo gráfico de balance, aparte,
arreglaba la escala pero sumaba un gráfico y separaba el resultado de las cifras que lo producen. La barra
apilada tiene un eje desde cero (la altura es la mayor de las dos cifras) y muestra, en una sola figura,
cuánto entró, cuánto salió y el resultado.

**Costo asumido.** Las barras se dibujan con una forma personalizada de Recharts (`shape`) para poder
trazar la raya de lo que entró a lo ancho exacto de cada barra, y la leyenda es HTML propio porque la de
Recharts no sabe describir un tramo rayado ni una raya. Alternativas descartadas: selector entre dos
vistas (esconde el balance), barras de progreso por tasa de gasto y gráfico de dos puntas por período.

---

## 2026-10-04 — Varias monedas: cuentas con moneda, tipo de cambio guardado en cada movimiento

**Decisión.** Cada cuenta financiera tiene su moneda (`cuentas_financieras.moneda`, código ISO) y todos sus
importes están en ella. La moneda base de la persona sigue siendo `usuarios.monedaPorDefecto` (UYU) y es en la
que se expresan totales, balance, presupuestos y estadísticas. **Reemplaza** la decisión de moneda única del
2026-09-30. Cada movimiento guarda, además de su importe, el **tipo de cambio** con el que se convirtió, el
**importe ya convertido** y si la cotización fue **manual** (`tipo_de_cambio`, `importe_convertido_centavos`,
`cambio_manual`). En un ingreso o gasto, "convertido" es el importe en la moneda base; en una transferencia, lo
que llega a la cuenta de destino (en su moneda).

**Por qué guardar el importe convertido y no recalcularlo.** Los totales históricos no pueden cambiar porque el
dólar se mueva: lo gastado en marzo vale lo que valía cuando se gastó. Además la suma queda exacta (centésimos
enteros) y rápida (se suma una columna ya calculada, sin consultar cotizaciones). El costo es una columna más y
que una cotización mal cargada se corrige editando el movimiento.

**Cómo se fija la cotización.** Tres caminos, a elección de la persona: la **automática** (la de la fecha del
movimiento), una **escrita** a mano (el banco que da mejor cambio) o **deducida** de los dos importes (entregó X,
recibió Y). Al editar se conserva la guardada salvo que se pida otra: una cotización es parte de lo que se
registró. La conversión la hace siempre el servidor, con enteros grandes (`bigint`) y redondeo al centésimo más
cercano (la mitad, lejos del cero); nunca punto flotante.

**De dónde salen las cotizaciones.** De la API pública *fawazahmed0/currency-api* (datos de mercado, sin clave ni
límite de uso, con histórico por fecha), servida por dos CDN que publican lo mismo; **no hay otra fuente**.
Se probó contra los servicios reales: la alternativa más conocida, Frankfurter (datos del BCE), **no tiene UYU ni
ARS**; uy.dolarapi.com tenía datos viejos y valores dudosos. Se había agregado *open.er-api.com* como respaldo y se
sacó: es el plan gratuito de un servicio comercial, con atribución obligatoria y límite por IP, y CLAUDE.md pide
no depender de planes gratuitos limitados.

**Siempre primero la base.** Los clientes nunca llaman a la fuente: lo hace la API, y antes de hacerlo mira la tabla
`cotizaciones` (datos de mercado, sin `userId`). Un pedido a la fuente trae las cotizaciones de **todas** las
monedas de un día y se guardan todas, así que se pide como mucho una vez por día y, para un día pasado, una vez en
la vida. La de hoy tampoco se renueva (la fuente publica una vez por día): lo guardado se usa hasta que cambia el
día. Si la fuente no responde se usa la guardada más cercana de la última semana (marcada como desactualizada) y,
si no hay, la persona escribe la cotización: **nunca se bloquea cargar un movimiento**. Tras un fallo no se insiste
durante un minuto, y las dos CDN se consultan a la vez (vale la primera que responde). No se usó un job de pg-boss
(no está instalado todavía): se trae a demanda.

**Cómo se dice una cotización.** Se guarda siempre de la moneda de la cuenta a la de destino, pero se muestra y
se escribe con la que más vale como unidad ("1 USD = 40,28 UYU", no "1 UYU = 0,0248 USD"): evita errores al
escribirla. El orden de valor de las monedas es una lista corta en `packages/shared/src/finanzas/cambio.ts`.

**El disponible es una estimación.** Suma el saldo de cada cuenta, convertido a la cotización de hoy cuando es de
otra moneda: cambia solo con el mercado, no con un movimiento. La interfaz lo marca "(estimado)"; si de alguna
moneda no hay cotización, esas cuentas no suman y se avisa.

**Alcance.** Monedas admitidas: UYU, USD, ARS, EUR y BRL (lista en `packages/shared/src/finanzas/monedas.ts`;
agregar otra es agregar una línea, sin migración). La moneda de una cuenta no se puede cambiar. Los datos
existentes se migraron sin pérdida (`0013_multimoneda`): cada cuenta tomó la moneda base y cada movimiento quedó con
cambio 1. Fuera de alcance: cotización "habitual" por cuenta (solo por movimiento), comisiones, monedas de más de
dos decimales y conversión de los totales históricos a otra moneda base.

## 2026-10-04 — Los e2e usan su propia carpeta de compilación de Next

**Decisión.** `next.config.ts` toma la carpeta de compilación de `NEXT_DIST_DIR` (por defecto `.next`) y
Playwright levanta su servidor con `.next-e2e`.

**Por qué.** Next no deja correr dos servidores de desarrollo sobre la misma carpeta, y quien trabaja suele tener
`pnpm dev` abierto: el e2e fallaba con "Another next dev server is already running". Con carpetas distintas
conviven. `.next-e2e/` está en `.gitignore`. Un detalle: `next dev` reescribe `apps/web/next-env.d.ts` (ignorado
por git) apuntando a la carpeta que usa; después de un e2e se regenera solo al volver a levantar `pnpm dev`.

## 2026-10-20 — Contactos: personas y empresas en una sola tabla, con los campos de cada tipo en columnas propias

**Decisión.** `contactos` guarda personas y empresas/servicios juntos (`tipo`). Los campos propios de cada tipo
(apellido y fecha de nacimiento; rubro, sitio web, horario, documento y persona de contacto) son columnas que el
otro tipo deja en nulo, y dos `check` de la base lo garantizan. Teléfonos y correos van en tablas aparte
(`telefonos_de_contactos`, `correos_de_contactos`) y las etiquetas en una tabla propia con un vínculo muchos a
muchos. El tipo no se puede cambiar una vez creado el contacto.

**Por qué.** Comparten casi todo (nombre, teléfonos, correos, dirección, notas, etiquetas, favorito,
recordatorios) y se listan, buscan y filtran juntos: una sola tabla evita un `union` en cada consulta. Teléfonos y
correos son varios por contacto y hay que buscar por ellos, así que columnas `jsonb` habrían complicado la
búsqueda sin ahorrar nada. **Descartado:** dos tablas (`personas` y `empresas`) y una tabla de "datos
adicionales" clave-valor (flexible, pero sin tipos ni restricciones: justo lo que la base debe garantizar).

## 2026-10-20 — Los recordatorios de contactos avisan solo dentro de la aplicación, y la próxima fecha se calcula al leer

**Decisión.** Un recordatorio guarda un título, una repetición (una vez, diaria, semanal, mensual o anual) y
lo que esa repetición necesita (ver la decisión siguiente). **No se guarda cuándo es la próxima vez**: se calcula al leer con
`proximaOcurrencia` (`packages/shared`). "Hoy" es el día de la zona horaria de la persona
(`usuarios.zonaHoraria`). Avisan dentro de la aplicación (ficha, pestaña Recordatorios, widgets); no mandan correo
ni notificación.

**Por qué.** (1) Un cumpleaños o "pagar el 10" es un día de calendario, no un instante: guardarlo como `timestamp`
UTC lo correría de día según la zona. (2) Calcular al leer evita mantener un campo "próxima fecha" que habría que
actualizar con un job y que se desincroniza si el job falla. El cálculo es una función pura con tests. (3) Los
avisos por correo o push suman SMTP, programación por zona y evitar duplicados: es el trabajo del módulo de
notificaciones, que reutilizará estos recordatorios; la persona eligió dejarlo para entonces. **Reglas de
borde:** un día que no existe en el mes (31 de abril) cae el último día del mes, y un 29 de febrero cae el 28 en
años comunes.

## 2026-10-20 — Los recordatorios de una sola vez se eliminan solos con un job de pg-boss; la lista no depende de que corra

**Decisión.** Un recordatorio de una sola vez desaparece al terminar su día. Un job de pg-boss (cada hora y al
arrancar la API) lo marca como eliminado, y borra en definitivo, a los 30 días, los contactos y recordatorios
eliminados (`apps/api/src/tareas/`, `servicios/contactos/limpieza.ts`). Aun así, **las consultas ocultan por su
cuenta** los de una sola vez que ya pasaron: si el job se atrasa o la API estuvo apagada, la persona no ve nada
raro.

**Por qué.** `docs/guias/seguridad-y-datos.md` pide borrado lógico con borrado definitivo automático por un job, y
el stack ya define pg-boss. Que la corrección no dependa del job lo hace un mantenimiento y no una pieza crítica.
El "día terminó" se compara en SQL con la zona de cada persona (`now() at time zone usuarios.zona_horaria`).
**Descartado:** un cron del sistema (no funciona igual en Windows y Linux, y no reparte entre copias de la API) y
borrar al leer (una lectura no debe escribir).

**Costo.** pg-boss crea su propio esquema (`pgboss`) en la base y mantiene un par de conexiones. No se arranca en
los tests (`NODE_ENV=test`): la tarea se prueba como función y hay una prueba de punta a punta del programador. Si
no puede arrancar, la API sigue sirviendo y solo se atrasa la limpieza.

## 2026-10-20 — Una sola versión de `pg` en todo el monorepo (`overrides`)

**Decisión.** `pnpm-workspace.yaml` fuerza `pg` a la versión del catálogo (`overrides`).

**Por qué.** pg-boss trae su propia dependencia de `pg`, un poco más nueva que la del catálogo. Con dos versiones,
pnpm armó dos copias de `drizzle-orm` (cada una atada a su `pg`) y los tipos de la base dejaron de ser compatibles
entre la API y `@gestoria/db`. La señal fue un error de tipos con "separate declarations of a private property".
Con una sola versión de `pg` hay una sola copia de Drizzle. Si se actualiza `pg`, se actualiza en el catálogo.

## 2026-10-20 — El formulario de contactos valida con el esquema del servidor a través de un resolver propio

**Decisión.** `FormularioDeContacto` no usa `zodResolver` sino un resolver propio que arma los mismos datos que
manda a la API y los valida con `esquemaContacto` de `@gestoria/shared`, y luego traslada cada error a su campo.

**Por qué.** Persona y empresa tienen campos distintos (una unión discriminada), y teléfonos y correos son listas
cuyas filas en blanco se descartan antes de validar. `zodResolver` sobre el formulario tal cual obligaba a repetir
las reglas en un esquema aparte, con riesgo de que se desincronicen del servidor. Como descartar filas cambia los
índices, el resolver lleva la cuenta de qué fila era cuál para que el error aparezca en el campo correcto. Está
probado en e2e (error en la fila 2 con la 1 en blanco).

## 2026-10-20 — La búsqueda de contactos no ignora tildes

**Decisión.** La búsqueda usa `ilike` (sin distinguir mayúsculas) pero distingue tildes: "jose" no encuentra
"José".

**Por qué.** Ignorar tildes en PostgreSQL pide la extensión `unaccent`, una dependencia más de la base que hay que
instalar en el VPS y en cada entorno de desarrollo. Para un grupo reducido de contactos no justifica el costo hoy;
queda anotado como mejora si las personas lo piden (`docs/observaciones-usabilidad.md`). Los teléfonos sí se
buscan por sus cifras, sin importar cómo se escribieron.

## 2026-10-20 — Lo que se pide en un recordatorio depende de su repetición, y cada una guarda solo sus campos

**Decisión.** Una primera versión guardaba "el primer día" más la repetición, y el formulario pedía siempre una fecha.
Se cambió: cada repetición se define con lo que le corresponde. Una vez: `fecha`. Diaria: `hora` (obligatoria).
Semanal: `dia_semana` (1 a 7, ISO). Mensual: `dia_del_mes`. Anual: `dia_del_mes` y `mes`. La `hora` es opcional en todas
menos la diaria y es de reloj de la persona (sin zona). Los campos que una repetición no usa quedan en nulo y un
`check` de la base lo garantiza, además de la unión discriminada de `esquemaRecordatorio` (`packages/shared`) que
valida el servidor y usa el formulario. La migración `0015` pasó los recordatorios existentes al campo que les toca
(los diarios, que no tenían hora, quedaron a las 09:00).

**Por qué.** Pedirle una fecha a quien quiere "todos los lunes" o "el 15 de cada mes" obligaba a elegir un día
cualquiera del calendario que después se reinterpretaba (el lunes de esa fecha, el 15 de ese mes): confuso y con
casos raros (¿un 31 de abril?). Con el campo propio, lo que se ve en el formulario es lo que se guarda, y el
cumpleaños sale directo del día y el mes de la fecha de nacimiento. **Costo:** un recordatorio que se repite ya no
puede "empezar" en una fecha futura (siempre avisa desde la próxima vez que cae); no hizo falta para ningún caso
pedido. **Descartado:** conservar la fecha de inicio además del campo propio (dos fuentes de verdad) y guardar la
hora como instante UTC (un recordatorio "a las 8" es de reloj, no cambia con el horario de verano).

## 2026-10-21 — Las deudas son un registro aparte: no mueven los saldos ni los totales

**Decisión.** Las deudas y préstamos con un contacto (`deudas` y `pagos_de_deudas`) no crean movimientos ni
modifican los saldos de las cuentas, los totales del período, los presupuestos ni las estadísticas. Son una
lista aparte, con su propio saldo (monto menos pagos).

**Por qué.** Un préstamo no es un gasto ni lo que te devuelven es un ingreso: si fueran movimientos, el
balance del período mostraría un gasto que no fue y un ingreso que no fue, y los presupuestos se
distorsionarían. Mantenerlas separadas evita el doble conteo y es lo más simple de razonar. **Costo:** si la
persona presta plata de una cuenta, el saldo de esa cuenta no baja solo; tiene que ajustarlo ("Actualizar
saldo") o cargar una transferencia. **Descartado:** generar un movimiento por cada préstamo (al registrar la deuda).
**Actualización 2026-10-21 (más tarde):** para los *pagos* se agregó la opción, ver "Un pago de una
deuda puede generar su ingreso o gasto", más abajo.

## 2026-10-21 — Un pago de una deuda puede generar su ingreso o gasto

**Decisión.** Al registrar un pago o cobro, una casilla (**tildada por defecto**, a pedido de la persona; se puede destildar en cada pago) genera además un **ingreso**
(si le deben a la persona) o un **gasto** (si ella debe) por el mismo importe, en la cuenta que elija. La
deuda sigue siendo un registro aparte: lo que pasa a los totales es el movimiento, no la deuda.

**Por qué opcional.** Hay quien ya cargó esa plata a mano, o la recibió en una cuenta que no usa, o
solo quiere llevar la deuda: forzarlo duplicaría el ingreso. Por eso se puede destildar pago por pago.
Viene tildada porque es lo más común (cobrar o pagar mueve una cuenta); con la casilla tildada de entrada,
si no hay un período abierto o una cuenta a la vista, el pago se registra **igual y solo**
(el formulario avisa), para que el valor por defecto nunca bloquee un pago. *Costo aceptado:* quien ya
carga esos ingresos a mano tiene que destildarla (o se duplican).

**Cómo se resolvió.**
- *Una transacción.* El movimiento se crea con el mismo cliente transaccional que el pago
  (`crearMovimiento` recibe la transacción como si fuera la base): o se guardan los dos o ninguno.
  *Alternativa descartada:* crear el movimiento y borrarlo si el pago fallaba, que deja una ventana con
  plata registrada que no existe; con la fila de la deuda bloqueada, además, dos pedidos simultáneos no
  pueden generar movimientos de más.
- *Monedas.* La cuenta puede ser de cualquier moneda. Si no es la de la deuda, el importe del pago se
  convierte como en una transferencia: es el mismo componente de cotización (la del día, una escrita, o el
  importe que llegó) y el mismo `resolverCambio` del servicio de movimientos, así el redondeo y las reglas
  son los de siempre. El movimiento se guarda **en la moneda de la cuenta** (lo que entró de verdad) y,
  después, se convierte a la base como cualquier ingreso o gasto. La deuda se descuenta por lo pagado en
  su moneda. La descripción agrega "(US$ 25,00)" para no perder el importe original. *Primera versión
  (descartada a pedido de la persona):* exigía una cuenta de la misma moneda para no inventar una
  conversión.
- *Fecha.* Hoy, a la hora de ahora; otro día, a mediodía de ese día en la zona de la persona
  (`instanteDelDia`), porque el pago solo sabe de días y el movimiento es un instante dentro de un período.
  Si ese día no cae en un período, el pago no se registra (se dice cómo seguir).
- *Vínculo.* `pagos_de_deudas.movimiento_id` (`on delete set null`). **Quitar el pago elimina también su
  movimiento**: si no, las cuentas quedarían con plata sin pago que la explique. La confirmación lo dice.
  En el sentido contrario, eliminar el movimiento por su lado no toca el pago (queda como uno común).
- *Categoría.* Se elige en el formulario (por defecto "Ingresos" u "Otros"): las categorías son datos de
  la persona y pueden no existir esas.

**Tope.** Un pago nunca puede pasar de lo que falta. El servidor ya lo comprobaba; el formulario ahora avisa
al escribir (y no envía), con el máximo a la vista.

## 2026-10-21 — Una deuda es en una sola moneda y los totales se dan por moneda

**Decisión.** Cada deuda tiene su moneda y no se convierte nunca. Los totales ("te deben", "debés") se suman
por moneda y se muestran por moneda ("$ 5.000,00 · US$ 100,00").

**Por qué.** Convertir una deuda a la moneda base con la cotización de hoy cambiaría el número cada día para
algo que en realidad no cambia (se debe un monto fijo en dólares). Un total mezclado sería además inexacto
(prioridad de correctitud de `CLAUDE.md`). Mostrar varias monedas es honesto y alcanza.

## 2026-10-21 — Un contacto con deudas no se elimina ni se borra en definitivo

**Decisión.** Eliminar un contacto con alguna deuda **pendiente** devuelve 409 con el motivo. La limpieza que
borra en definitivo (30 días) **saltea** a los contactos que tengan cualquier deuda vigente, pendiente o
saldada: se quedan en la papelera hasta que esas deudas se eliminen y pase su propio plazo. `deudas.contacto_id`
no tiene `on delete cascade`.

**Por qué.** Una deuda nunca debe desaparecer por borrar a alguien (es plata registrada), y no puede quedar
apuntando a un contacto inexistente. Los movimientos, en cambio, sí pierden el vínculo si el contacto se borra
en definitivo (`on delete set null`): el movimiento sigue siendo un gasto válido sin saber con quién fue.

## 2026-10-21 — El pago de una deuda se valida con la fila bloqueada

**Decisión.** `registrarPago` corre en una transacción que lee la deuda con `for update`, suma los pagos y
recién ahí valida que el pago no pase de lo que falta. La prueba de integración lanza dos pagos a la vez y
comprueba que uno solo entra.

**Por qué.** Sin el bloqueo, dos pedidos simultáneos ven el mismo saldo, pasan los dos la validación y la deuda
queda pagada de más (saldo negativo). El saldo se calcula al leer, así que el único lugar donde se puede evitar
es al escribir.

## 2026-10-21 — "Ver en el mapa" es un enlace a OpenStreetMap, no un mapa incrustado

**Decisión.** La dirección de un contacto se ve en el mapa con un enlace a la búsqueda de OpenStreetMap que abre
otra pestaña. No hay mapa dentro de la aplicación, ni librería de mapas, ni geocodificación, ni coordenadas
guardadas.

**Por qué.** Un mapa incrustado exige convertir la dirección en coordenadas (Nominatim, un servicio gratuito
con límites de uso), sumar una librería (Leaflet) o un iframe de terceros, relajar la política de seguridad
(CSP) y mandar las direcciones de los contactos a un tercero: costo en privacidad, dependencias y complejidad
para algo que un enlace resuelve (ya es lo que hace cualquier celular al tocar una dirección). Cumple "Todo
open source y sin costo". Si más adelante se pide el mapa dentro de la ficha, se evalúa con esos costos a la vista.


## 2026-10-21 — Las tareas son dos tablas: la regla que se repite y lo que se tilda

**Decisión.** El módulo de tareas separa `tareas_repetitivas` (la regla: "todos los lunes", "el día 5 de cada
mes") de `tareas` (lo que aparece en la lista y se tilda, cada una con su día). Las tareas de uso único son
filas de `tareas` sin regla; las que genera una regla llevan su id. Las tareas de una regla se arman **al leer**,
solo hasta hoy, con una restricción única (regla, día) que evita duplicados.

**Por qué.** Se pidió que una tarea repetitiva "se agregue a los to-do de cada día" y que haya un historial
de días pasados con lo que se hizo y lo que no. Con una fila por día y tarea, el historial es simplemente "las
tareas de ese día" y sigue siendo fiel aunque la regla cambie o se elimine (se copia el título). Armarlas al
leer evita un job que tenga que correr para que la lista esté completa (si la API estuvo caída, al volver se
arman los días que faltaron) y evita crear filas de días futuros que habría que corregir cada vez que se edita
la regla. El costo es una consulta extra al abrir la lista (una por las reglas que no están al día), barata
gracias a `generada_hasta`.

**Alternativas descartadas.** (1) Una sola tabla con una columna "última vez completada" por tarea
repetitiva: no permite historial por día ni saber qué se dejó sin hacer. (2) Generar con un job diario de
pg-boss: depende de que corra a tiempo, hay que decidir la zona de cada persona a medianoche y una caída deja
la lista incompleta. (3) Calcular las ocurrencias al vuelo sin guardarlas: no se pueden tildar ni queda
historial.

## 2026-10-21 — Las repetitivas no se arrastran como atrasadas; las tareas sueltas sí

> **Reemplazada el 2026-10-22** por "Tareas fallidas": ahora las de repetitivas también se arrastran.

**Decisión.** Una tarea de uso único que no se hizo el día que le tocaba se arrastra a los días siguientes
como "atrasada" hasta que se complete. Una tarea que salió de una repetitiva y no se hizo **no** se arrastra:
queda "sin hacer" en el historial y al día siguiente hay una nueva.

**Por qué.** Lo primero es lo que se espera de una lista de pendientes ("una vez completados, ya no vuelven a
aparecer"). Con las repetitivas arrastrar acumularía montones de "tomar la vitamina" de días anteriores en la
lista, que nadie va a hacer y la volverían inmanejable; lo que importa es hoy, y lo de ayer es historia. Se
puede tildar desde el historial si se hizo y se olvidó marcar.

## 2026-10-21 — Cambiar una tarea repetitiva rige desde hoy

**Decisión.** Al editar una regla, se descartan sus tareas pendientes de hoy en adelante y se vuelven a armar
con la regla nueva; lo hecho y los días pasados no se tocan. Al eliminarla, se saca lo pendiente de hoy y el
historial queda. Una tarea suelta que se eliminó a mano hoy no vuelve a aparecer aunque se edite la regla.

**Por qué.** El historial tiene que ser lo que pasó, no lo que habría pasado con la regla actual. Reescribir
el pasado cada vez que se cambia una hora o un título haría que el historial deje de ser confiable.

## 2026-10-21 — El calendario es primero un diseño navegable, sin datos

**Decisión.** El módulo de calendario nace como una pantalla de navegación (mes, año, día elegido, atajos y
teclado) sin base de datos ni API. Las cuentas de fechas viven en `packages/shared/src/calendario/` como
funciones puras con tests; la pantalla calcula "hoy" con la zona del dispositivo recién montada (para no
chocar con el servidor al hidratar) y se actualiza cada minuto. La grilla es una tabla semántica de seis
semanas fijas, de lunes a domingo, con una sola casilla en el orden de Tab y flechas adentro.

**Por qué.** Se pidió un diseño muy cuidado y animado de un calendario que se pueda recorrer por completo,
al que después se le suman funcionalidades. Separar la base de la navegación evita decidir ahora el modelo de
eventos. Seis semanas fijas evitan saltos de alto al cambiar de mes; el orden de Tab con una sola casilla es
el patrón de accesibilidad de las grillas (si no, un mes serían 42 paradas de Tab). Sin dependencia nueva:
Motion, Lucide y Tailwind, que ya estaban.

## 2026-10-21 — El avatar de un contacto toma el color de sus etiquetas

**Decisión.** El fondo del avatar de un contacto es el color de su etiqueta; si tiene varias, el promedio
(por canal, en sRGB) de todos sus colores; si no tiene ninguna, el acento suave de siempre. El texto va en
blanco o negro según cuál contraste más con ese fondo. Donde la API no manda las etiquetas del contacto (la
lista general de recordatorios, las deudas) queda el color de antes.
*Actualización:* la lista general de recordatorios ahora sí trae las etiquetas del contacto (una consulta
para todos los visibles) para que su avatar tenga el mismo color que en el listado; las deudas siguen
sin traerlas.

**Por qué.** Se pidió que la etiqueta se vea de un vistazo en la lista. El promedio hace que todas pesen
lo mismo y no depende del orden. Elegir blanco o negro por contraste garantiza al menos 4,5:1 sobre
cualquier mezcla (negro puro, no casi negro: con #09090b algunas mezclas bajaban a 4,47), así el avatar
sigue cumpliendo la guía de accesibilidad aunque el color lo elija cada persona. Mezclar colores muy
distintos da tonos apagados; se aceptó porque es lo que se pidió ("una mezcla de todos") y la
alternativa (franjas o un degradado) cuesta legibilidad en un círculo de 40 px.

## 2026-10-21 — Categorías de tareas: opcionales, con las de por defecto y sin reemplazo al eliminar

**Decisión.** Las tareas y las tareas repetitivas pueden tener una categoría opcional (`categoria_id`
en nulo si no tienen). Las categorías son de cada persona, con un set por defecto (Personal, Casa,
Trabajo, Estudio, Salud, Compras, Trámites) que se crea la primera vez que se miran, con una marca en el
usuario para que no reaparezcan. Se borran en duro y **solo si ninguna tarea pendiente ni repetitiva la
usa**; las tareas ya hechas pasan a "sin categoría" (`on delete set null`). La repetitiva copia su
categoría a cada tarea que arma, igual que el título.

**Por qué.** Se pidió algo parecido a las categorías de Finanzas, pero con la regla de que se eliminen
mientras no tengan tareas asignadas. En Finanzas una categoría con movimientos se *reemplaza* (el
historial de gastos tiene que seguir teniendo categoría para las estadísticas); acá la categoría es solo
una ayuda para ordenar, así que alcanza con bloquear el borrado y explicar qué la retiene. Contar también
las tareas hechas haría que una rutina diaria dejara la categoría atada durante todo el año de historial,
sin forma de liberarla (el historial no se edita), por eso solo cuentan lo pendiente y las repetitivas.
Se copia el mismo patrón de las etiquetas de contactos (set por defecto con marca en el usuario, borrado
en duro) en vez de inventar otro. Alternativa descartada: que eliminar reasigne o quite la categoría a
las tareas pendientes; se prefirió no tocar tareas sin que la persona lo decida.

## 2026-10-21 — Las tareas semanales pueden caer en varios días de la semana

**Decisión.** Una tarea repetitiva semanal guarda una lista de días (`dias_semana smallint[]`) en vez de un
solo `dia_semana`. Sigue siendo una única regla que arma una tarea por cada día que cae. Cómo cae y cómo se
dice (`proximaOcurrenciaDeTarea`, `caeEnElDiaDeTarea`, `describirRepeticionDeTarea`) vive en
`packages/shared/src/tareas/cuando-cae.ts` y reutiliza las cuentas de los recordatorios para el resto de
las repeticiones; los recordatorios de contactos no cambian. El cambio de esquema se hizo en dos migraciones
(agregar la columna y copiar el día que ya tenían las existentes; después quitar la vieja y rehacer los
`check`). La API cambia `diaSemana` por `diasSemana` sin mantener el campo viejo: la web es el único cliente.

**Por qué.** Lo habitual es "lunes, miércoles y viernes" o "sábado y domingo": crear una regla por día
llenaba la pestaña Repetitivas de copias que había que editar todas juntas. Una lista de días mantiene una
sola regla, un solo historial por rutina y los widgets de rutinas siguen contando por regla. Alternativas
descartadas: una máscara de bits (más compacta pero ilegible en la base y en los `check`) y una tabla de días
(un join más para algo que nunca pasa de siete valores). En lugar de un solo `select` repetido, el formulario
muestra siete botones marcables porque se ven todos los días de una vez y se eligen en un toque cada uno.

## 2026-10-22 — El recordatorio de cumpleaños se crea desde el alta, en el servidor

**Decisión.** El esquema de la persona (`esquemaPersona`) acepta un `recordarCumpleanos` opcional. Si viene en
verdadero y hay fecha de nacimiento, `crearContacto` inserta el recordatorio anual "Cumpleaños" (día y mes de
la fecha) en la misma transacción que el contacto. Al editar se ignora, y una empresa lo descarta. El título
sale de `TITULO_DEL_CUMPLEANOS`, compartido con la sugerencia del formulario de recordatorios. El formulario
muestra la casilla marcada de entrada, solo al dar de alta y con la fecha cargada.

**Por qué.** La lógica de negocio vive en la API (no en el cliente): así lo reutilizan la web, el móvil y la
futura entrada por lenguaje natural, y el contacto y su recordatorio se crean o fallan juntos. Alternativa
descartada: que la web llamara a `POST …/recordatorios` después de crear el contacto, que podía dejar un
contacto sin su recordatorio si la segunda llamada fallaba.

## 2026-10-22 — El historial de recordatorios guarda cada vez que cayeron, en una tabla aparte

**Decisión.** Un recordatorio no se elimina al pasar su día. Cada vez que cae y su día termina queda una
entrada en `historial_de_recordatorios` (copia del título, la repetición, la hora y el día en que cayó), **también
en los que se repiten**: el recordatorio principal sigue vivo y el historial es lo que ocurrió. Uno de una sola
vez deja su única entrada y se da de baja (borrado lógico, como siempre; a los 30 días se borra en definitivo).
Las entradas se generan **al leer** el historial y en la limpieza periódica, no al crear nada: cada recordatorio
lleva `historial_hasta` (el último día ya pasado al historial; migración 0030) y de ahí en adelante se calcula
qué días cayó con la misma cuenta que usan el calendario y las listas (`proximaOcurrencia`). Un recordatorio nuevo
nace con `historial_hasta` = ayer, así no inventa historia, y si pasó mucho tiempo sin generar solo se recuperan los
últimos 90 días. La persona puede eliminar entradas sueltas o vaciar todo el historial (borrado en duro: son datos
derivados); como solo avanza el puntero, lo borrado no vuelve. Vaciar pide confirmación con un aviso que dice que
los recordatorios no se tocan. `recordatorio_id` no es clave foránea: el historial sobrevive a la eliminación del
recordatorio (sí se borra en cascada con el contacto o la cuenta). El calendario sigue mostrando los de una sola
vez que pasaron, ahora desde su entrada del historial. La pestaña Recordatorios se divide en Próximos y Pasados y
suma filtros (texto, contacto, repetición) resueltos por la API.

**Por qué.** Borrar solo lo que ya pasó le sacaba a la persona poder consultar qué había anotado, y para lo que se
repite no había nada que mostrar. Una tabla aparte permite eliminar cada vez por separado sin tocar el recordatorio
principal, que es lo que se pidió. Generar al leer (con un puntero) evita depender de que el job haya corrido y se
parece a como Tareas arma las repetitivas. Alternativas descartadas: calcular el historial sin guardarlo (no
permitía eliminar entradas sueltas ni vaciarlo sin una tabla de lo borrado) y una columna `pasado` en el
recordatorio (solo servía para los de una sola vez).

## 2026-10-23 — Las tareas de hoy también se pueden dar por fallidas

**Decisión.** `fallarTarea` acepta cualquier tarea que no sea de un día futuro: antes solo las de un día anterior
a hoy (`TareaNoAtrasada`, ahora `TareaFutura`). En la lista de Hoy la cruz aparece también en "Para hoy". Una de hoy
dada por fallida sale de "Para hoy", va a "Fallidas hoy" (se deshace desde ahí) y, mientras sea hoy, **sigue en el
total del día como no hecha**: el avance dice "1 hechas y 1 fallida" y el porcentaje es hechas sobre el total
(`hoyFallidas` en los widgets, que también la cuentan en el total y la sacan de la racha de hoy). Al día siguiente
queda en el historial en el día que le tocaba, como cualquier fallida.

**Por qué.** A media jornada la persona ya sabe que algo no se va a hacer y no hay motivo para obligarla a esperar a
que quede atrasada, ni a dejarlo pendiente para siempre. Contarla como no hecha (y no sacarla del total) evita que
darse por vencido suba el porcentaje: el avance mide lo que se hizo de lo que tocaba. Una de un día futuro sigue sin
poder fallar: todavía no le toca.

## 2026-10-23 — Tareas y recordatorios importantes: una marca y un distintivo, sin reordenar las listas

**Decisión.** Una columna `importante boolean not null default false` (migración 0031) en `tareas`, `tareas_repetitivas`,
`recordatorios_de_contactos` y `historial_de_recordatorios` (copia de lo que era cuando cayó). Los esquemas Zod la aceptan
como opcional, igual que `categoriaId` y `fallaSola`: al crear, sin el campo vale falso; al editar, sin el campo se
conserva. Una repetitiva importante se la pasa a las tareas que arma. **Las listas no se reordenan**: tareas y
recordatorios siguen por día y hora (primero se probó poner las importantes arriba, pero reordenar "mareaba"; se
revirtió). Lo importante se reconoce por el distintivo. El distintivo es un solo componente (`DistintivoImportante`: pastilla ámbar con estrella y la palabra), más
una franja de color en las filas de tareas.

**Por qué.** "Importante" es un atributo del elemento, no un estado: una marca sencilla se entiende de un vistazo y no
agrega pantallas. Mantener el orden por hora conserva lo que la persona espera encontrar y que los widgets sigan
mostrando "lo más cercano". Dos niveles (importante o no) bastan por ahora; una escala de prioridades se puede sumar sin
cambiar esta marca. Alternativas descartadas: reordenar con las importantes arriba (se probó y se revirtió) y una tabla
de prioridades con varios niveles (más para configurar y leer).

## 2026-10-23 — Aviso antes de dar una tarea por fallida, y casilla de completar circular

**Decisión.** Tocar la cruz de una tarea abre un diálogo breve (dos frases) que explica qué es una tarea fallida y en qué se
diferencia de completarla, con una casilla "No volver a mostrar". La preferencia se guarda en `localStorage`
(`gestoria:tareas:aviso-de-fallida-oculto`, `lib/preferencias-tareas.ts`) y solo se guarda al confirmar (cancelar
con la casilla tildada no la recuerda). Es un hook (`usarAvisoDeFallida`) que usan la lista de Hoy y el historial; deshacer
no pide confirmación. Además la casilla de completar de las tareas pasa a ser un círculo (`Casilla forma="circular"`) con la
estética del botón de fallida —círculo con borde, ícono adentro a la vista— pero con un tilde y en verde.

**Por qué.** La cruz puede leerse como "terminar la tarea" y la primera vez nadie sabe que es una salida definitiva
distinta de completarla; el aviso evita el error sin molestar después. La preferencia es de este navegador (como las del
calendario), no un dato de la cuenta. Que las dos acciones —hacerla o darla por perdida— tengan la misma forma pero distinto
ícono y color las vuelve pares fácilmente reconocibles.

## 2026-10-23 — En Hoy los controles de las tareas aparecen al apuntar; lo hecho o fallido muestra su estado

**Decisión.** En la pantalla de Hoy (`FilaDeTarea acciones="al-apuntar"`), con mouse, la casilla y la cruz de una tarea
pendiente **no ocupan lugar** (ancho 0 y opacidad 0) y se despliegan a la izquierda del título, empujándolo, al apuntar a
la fila o con el foco del teclado, con la animación de las acciones de los recordatorios de Contactos
(`max-width` + opacidad); en pantallas táctiles se ven siempre. El campo real de la casilla va dentro de la pieza que se
despliega, pegado a la caja (así sigue valiendo el selector de hermano), y el tachado, que deja de ser hermano del campo,
se resuelve con `:has`. Una tarea completada o fallida muestra
siempre su estado final: la casilla verde marcada o la cruz roja activada (`BotonDeFallida activa`), y tocarla la vuelve
a pendiente. Se eliminó el botón "Deshacer" y la casilla que tenían las fallidas. El Historial no oculta nada, pero su
fallida usa la misma cruz activada.

**Por qué.** Menos ruido en una lista que se mira todo el día, con el mismo patrón que los botones de editar y eliminar,
sin esconder el estado de lo ya resuelto. Que "hecha" y "fallida" sean pares visuales (círculo lleno, verde con tilde / rojo con
equis) y que se deshagan igual hace la interfaz más fácil de aprender. Alternativa descartada: solo un fundido sin colapsar el
ancho (dejaba un hueco vacío a la izquierda de cada título). Como las pruebas end-to-end no pueden tocar un botón que
todavía no ocupa lugar, antes de tocar la cruz apuntan a la fila, como lo haría una persona.
