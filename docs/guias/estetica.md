# Guía de estética y sistema visual

Leer antes de trabajar en interfaz, componentes, estilos o animaciones.

Estilo **limpio pero con vida**: pantallas despejadas y pocos elementos por vista, pero con movimiento, profundidad y respuesta al tacto. El contenido manda, y la interfaz lo acompaña con animaciones y elevación que hacen que la aplicación se sienta viva en vez de estática. Todo valor visual sale de los tokens de `packages/ui-tokens`; no usar colores, tamaños, sombras ni duraciones sueltos en los componentes.

**Dos cosas no son preferencia estética y no se negocian:** respetar la preferencia de reducir movimiento del sistema, y mantener 60 fps. Todo lo demás de esta guía se puede discutir.

## Nombre y logotipo

La aplicación se llama **gestorIA**, juego de palabras entre "gestoría" e IA. Se escribe siempre con la g minúscula y las dos últimas letras en mayúscula, incluso al principio de una oración: la mayúscula es lo que hace visible el juego de palabras.

Hay **dos versiones**, y cada una tiene su lugar:

- El **logotipo** (`<Logotipo />`) es el símbolo más el nombre. Es la versión por defecto: barra superior, correos, documentos, cualquier lugar donde haya que identificar la aplicación.
- El **isotipo** (`<Isotipo />`) es solo el símbolo, sin texto. Para donde no entra el nombre o sería redundante: favicon, ícono de la app, avatares, pantallas de carga, espacios muy angostos.

Detalles:

- El logotipo escribe "gestor" con el color del texto y "IA" con el acento. El nombre accesible es "gestorIA" entero, para que un lector de pantalla no lo lea partido.
- El símbolo es una ficha con dos renglones —lo que se gestiona— y un destello de cuatro puntas, con el mismo trazo fino que los íconos de Lucide y dibujado con `currentColor`.
- **Sobre fondos de color va en versión mono** (todo del mismo color): encima del acento, el "IA" en acento queda invisible.
- El nombre vive en `packages/shared/src/marca.ts` y el logotipo en `apps/web/src/componentes/marca/`. No escribir el nombre a mano en las pantallas.

## Colores

- **Base neutra** (escala zinc) para fondos, superficies, bordes y textos: la gran mayoría de la interfaz.
- **Acento único: azul petróleo** (referencia: teal-700 `#0f766e` como color principal, teal-100 `#ccfbf1` como fondo suave, teal-900 `#134e4a` como texto sobre fondo suave). Solo para la acción principal de cada pantalla, elementos seleccionados, enlaces y foco. Como máximo una acción principal con acento por vista.
- **Colores de estado** reservados para su significado: éxito/ingreso, advertencia, peligro/error/vencido. El verde de éxito debe diferenciarse claramente del acento (usar un verde más amarillento y siempre acompañado de ícono o texto), y ningún significado depende solo del color.
- **Colores de origen** (`origen-manual`, `origen-finanzas`, `origen-contactos`, `origen-tareas`, cada uno con su `-fondo` y su `-texto`): una paleta categórica aparte, solo para distinguir de qué módulo viene algo cuando se muestra mezclado con lo de otros (hoy, los eventos del calendario y los resúmenes de cada módulo en la pantalla de inicio). No son de estado ni de acento: son cuatro tonos (naranja, azul, violeta, rosa) distintos entre sí y de los tres estados. Siempre van con un ícono y el nombre del origen, nunca solos, y el texto sobre su fondo suave cumple 4,5:1 y el color pleno 3:1 sobre la superficie en ambos temas (lo verifica `packages/ui-tokens/src/tokens.test.ts`).
- **Modo claro y oscuro** desde el inicio, definidos con tokens semánticos (`fondo`, `superficie`, `texto`, `texto-secundario`, `borde`, `acento`, `exito`, `advertencia`, `peligro`). Verificar contraste accesible en ambos modos.

## Tipografía

