// Tokens del sistema visual: la única fuente de verdad de colores, tipografía,
// espaciado, formas y animaciones (ver docs/guias/estetica.md).
//
// Ningún componente escribe un color, un tamaño o una duración sueltos: todo
// sale de acá. La web los consume como variables CSS (tokens.css, que se genera
// a partir de estos mismos valores) y el móvil los va a consumir como objetos
// desde NativeWind.

/**
 * Escala neutra (zinc). Es la gran mayoría de la interfaz: fondos, superficies,
 * bordes y textos.
 */
export const NEUTRO = {
  50: "#fafafa",
  100: "#f4f4f5",
  200: "#e4e4e7",
  300: "#d4d4d8",
  400: "#a1a1aa",
  500: "#71717a",
  600: "#52525b",
  700: "#3f3f46",
  800: "#27272a",
  900: "#18181b",
  950: "#09090b",
} as const;

/**
 * Acento único: azul petróleo.
 *
 * Solo para la acción principal de cada pantalla, lo seleccionado, los enlaces y
 * el foco. Como máximo una acción con acento por vista.
 */
export const ACENTO = {
  100: "#ccfbf1",
  200: "#99f6e4",
  600: "#0d9488",
  700: "#0f766e",
  800: "#115e59",
  900: "#134e4a",
} as const;

/**
 * Colores de estado, reservados para su significado.
 *
 * El verde de éxito es deliberadamente más amarillento que el acento, para que
 * no se confundan. Ningún significado depende solo del color: siempre va
 * acompañado de un ícono o de texto.
 */
export const ESTADO = {
  exito: { claro: "#4d7c0f", oscuro: "#a3e635", fondo: "#ecfccb", fondoOscuro: "#1a2e05" },
  advertencia: { claro: "#b45309", oscuro: "#fbbf24", fondo: "#fef3c7", fondoOscuro: "#292007" },
  peligro: { claro: "#b91c1c", oscuro: "#f87171", fondo: "#fee2e2", fondoOscuro: "#300c0c" },
} as const;

/** Tokens semánticos: lo que usan los componentes. Nunca la escala cruda. */
export const TEMA_CLARO = {
  fondo: NEUTRO[50],
  superficie: "#ffffff",
  superficieSuave: NEUTRO[100],
  texto: NEUTRO[900],
  // zinc-600 y no zinc-500: sobre superficie-suave, zinc-500 da 4,39:1 y el
  // mínimo accesible es 4,5:1 (lo detectó axe en los tests end-to-end).
  textoSecundario: NEUTRO[600],
  borde: NEUTRO[200],
  bordeFuerte: NEUTRO[300],
  acento: ACENTO[700],
  acentoTexto: "#ffffff",
  acentoSuave: ACENTO[100],
  acentoSuaveTexto: ACENTO[900],
  exito: ESTADO.exito.claro,
  exitoFondo: ESTADO.exito.fondo,
  advertencia: ESTADO.advertencia.claro,
  advertenciaFondo: ESTADO.advertencia.fondo,
  peligro: ESTADO.peligro.claro,
  peligroFondo: ESTADO.peligro.fondo,
} as const;

export const TEMA_OSCURO = {
  fondo: NEUTRO[950],
  superficie: NEUTRO[900],
  superficieSuave: NEUTRO[800],
  texto: NEUTRO[50],
  textoSecundario: NEUTRO[400],
  borde: NEUTRO[800],
  bordeFuerte: NEUTRO[700],
  acento: ACENTO[600],
  acentoTexto: NEUTRO[950],
  acentoSuave: ACENTO[900],
  acentoSuaveTexto: ACENTO[100],
  exito: ESTADO.exito.oscuro,
  exitoFondo: ESTADO.exito.fondoOscuro,
  advertencia: ESTADO.advertencia.oscuro,
  advertenciaFondo: ESTADO.advertencia.fondoOscuro,
  peligro: ESTADO.peligro.oscuro,
  peligroFondo: ESTADO.peligro.fondoOscuro,
} as const;

export type TokensDeTema = typeof TEMA_CLARO;
export type NombreDeToken = keyof TokensDeTema;

/** Tipografía: una sola familia (Geist) y tres pesos como máximo. */
export const TIPOGRAFIA = {
  familia: {
    texto: "var(--font-geist-sans), system-ui, -apple-system, Segoe UI, sans-serif",
    mono: "var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace",
  },
  tamano: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.375rem",
    "2xl": "1.75rem",
  },
  peso: {
    regular: "400",
    medio: "500",
    semibold: "600",
  },
  interlineado: {
    ajustado: "1.25",
    normal: "1.5",
  },
} as const;

