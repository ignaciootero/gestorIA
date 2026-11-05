// Color de acento elegido por la persona.
//
// La app tiene un acento por defecto (verde agua, ver ACENTO en index.ts) que se puede cambiar
// por cualquier color, uno para el modo claro y otro para el oscuro. Pero el acento no es un
// solo color: son cuatro tonos que trabajan juntos (el color de botones y enlaces, el texto que va
// encima, un fondo suave para lo seleccionado y el texto sobre ese fondo). Este archivo arma los
// cuatro a partir del color elegido.
//
// Cómo:
// - Se trabaja en OKLCH: luminosidad (L), intensidad (C) y tono (h). A diferencia de HSL, la L de
//   OKLCH es perceptual: un amarillo y un azul con la misma L se ven igual de claros. Eso permite
//   fijar la luminosidad de cada uso sin importar el tono.
// - El acento es el color elegido tal cual, siempre que se pueda leer el texto encima y sobre la
//   superficie. Si no (un amarillo clarito en modo claro, un azul marino en oscuro), se le cambia
//   solo la luminosidad, lo justo para llegar al contraste mínimo. El tono no se toca nunca.
// - El fondo suave y su texto usan el tono y la intensidad del color, con luminosidades fijas.
//
// No depende de ninguna librería: las conversiones son las fórmulas publicadas de OKLab
// (Björn Ottosson, 2020) y la luminancia relativa y el contraste son los de WCAG 2.

/** Un color "#rrggbb". */
export type ColorHex = `#${string}`;

export type ModoDeColor = "claro" | "oscuro";

/** Los cuatro tonos del acento para un modo. Mismos nombres que en TEMA_CLARO/TEMA_OSCURO. */
export type TonosDeAcento = {
  acento: ColorHex;
  acentoTexto: ColorHex;
  acentoSuave: ColorHex;
  acentoSuaveTexto: ColorHex;
};

/** Contraste mínimo de texto normal (WCAG AA). */
export const CONTRASTE_MINIMO = 4.5;

const HEX = /^#[0-9a-f]{6}$/i;

/** Si el texto es un color "#rrggbb" (en mayúsculas o minúsculas). */
export function esColorHex(valor: unknown): valor is ColorHex {
  return typeof valor === "string" && HEX.test(valor);
}

// --- Conversiones ---

type Rgb = [number, number, number];
type Oklch = { l: number; c: number; h: number };

function desdeHex(hex: string): Rgb {
  return [1, 3, 5].map((inicio) => Number.parseInt(hex.slice(inicio, inicio + 2), 16) / 255) as Rgb;
}

