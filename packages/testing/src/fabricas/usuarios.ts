// Fabrica de datos de usuario para los tests.
//
// Devuelve datos validos con valores por defecto, y deja sobrescribir lo que el
// test necesite: asi cada test dice solo lo que le importa
// (ver docs/guias/testing.md).
//
// Todos los datos son ficticios. Nunca información real de personas.

import { type DatosRegistro, LARGO_MAXIMO_CAMPO } from "@gestoria/shared";

let contador = 0;

/** Sufijo distinto en cada llamada, para que usuario y correo no choquen. */
function siguiente(): string {
  contador += 1;
  return `${Date.now().toString(36)}${contador}`;
}

export type DatosUsuarioDePrueba = DatosRegistro & {
  usuario: string;
  email: string;
  password: string;
};

/**
 * Datos de registro validos.
 *
 * @example crearUsuarioDePrueba({ usuario: "iotero" })
 */
export function crearUsuarioDePrueba(
  sobrescribir: Partial<DatosUsuarioDePrueba> = {},
): DatosUsuarioDePrueba {
  const id = siguiente();

  return {
    // El usuario tiene un máximo de 20 caracteres, así que el sufijo se recorta.
    usuario: `p.${id}`.slice(0, LARGO_MAXIMO_CAMPO),
    nombre: "Ana",
    apellido: "Pérez",
    email: `ana.${id}@ejemplo.test`,
    password: "clave-de-prueba",
    ...sobrescribir,
  };
}

/** Contraseña valida distinta de la que usa la fabrica por defecto. */
export const OTRA_PASSWORD_VALIDA = "otra-clave-valida";

/** Una contraseña de exactamente el largo maximo permitido. */
export const PASSWORD_EN_EL_LIMITE = "a".repeat(LARGO_MAXIMO_CAMPO);