/** Espaciado en múltiplos de 4 px, con separaciones generosas entre bloques. */
export const ESPACIADO = {
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  8: "2rem",
  10: "2.5rem",
  12: "3rem",
  16: "4rem",
} as const;

/** Esquinas redondeadas moderadas: 8 px en controles, 12 px en tarjetas. */
export const RADIO = {
  control: "0.5rem",
  tarjeta: "0.75rem",
  completo: "9999px",
} as const;

/**
 * Escala de elevación. Cada nivel significa algo (ver docs/guias/estetica.md):
 * `sutil` apoyado sobre el fondo, `elevada` levantado y reaccionando al mouse,
 * `flotante` por encima del contenido.
 *
 * Las del modo oscuro son más marcadas: sobre fondo oscuro una sombra suave no
 * se ve, así que se compensa con más opacidad.
 */
export const SOMBRA = {
  claro: {
    sutil: "0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)",
    elevada: "0 4px 6px -2px rgb(0 0 0 / 0.06), 0 10px 20px -4px rgb(0 0 0 / 0.1)",
    flotante: "0 8px 12px -4px rgb(0 0 0 / 0.08), 0 20px 36px -8px rgb(0 0 0 / 0.16)",
  },
  oscuro: {
    sutil: "0 1px 2px 0 rgb(0 0 0 / 0.4), 0 1px 3px 0 rgb(0 0 0 / 0.3)",
    elevada: "0 4px 6px -2px rgb(0 0 0 / 0.45), 0 10px 20px -4px rgb(0 0 0 / 0.55)",
    flotante: "0 8px 12px -4px rgb(0 0 0 / 0.5), 0 20px 36px -8px rgb(0 0 0 / 0.65)",
  },
} as const;

export type NivelDeElevacion = keyof typeof SOMBRA.claro;

/**
 * Animaciones.
 *
 * El movimiento es parte del producto: cada duración tiene un para qué, no es
 * una escala arbitraria (ver docs/guias/estetica.md).
 */
export const ANIMACION = {
  duracion: {
    /** Respuesta al mouse y al clic: hovers, presionado, foco. */
    rapida: "150ms",
    /** Cambios de estado: aparecer, desaparecer, cambiar de tamaño. */
    normal: "240ms",
    /** Transiciones compuestas, con varias partes. */
    lenta: "380ms",
  },
  curva: {
    salida: "cubic-bezier(0.16, 1, 0.3, 1)",
    entrada: "cubic-bezier(0.4, 0, 1, 1)",
  },
  /** Desplazamiento de entrada: unos pocos píxeles, nunca un salto grande. */
  desplazamiento: "6px",
  /** Cuánto se levanta un elemento al pasarle el mouse. */
  levantada: "1px",
} as const;

/** Duraciones en milisegundos, para Motion y Reanimated. */
export const DURACION_MS = {
  rapida: 150,
  normal: 240,
  lenta: 380,
} as const;

/** Curva como array, que es como la piden Motion y Reanimated. */
export const CURVA_SALIDA = [0.16, 1, 0.3, 1] as const;

/**
 * Resortes, para lo que responde a una acción directa: la pastilla de una
 * pestaña, un panel que se abre.
 *
 * Dan una sensación más física que una curva fija. Con poco rebote: nada
 * elástico ni caricaturesco.
 */
export const RESORTE = {
  suave: { type: "spring", stiffness: 380, damping: 32, mass: 0.8 },
  firme: { type: "spring", stiffness: 520, damping: 34, mass: 0.7 },
} as const;

/**
 * Diferencia entre un elemento y el siguiente en una entrada en cascada, en
 * segundos. Es lo que hace que una pantalla se arme en vez de aparecer de golpe.
 */
export const ESCALONADO_S = 0.04;

/**
 * Microinteracciones: la respuesta inmediata de todo lo que se puede tocar.
 *
 * Es una escala aparte de `ANIMACION` a propósito. Aquellas duraciones
 * describen *cambios de estado* de la pantalla (algo aparece, algo cambia de
 * tamaño); estas describen el *tacto*: lo que pasa mientras el dedo o el mouse
 * está encima. Por eso hay una sola duración y no tres.
 */
export const MICROINTERACCION = {
  duracion: "220ms",
  curva: "cubic-bezier(0.16, 1, 0.3, 1)",
  /** Cuánto se achica algo al presionarlo. Da la sensación de que se hunde. */
  escalaPresion: "0.97",
  /** Cuánto se levanta al pasarle el mouse. **Solo botones.** */
  elevacionHover: "2px",
} as const;