function aHex([r, g, b]: Rgb): ColorHex {
  const canal = (valor: number) =>
    Math.round(Math.min(1, Math.max(0, valor)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${canal(r)}${canal(g)}${canal(b)}`;
}

/** sRGB con gamma → sRGB lineal (y al revés). */
function aLineal(canal: number): number {
  return canal <= 0.04045 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4;
}
function desdeLineal(canal: number): number {
  return canal <= 0.0031308 ? canal * 12.92 : 1.055 * canal ** (1 / 2.4) - 0.055;
}

function aOklch(rgb: Rgb): Oklch {
  const [r, g, b] = rgb.map(aLineal) as Rgb;
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const l = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const c = Math.hypot(a, bb);
  const h = ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  return { l, c, h };
}

/** OKLCH → sRGB lineal, sin recortar: puede salir del rango 0..1 si el color no existe en sRGB. */
function desdeOklchLineal({ l, c, h }: Oklch): Rgb {
  const radianes = (h * Math.PI) / 180;
  const a = c * Math.cos(radianes);
  const b = c * Math.sin(radianes);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

function entraEnSrgb(lineal: Rgb): boolean {
  return lineal.every((canal) => canal >= -1e-6 && canal <= 1 + 1e-6);
}

/**
 * El color OKLCH más parecido que existe en sRGB: misma luminosidad y tono, con la intensidad
 * bajada lo necesario (los colores muy intensos y muy claros u oscuros no se pueden mostrar).
 */
function aHexDentroDeSrgb(color: Oklch): ColorHex {
  let c = color.c;
  if (!entraEnSrgb(desdeOklchLineal({ ...color, c }))) {
    let abajo = 0;
    let arriba = c;
    for (let paso = 0; paso < 24; paso += 1) {
      const medio = (abajo + arriba) / 2;
      if (entraEnSrgb(desdeOklchLineal({ ...color, c: medio }))) abajo = medio;
      else arriba = medio;
    }
    c = abajo;
  }
  return aHex(desdeOklchLineal({ ...color, c }).map(desdeLineal) as Rgb);
}

// --- Contraste (WCAG 2) ---

function luminancia(hex: string): number {
  const [r, g, b] = desdeHex(hex).map(aLineal) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste entre dos colores, de 1 a 21. */
export function contraste(uno: string, otro: string): number {
  const [claro, oscuro] = [luminancia(uno), luminancia(otro)].sort((a, b) => b - a) as [
    number,
    number,
  ];
  return (claro + 0.05) / (oscuro + 0.05);
}

// --- Derivación ---

// Los valores de NEUTRO se repiten acá en vez de importarlos de index.ts, que a su vez exporta
// este archivo: con el import circular, estas constantes se evaluarían antes de existir NEUTRO.
// Un test verifica que coincidan con TEMA_CLARO y TEMA_OSCURO.

/** Superficies sobre las que se apoya el acento (botones, enlaces y foco). */
export const SUPERFICIE_DEL_ACENTO: Record<ModoDeColor, ColorHex> = {
  claro: "#ffffff",
  oscuro: "#18181b",
};
/** El texto que va sobre el acento: blanco en claro, casi negro en oscuro (como el original). */
export const TEXTO_SOBRE_ACENTO: Record<ModoDeColor, ColorHex> = {
  claro: "#ffffff",
  oscuro: "#09090b",
};

/**
 * Luminosidades del fondo suave y su texto. Salen del acento original (verde agua): en claro, un
 * fondo casi blanco con texto oscuro; en oscuro, al revés.
 */
const SUAVE: Record<ModoDeColor, { fondo: number; texto: number }> = {
  claro: { fondo: 0.955, texto: 0.38 },
  oscuro: { fondo: 0.38, texto: 0.955 },
};
/** Tope de intensidad del fondo suave y su texto: con más, el fondo deja de ser "suave". */
const INTENSIDAD_SUAVE = { fondo: 0.06, texto: 0.08 };

/** Cuánto se mueve la luminosidad en cada intento al buscar el contraste. */
const PASO = 0.005;

/**
 * Mueve la luminosidad (hacia `direccion`) hasta que `cumple` dé verdadero o se llegue al extremo.
 * Con luminosidad 0 o 1 el color es negro o blanco, así que siempre termina en algo que cumple.
 */
function ajustarLuminosidad(
  color: Oklch,
  direccion: 1 | -1,
  cumple: (hex: ColorHex) => boolean,
): ColorHex {
  const extremo = direccion === 1 ? 1 : 0;
  let l = color.l;
  let hex = aHexDentroDeSrgb(color);
  // Se corta al llegar al extremo hacia el que se mueve (no al opuesto: un negro en modo oscuro
  // arranca en 0 y tiene que poder aclararse).
  while (!cumple(hex) && l !== extremo) {
    l = direccion === 1 ? Math.min(1, l + PASO) : Math.max(0, l - PASO);
    hex = aHexDentroDeSrgb({ ...color, l });
  }
  return hex;
}

/** Los cuatro tonos del acento para un modo, a partir del color que eligió la persona. */
export function derivarAcento(color: ColorHex, modo: ModoDeColor): TonosDeAcento {
  const elegido = aOklch(desdeHex(color));
  const superficie = SUPERFICIE_DEL_ACENTO[modo];
  const acentoTexto = TEXTO_SOBRE_ACENTO[modo];

  // En claro el acento lleva texto blanco encima: si no alcanza, se oscurece. En oscuro lleva
  // texto casi negro: si no alcanza, se aclara. En los dos casos tiene que leerse sobre la
  // superficie (enlaces, foco), que en cada modo pide moverse para el mismo lado.
  const acento = ajustarLuminosidad(
    elegido,
    modo === "claro" ? -1 : 1,
    (hex) =>
      contraste(hex, acentoTexto) >= CONTRASTE_MINIMO &&
      contraste(hex, superficie) >= CONTRASTE_MINIMO,
  );

  const suave = SUAVE[modo];
  const acentoSuave = aHexDentroDeSrgb({
    l: suave.fondo,
    c: Math.min(elegido.c, INTENSIDAD_SUAVE.fondo),
    h: elegido.h,
  });
  // El texto se aleja del fondo (más oscuro en claro, más claro en oscuro) hasta leerse.
  const acentoSuaveTexto = ajustarLuminosidad(
    { l: suave.texto, c: Math.min(elegido.c, INTENSIDAD_SUAVE.texto), h: elegido.h },
    modo === "claro" ? -1 : 1,
    (hex) => contraste(hex, acentoSuave) >= CONTRASTE_MINIMO,
  );

  return { acento, acentoTexto, acentoSuave, acentoSuaveTexto };
}

/** Diferencia entre el tono del fondo animado oscuro y el claro en la paleta original (200 - 175). */
const CORRIMIENTO_DEL_FONDO_OSCURO = 25;

/**
 * El tono (en grados de HSL, 0 a 360) del fondo animado para un color elegido. El fondo original
 * está en 175 en claro (el tono del verde agua) y en 200 en oscuro, un poco más azulado: se
 * mantiene esa misma relación con el color nuevo.
 */
export function tonoDelFondo(color: ColorHex, modo: ModoDeColor): number {
  const [r, g, b] = desdeHex(color);
  const maximo = Math.max(r, g, b);
  const diferencia = maximo - Math.min(r, g, b);
  let tono = 0;
  if (diferencia > 0) {
    if (maximo === r) tono = ((g - b) / diferencia) % 6;
    else if (maximo === g) tono = (b - r) / diferencia + 2;
    else tono = (r - g) / diferencia + 4;
  }
  const grados = (tono * 60 + 360) % 360;
  return modo === "oscuro" ? (grados + CORRIMIENTO_DEL_FONDO_OSCURO) % 360 : grados;
}
