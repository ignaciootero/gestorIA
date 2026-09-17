// Identidad de la aplicacion.
//
// El nombre vive acá y no repetido en cada pantalla: lo usan los títulos de la
// web, la barra superior, el pie y el asunto de los correos que salen desde la
// API. Cambiarlo es cambiarlo en un solo lugar.

/**
 * Nombre de la aplicacion: juego de palabras entre "gestoría" e "IA".
 *
 * Se escribe siempre así, con la g minúscula y las dos últimas letras en
 * mayúscula, incluso al principio de una oración: la mayúscula es lo que hace
 * visible el juego de palabras.
 */
export const NOMBRE_APP = "gestorIA";

/**
 * Las dos mitades del nombre, para poder destacar la segunda.
 *
 * El logotipo pinta "IA" con el color de acento; el resto de los usos (títulos,
 * asuntos de correo) usan NOMBRE_APP entero.
 */
export const NOMBRE_APP_PARTES = { raiz: "gestor", ia: "IA" } as const;

/** Descripción corta, para las etiquetas de la web. */
export const DESCRIPCION_APP =
  "Gestión personal de gastos, contactos, calendario y tareas, con entrada por lenguaje natural.";

/** Arma el título de una pantalla: "Entrar · gestorIA". */
export function tituloDePantalla(pantalla?: string): string {
  return pantalla ? `${pantalla} · ${NOMBRE_APP}` : NOMBRE_APP;
}
