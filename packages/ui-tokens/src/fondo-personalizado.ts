// Ajustes del fondo animado que puede cambiar cada persona (uno por modo, como el color de acento).
//
// Se guardan como números "humanos" (porcentajes enteros), no como los valores internos del
// fondo: así el esquema de validación es simple y, si mañana cambian los valores base en
// FONDO_ANIMADO, lo que eligió cada persona sigue significando lo mismo ("el doble de rápido").

import type { ModoDeColor } from "./acento-personalizado.ts";

export type AjustesDelFondo = {
  /** 0 a 100: qué tanto se nota, como porcentaje del máximo legible. 0 apaga el fondo. */
  intensidad: number;
  /** 0 a 300: porcentaje de la velocidad normal (100). 0 es quieto. */
  velocidad: number;
  /** 50 a 150: porcentaje del tamaño normal de las manchas (100). */
  tamano: number;
  /** "#rrggbb": un segundo tono hacia el que van y vienen las manchas. Null: solo el principal. */
  tonoSecundario: string | null;
};

/**
 * La intensidad más alta (opacidad del lienzo) con la que el texto sigue legible, con cualquier
 * tono. El 100 % del ajuste es esto.
 *
 * El límite lo pone el texto secundario: las manchas se apilan y en el peor punto llega a la
 * pantalla el color pleno con esta opacidad. Con el tono más desfavorable de los 360, el texto
 * secundario cae a 4,5:1 cerca de 0,35 en claro y de 0,33 en oscuro; se deja un margen. Lo
 * verifica tokens.test.ts recorriendo todos los tonos.
 */
export const INTENSIDAD_MAXIMA_DEL_FONDO: Record<ModoDeColor, number> = {
  claro: 0.32,
  oscuro: 0.3,
};

export const LIMITES_DEL_FONDO = {
  intensidad: { minimo: 0, maximo: 100 },
  velocidad: { minimo: 0, maximo: 300 },
  tamano: { minimo: 50, maximo: 150 },
} as const;

/**
 * Lo que da el fondo de la app, expresado en los mismos porcentajes. La intensidad es la de
 * FONDO_ANIMADO (0,18 en claro y 0,25 en oscuro) como porcentaje del máximo; un test verifica
 * que coincidan.
 */
export const AJUSTES_DEL_FONDO_POR_DEFECTO: Record<ModoDeColor, AjustesDelFondo> = {
  claro: { intensidad: 56, velocidad: 100, tamano: 100, tonoSecundario: null },
  oscuro: { intensidad: 83, velocidad: 100, tamano: 100, tonoSecundario: null },
};

/** La opacidad del lienzo para un porcentaje de intensidad. */
export function opacidadDelFondo(intensidad: number, modo: ModoDeColor): number {
  const acotada = Math.min(100, Math.max(0, intensidad));
  const opacidad = (acotada / 100) * INTENSIDAD_MAXIMA_DEL_FONDO[modo];
  return Math.round(opacidad * 1000) / 1000;
}

/**
 * Un tono entre `desde` y `hasta` (en grados), por el camino corto del círculo: de 350 a 10 pasa
 * por 0, no por 180. `mezcla` 0 es `desde` y 1 es `hasta`.
 */
export function mezclarTonos(desde: number, hasta: number, mezcla: number): number {
  const diferencia = ((((hasta - desde) % 360) + 540) % 360) - 180;
  return (((desde + diferencia * mezcla) % 360) + 360) % 360;
}