- Familia única: **Geist** (licencia SIL OFL) en web y móvil, con fuentes del sistema como respaldo.
- Dos o tres pesos como máximo (regular, medio y, excepcionalmente, semibold).
- Escala de tamaños reducida y consistente definida en los tokens.
- **Números tabulares** en montos, fechas, horas y cualquier columna numérica.

## Espaciado, formas y superficies

- Espaciado en múltiplos de 4 px; separaciones generosas entre bloques.
- Esquinas redondeadas moderadas: 8 px en controles, 12 px en tarjetas.
- En listas densas, filas separadas por líneas finas en lugar de tarjetas individuales.

### Elevación

La profundidad es una herramienta, no un adorno: dice qué está por encima de qué. Hay una escala de elevación en los tokens y **cada nivel significa algo**:

| Nivel | Cuándo | Ejemplos |
|---|---|---|
| `sutil` | Apoyado sobre el fondo | Tarjetas en reposo, campos, botones |
| `elevada` | Levantado sobre lo que lo rodea | Botones bajo el cursor, paneles destacados |
| `flotante` | Por encima del contenido | Barra superior, menús, diálogos, hojas inferiores |

- Las sombras del modo oscuro son más marcadas que las del claro: sobre fondo oscuro una sombra suave no se ve.
- **Solo los botones suben un nivel al pasar el mouse** y bajan al presionarlos. El resto no cambia de elevación con el cursor; ver "Microinteracciones".
- Los bordes finos siguen existiendo y se combinan con la sombra; no la reemplazan.

## Íconos e imágenes

- Íconos **Lucide**, trazo fino y tamaño consistente. En acciones importantes, ícono acompañado de texto.
- Sin fotos de stock ni decoración gratuita. Solo ilustraciones simples de línea en estados vacíos, si aportan.
- Avatares de contactos con iniciales cuando no hay foto.

## Animaciones

El movimiento es parte del producto, no un extra. Una interfaz que no responde al mouse ni acompaña sus propios cambios se siente muerta, por prolija que esté. La regla no es "poca animación", es **animación con intención**: cada movimiento explica algo.

### Duraciones y curvas

| Token | Duración | Para qué |
|---|---|---|
| `rapida` | 150 ms | Respuesta al mouse y al clic: hovers, presionado, foco |
| `normal` | 240 ms | Cambios de estado: aparecer, desaparecer, cambiar de tamaño |
| `lenta` | 380 ms | Transiciones compuestas: entrada de una pantalla, cambio de panel con varias partes |

- **Curva por defecto:** desaceleración suave (`cubic-bezier(0.16, 1, 0.3, 1)`).
- **Resortes** para lo que responde a una acción directa (la pastilla de una pestaña, un panel que se abre): dan una sensación más física que una curva fija. Con poco rebote, nada elástico ni caricaturesco.
- Las **salidas** van más rápidas que las entradas.

### Microinteracciones

El tacto de lo que se puede tocar vive en una **escala aparte** de la tabla de arriba. Aquellas duraciones describen cambios de estado de la pantalla; estas, lo que pasa mientras el dedo o el mouse está encima. Por eso hay una sola duración.

| Token | Valor | Para qué |
|---|---|---|
| `--anim-duracion` | 220 ms | Toda respuesta al puntero |
| `--anim-curva` | `cubic-bezier(0.16, 1, 0.3, 1)` | La misma desaceleración de siempre |
| `--anim-escala-presion` | 0,97 | Cuánto se achica algo al presionarlo |
| `--anim-elevacion-hover` | 2 px | Cuánto se levanta al pasar el mouse. **Solo botones** |

Toda interacción tiene respuesta visual, breve y discreta, usando siempre los tokens o multiplicadores de ellos.

**La elevación al hover es exclusiva de los botones.** Las tarjetas, las filas y todo lo demás **no se desplazan ni escalan** al pasar el mouse: cambian un fondo suave, o el ícono de la fila, y nada más. Si todo lo que queda debajo del cursor se mueve, la pantalla se vuelve inestable y deja de distinguirse qué es lo accionable.

