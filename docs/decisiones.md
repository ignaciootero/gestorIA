# Decisiones de arquitectura

Registro breve de las decisiones importantes: qué se decidió, por qué y qué se descartó.
Las más nuevas arriba.

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
