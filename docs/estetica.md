# Guía de estética y sistema visual

Leer antes de trabajar en interfaz, componentes, estilos o animaciones.

Estilo **minimalista**: pantallas despejadas, mucho espacio, pocos elementos por vista y animaciones prolijas. La interfaz debe pasar a segundo plano para que se destaque el contenido. Todo valor visual sale de los tokens de `packages/ui-tokens`; no usar colores, tamaños ni duraciones sueltos en los componentes.

## Colores

- **Base neutra** (escala zinc) para fondos, superficies, bordes y textos: la gran mayoría de la interfaz.
- **Acento único: azul petróleo** (referencia: teal-700 `#0f766e` como color principal, teal-100 `#ccfbf1` como fondo suave, teal-900 `#134e4a` como texto sobre fondo suave). Solo para la acción principal de cada pantalla, elementos seleccionados, enlaces y foco. Como máximo una acción principal con acento por vista.
- **Colores de estado** reservados para su significado: éxito/ingreso, advertencia, peligro/error/vencido. El verde de éxito debe diferenciarse claramente del acento (usar un verde más amarillento y siempre acompañado de ícono o texto), y ningún significado depende solo del color.
- **Modo claro y oscuro** desde el inicio, definidos con tokens semánticos (`fondo`, `superficie`, `texto`, `texto-secundario`, `borde`, `acento`, `exito`, `advertencia`, `peligro`). Verificar contraste accesible en ambos modos.

## Tipografía

- Familia única: **Geist** (licencia SIL OFL) en web y móvil, con fuentes del sistema como respaldo.
- Dos o tres pesos como máximo (regular, medio y, excepcionalmente, semibold).
- Escala de tamaños reducida y consistente definida en los tokens.
- **Números tabulares** en montos, fechas, horas y cualquier columna numérica.

## Espaciado, formas y superficies

- Espaciado en múltiplos de 4 px; separaciones generosas entre bloques.
- Esquinas redondeadas moderadas: 8 px en controles, 12 px en tarjetas.
- Bordes finos en lugar de sombras. Sombras solo en elementos flotantes (menús, diálogos, hojas inferiores).
- En listas densas, filas separadas por líneas finas en lugar de tarjetas individuales.

## Íconos e imágenes

- Íconos **Lucide**, trazo fino y tamaño consistente. En acciones importantes, ícono acompañado de texto.
- Sin fotos de stock ni decoración gratuita. Solo ilustraciones simples de línea en estados vacíos, si aportan.
- Avatares de contactos con iniciales cuando no hay foto.

## Animaciones: estilo fluido

- **Duración:** 150-250 ms en general (220 ms como referencia); nunca más de 300 ms salvo transiciones de pantalla completas.
- **Curva:** desaceleración suave al final (referencia `cubic-bezier(0.16, 1, 0.3, 1)`). Sin rebotes ni efectos elásticos.
- **Con propósito:** confirmar acciones (pulso breve al completar una tarea o guardar), mostrar origen y destino (paneles que se deslizan desde donde se abrieron), suavizar cambios (elementos que entran deslizándose unos pocos píxeles y aparecen, salidas algo más rápidas que las entradas).
- **Rendimiento:** animar solo `transform` y `opacity`. Mantener 60 fps en móvil.
- **Accesibilidad:** respetar la preferencia de reducir movimiento del sistema, reemplazando desplazamientos y escalas por cambios de opacidad instantáneos o muy breves.
- Duraciones y curvas definidas como tokens compartidos, usadas con Motion en web y Reanimated en móvil.
- Nunca bloquear la interacción esperando que termine una animación.

## Consistencia

- Antes de construir módulos, crear una **guía de estilo interna** (página en la web, accesible solo en desarrollo o para admin) que muestre tokens, tipografía, botones, formularios, tarjetas, listas, estados vacíos, de carga y de error, y animaciones. Todo componente nuevo se agrega ahí.
- Web y móvil comparten tokens y patrones; se adaptan a las convenciones de cada plataforma sin perder coherencia visual.