Patrones por componente:

- **Botones:** al pasar el mouse suben `--anim-elevacion-hover` y refuerzan borde o fondo; al presionar vuelven a su lugar y escalan a `--anim-escala-presion`, con el **40 % de la duración base**. La respuesta al clic no espera a que se suelte el botón. Un botón deshabilitado no reacciona: si lo hiciera, mentiría.
- **Pestañas y selectores segmentados:** un indicador que se **desliza** hasta la opción elegida, no un fondo que se prende y se apaga.
- **Interruptores:** la perilla se desliza y el fondo pasa al acento; al presionar, la perilla se estira levemente hacia el lado contrario al que está apoyada.
- **Casillas y tareas:** el tilde se **dibuja** animando `stroke-dashoffset`, la caja escala al presionar y el texto de una tarea se tacha con una línea que crece de izquierda a derecha. En las tareas la casilla es **circular** (`forma="circular"`): la misma estética que el botón de "fallida" —un círculo con borde y el ícono adentro— pero con un tilde y en verde (borde y fondo verdes al apuntarla, llena al marcarla).
- **Campos de texto:** al enfocar, el borde toma el acento y aparece un anillo suave.
- **Secciones plegables** (`Plegable`): el contenido se abre y se cierra **como una sola pieza** —altura y opacidad juntas—, y la lista de adentro no hace su cascada de entrada. Mezclar un contenedor que aparece de golpe con elementos que se deslizan hace que se solapen por un instante.
- **Listas:** los elementos entran deslizándose unos píxeles y apareciendo, en cascada; las **salidas son más rápidas que las entradas**, porque agregar algo puede acompañar pero borrar tiene que sentirse resuelto.
- **Valores que cambian** (totales, contadores): pulso breve de escala, para que una actualización que nadie pidió no pase inadvertida.

Con la preferencia de reducir movimiento, la duración baja a 1 ms y tanto el levantado como la escala quedan en neutro: la respuesta sigue existiendo (color, sombra, anillo), pero sin desplazamiento.

### Brillo de bordes

En las tarjetas y paneles que **agrupan contenido**, el borde se ilumina según la cercanía del mouse: el tramo más próximo brilla y el brillo se apaga a lo largo del contorno. Es lo que hace que una superficie grande y quieta deje de parecer una imagen.

| Token | Valor | Qué es |
|---|---|---|
| `--borde-brillo-alcance` | 250 px | Radio del halo alrededor del puntero |
| `--borde-brillo-intensidad` | 40 % | Proporción del acento en el punto más brillante |
| `--borde-brillo-grosor` | 1 px | Ancho de la línea encendida |

- Se enciende **también con el mouse cerca pero fuera** del contenedor: el brillo se anticipa al contacto en vez de esperar a que el puntero entre.
- **Solo con mouse.** En una pantalla táctil no hay puntero que seguir, así que el efecto directamente no existe y no se engancha ninguna escucha.
- Se enciende **el borde que ya está**, del mismo grosor: no se agrega un contorno nuevo ni cambia el tamaño de nada.
- **Técnica obligatoria: SVG**, no máscaras CSS ni `color-mix`. Una capa superpuesta con dos rectángulos redondeados que siguen la línea del borde —uno fino y nítido, otro más ancho y difuminado como halo—, con el trazo pintado por un gradiente radial centrado en el mouse. El porqué está en `docs/decisiones.md`; el algoritmo, en `docs/referencias/fondo-animado.md`.
- Un **único bucle** para toda la página, no uno por contenedor.

### Entradas escalonadas

Cuando entran varios elementos juntos (los campos de un formulario, las filas de una lista), entran **en cascada**, con unos 40 ms de diferencia entre uno y otro, en vez de todos a la vez. Es lo que hace que una pantalla se "arme" en lugar de aparecer de golpe.

### Fondo animado

