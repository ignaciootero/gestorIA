// Ajustes del fondo animado que elige cada persona: uno por modo, como el color de acento.
//
// Null en un modo es "el fondo de la app". Los valores son porcentajes enteros; qué significa
// cada uno (y los valores por defecto) está en packages/ui-tokens, fondo-personalizado.ts. Los
// límites son los mismos que LIMITES_DEL_FONDO de ahí (shared no depende de ui-tokens).

import { z } from "zod";

const porcentaje = (minimo: number, maximo: number) =>
  z
    .number()
    .int("Tiene que ser un número entero.")
    .min(minimo, `No puede ser menos de ${minimo}.`)
    .max(maximo, `No puede pasar de ${maximo}.`);

export const esquemaAjustesDelFondo = z.strictObject({
  intensidad: porcentaje(0, 100),
  velocidad: porcentaje(0, 300),
  tamano: porcentaje(50, 150),
  tonoSecundario: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Ese color no es válido.")
    .toLowerCase()
    .nullable(),
});

export const esquemaFondos = z.strictObject({
  claro: esquemaAjustesDelFondo.nullable(),
  oscuro: esquemaAjustesDelFondo.nullable(),
});

export type AjustesDelFondoGuardados = z.infer<typeof esquemaAjustesDelFondo>;
export type Fondos = z.infer<typeof esquemaFondos>;

/**
 * Lee los ajustes guardados en la cuenta (van como texto JSON). Si no hay, o lo guardado ya no
 * es válido, da null: el fondo de la app.
 */
export function leerAjustesDelFondo(
  texto: string | null | undefined,
): AjustesDelFondoGuardados | null {
  if (!texto) return null;
  try {
    const resultado = esquemaAjustesDelFondo.safeParse(JSON.parse(texto));
    return resultado.success ? resultado.data : null;
  } catch {
    return null;
  }
}
