// Colores de las etiquetas de contactos: cómo se mezclan para pintar el avatar de un contacto con
// varias etiquetas, y qué color de texto se lee bien encima.
//
// Funciones puras sobre colores "#rrggbb" (el formato que guarda la base para las etiquetas).

type Rgb = readonly [number, number, number];

const FORMATO = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

function aRgb(color: string): Rgb | null {
  const coincidencia = FORMATO.exec(color);
  if (!coincidencia) return null;
  return [
    Number.parseInt(coincidencia[1] ?? "0", 16),
    Number.parseInt(coincidencia[2] ?? "0", 16),
    Number.parseInt(coincidencia[3] ?? "0", 16),
  ];
}

function aHex([rojo, verde, azul]: Rgb): string {
  return `#${[rojo, verde, azul].map((canal) => Math.round(canal).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * La mezcla de varios colores: el promedio de cada canal, así todas las etiquetas pesan lo mismo. Con
 * un solo color es ese color; sin ninguno (o con colores mal escritos) es null.
 */
export function mezclarColores(colores: readonly string[]): string | null {
  const validos = colores.map(aRgb).filter((rgb): rgb is Rgb => rgb !== null);
  if (validos.length === 0) return null;

  const suma = validos.reduce<Rgb>(
    (total, rgb) => [total[0] + rgb[0], total[1] + rgb[1], total[2] + rgb[2]],
    [0, 0, 0],
  );
  return aHex([suma[0] / validos.length, suma[1] / validos.length, suma[2] / validos.length]);
}

/** Luminancia relativa de WCAG: 0 es negro y 1 es blanco. */
function luminancia([rojo, verde, azul]: Rgb): number {
  const lineal = (canal: number) => {
    const valor = canal / 255;
    return valor <= 0.039_28 ? valor / 12.92 : ((valor + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lineal(rojo) + 0.7152 * lineal(verde) + 0.0722 * lineal(azul);
}

export const TEXTO_CLARO = "#ffffff";
export const TEXTO_OSCURO = "#000000";

/**
 * El texto —blanco o negro— que se lee mejor sobre ese fondo (el de mayor contraste). Sobre
 * cualquier color uno de los dos llega al menos a 4,5:1, el mínimo de accesibilidad para texto.
 */
export function colorDeTextoSobre(fondo: string): string {
  const rgb = aRgb(fondo);
  if (!rgb) return TEXTO_OSCURO;
  const brillo = luminancia(rgb);
  const contrasteConBlanco = 1.05 / (brillo + 0.05);
  const contrasteConNegro = (brillo + 0.05) / (luminancia(aRgb(TEXTO_OSCURO) ?? [0, 0, 0]) + 0.05);
  return contrasteConBlanco >= contrasteConNegro ? TEXTO_CLARO : TEXTO_OSCURO;
}