Detrás de **todo el contenido** hay formas de color difuminadas que se mueven, giran, cambian de tamaño y de color muy despacio. Da profundidad y algo de vida a las pantallas vacías sin competir con lo que se está mirando.

Configuración común a los dos modos: 15 formas, variedad de formas 0 (círculos), tamaño 0,40 del lado mayor, velocidad de movimiento y de ciclo de color 1,0, factor de difuminado 24.

| | Intensidad | Tono central | Variedad de color | Saturación | Luminosidad | Alfa |
|---|---|---|---|---|---|---|
| Claro | 0,18 | 175 | ±75 | 78 | 72 | 0,85 |
| Oscuro | 0,25 | 200 | ±55 | 62 | 30 | 0,90 |

Reglas:

- Cubre **siempre la ventana entera**, también al hacer scroll. La barra superior y el pie quedan encima, con su propia superficie translúcida: siguen leyéndose como marco y no como parte del fondo.
- **El difuminado no sale de `filter: blur()`.** Se dibuja un `<canvas>` a 1/24 del tamaño de la ventana y el navegador lo agranda a pantalla completa; esa interpolación es la que suaviza los bordes. Un blur de radio grande sobre la ventana entera es de lo más caro que puede hacer el navegador y se paga en cada cuadro.
- La **intensidad es la opacidad CSS del canvas** y depende del tema: sobre un fondo casi negro, el mismo lavado que en claro no se percibe.
- Sus tiempos están en otra escala que los de la interfaz —decenas de segundos, no milisegundos—, porque un fondo que se mueve a la velocidad de un botón marea. Es la única excepción a la tabla de duraciones.
- **Como máximo 30 cuadros por segundo,** en pausa cuando la pestaña no está visible.
- Es decorativo: sin eventos de puntero, oculto a los lectores de pantalla y fuera del orden de tabulación.
- Es **deliberadamente tenue**. Hay texto que se apoya directo sobre él, y un lavado fuerte le bajaría el contraste. Las herramientas automáticas de accesibilidad no ven este caso, porque el canvas no es ancestro del texto: el contraste del peor caso se verifica a mano en los tests de `packages/ui-tokens`. El contenido, además, se apoya en superficies sólidas o semiopacas.
- Con la preferencia de reducir movimiento queda **un solo cuadro fijo**, pero sigue pintado: lo que molesta es el movimiento, no el color.
- La distribución sale de una cuadrícula con desplazamiento aleatorio y semilla fija: cubre la pantalla sin huecos y es siempre la misma.
- **En móvil no está implementado** todavía, ni el fondo ni el brillo de bordes.

### Límites

- **Rendimiento:** preferir `transform` y `opacity`, que el navegador mueve sin recalcular el layout. Animar otras propiedades (`height`, `box-shadow`) cuando el efecto lo justifique y sea un elemento acotado; nunca en listas largas. Mantener 60 fps en móvil.
- **Accesibilidad:** respetar la preferencia de reducir movimiento del sistema, reemplazando desplazamientos, escalas y cascadas por cambios de opacidad instantáneos o muy breves. Con esa preferencia activa, la aplicación tiene que seguir siendo legible y completa, solo quieta.
- **Nunca bloquear la interacción** esperando que termine una animación.
- Duraciones, curvas y resortes definidos como tokens compartidos, usados con Motion en web y Reanimated en móvil.
- **Animar solo `transform` y `opacity`.** Se permiten transiciones cortas de color de borde y de fondo, que el navegador resuelve sin recalcular el layout.

## Consistencia

- Antes de construir módulos, crear una **guía de estilo interna** (página en la web, accesible solo en desarrollo o para admin) que muestre tokens, tipografía, botones, formularios, tarjetas, listas, estados vacíos, de carga y de error, y animaciones. Todo componente nuevo se agrega ahí.
- Web y móvil comparten tokens y patrones; se adaptan a las convenciones de cada plataforma sin perder coherencia visual.