/**
 * Brillo de bordes: el borde de una superficie se enciende con el acento cerca
 * del puntero, y se apaga al alejarse.
 *
 * `alcance` es el radio del halo alrededor del puntero, `intensidad` qué
 * proporción del acento llega a mostrarse en el punto más brillante y `grosor`
 * el ancho de la línea encendida (el mismo que un borde normal: se enciende el
 * borde que ya está, no se agrega uno nuevo).
 */
export const BRILLO_DE_BORDE = {
  alcance: "250px",
  intensidad: "40%",
  grosor: "1px",
} as const;

/**
 * Proporción de la duración base que dura el presionado.
 *
 * El hundido es más rápido que el levantado a propósito: la respuesta al clic
 * tiene que sentirse instantánea, mientras que la del hover puede acompañar.
 */
export const PROPORCION_PRESION = 0.4;

/**
 * Fondo animado.
 *
 * Formas de color difuminadas que se mueven, giran, cambian de tamaño y de
 * color muy despacio, detrás de todo el contenido.
 *
 * El difuminado no sale de `filter: blur()` sino de dibujar chico y dejar que
 * el navegador agrande: el canvas se pinta a `1/difuminado` del tamaño de la
 * ventana y se estira por CSS a pantalla completa, y esa interpolación es la
 * que suaviza los bordes. Pintar 15 gradientes radiales sobre un lienzo de
 * ~53×33 px cuesta prácticamente nada, mientras que un `blur` de ese radio
 * sobre la ventana entera es de las operaciones más caras que hay
 * (docs/guias/rendimiento.md).
 *
 * El algoritmo completo, con todas sus constantes, está en
 * `docs/referencias/fondo-animado.md`.
 */
export const FONDO_ANIMADO = {
  /** Cuántas formas. Se reparten en una cuadrícula para cubrir toda la ventana. */
  formas: 15,
  /** 0 = círculos. Más alto, elipses cada vez más alargadas. */
  variedadFormas: 0,
  /** Radio de cada forma como fracción del lado mayor del canvas. */
  tamano: 0.4,
  /** Multiplicadores de las velocidades base de movimiento y de ciclo de color. */
  velocidad: 1,
  cicloColor: 1,
  /** Cuántas veces más chico se dibuja el canvas que la ventana. */
  difuminado: 24,
  /** Tope de cuadros por segundo: de un fondo tan lento nadie nota más. */
  cuadrosPorSegundo: 30,
  /** Tope al salto de tiempo entre cuadros, en milisegundos. */
  saltoMaximoMs: 100,
  claro: {
    /**
     * Opacidad del canvas entero: es lo que decide cuánto se nota el fondo.
     *
     * Arrancó en 0.1 y se subió a 0.18 porque sobre el fondo casi blanco el
     * lavado apenas se percibía. El techo no es estético sino de contraste: a
     * 0.30 el texto secundario cae a 4,97:1 y el margen se vuelve incómodo (hay
     * un test que lo verifica sobre todo el rango de tonos).
     */
    intensidad: 0.18,
    /** Tono central en grados y cuánto se aparta cada forma de él. */
    tono: 175,
    rango: 75,
    /** Saturación, luminosidad y opacidad de cada forma dentro del canvas. */
    sat: 78,
    luz: 72,
    alfa: 0.85,
  },
  oscuro: {
    // Más intenso que en claro: sobre un fondo casi negro, el mismo lavado no
    // se percibe.
    intensidad: 0.25,
    tono: 200,
    rango: 55,
    sat: 62,
    luz: 30,
    alfa: 0.9,
  },
} as const;

/**
 * La parte del fondo animado que cambia con el tema.
 *
 * Se escribe a mano en vez de `typeof FONDO_ANIMADO.claro` porque aquello da
 * los valores literales (`intensidad: 0.1`) y entonces la paleta oscura no
 * encaja donde se espera la clara.
 */
export type PaletaDeFondo = {
  intensidad: number;
  tono: number;
  rango: number;
  sat: number;
  luz: number;
  alfa: number;
};

/**
 * Cuánto se desplaza la luminosidad de cada forma respecto de la del tema.
 *
 * Es lo que hace que las formas no se lean como una sola mancha plana: unas
 * quedan un poco más claras y otras un poco más oscuras.
 */
export const DESPLAZAMIENTO_DE_LUZ = 14;
