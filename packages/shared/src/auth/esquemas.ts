// Esquemas Zod de autenticacion.
//
// Los usan el formulario de la web (con react-hook-form) y la API, que valida el
// cuerpo del registro contra `esquemaRegistroServidor` antes de dejarlo pasar.
// Al ser los mismos, no hay forma de que las reglas del cliente y del servidor
// se desincronicen, y nada de lo que se valida en el navegador queda sin
// verificar en el servidor (docs/guias/seguridad-y-datos.md).

import { z } from "zod";

/**
 * Largo maximo de los campos cortos del registro: usuario, nombre, apellido y
 * contraseña. Es un limite deliberado del proyecto, no una restriccion tecnica.
 */
export const LARGO_MAXIMO_CAMPO = 24;

export const LARGO_MINIMO_PASSWORD = 8;
export const LARGO_MAXIMO_PASSWORD = LARGO_MAXIMO_CAMPO;

export const LARGO_MINIMO_USUARIO = 3;
export const LARGO_MAXIMO_USUARIO = LARGO_MAXIMO_CAMPO;

export const LARGO_MAXIMO_EMAIL = 254;

/** Minusculas, numeros, punto, guion y guion bajo. Sin tildes ni ñ. */
const FORMATO_USUARIO = /^[a-z0-9._-]+$/;

export const esquemaUsuario = z
  .string()
  .trim()
  .toLowerCase()
  .min(LARGO_MINIMO_USUARIO, `El usuario necesita al menos ${LARGO_MINIMO_USUARIO} caracteres.`)
  .max(LARGO_MAXIMO_USUARIO, `El usuario no puede pasar de ${LARGO_MAXIMO_USUARIO} caracteres.`)
  .regex(FORMATO_USUARIO, "Usá solo minúsculas, números, puntos, guiones y guiones bajos.");

// Se limpia ANTES de validar, no después: `z.email()` comprueba el formato de
// entrada, así que un correo pegado con un espacio al final (algo habitual en el
// teléfono) se rechazaría en vez de corregirse solo.
export const esquemaEmail = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Revisá el correo: parece que le falta algo."))
  .pipe(z.string().max(LARGO_MAXIMO_EMAIL, "El correo es demasiado largo."));

export const esquemaPassword = z
  .string()
  .min(
    LARGO_MINIMO_PASSWORD,
    `La contraseña necesita al menos ${LARGO_MINIMO_PASSWORD} caracteres.`,
  )
  .max(
    LARGO_MAXIMO_PASSWORD,
    `La contraseña no puede pasar de ${LARGO_MAXIMO_PASSWORD} caracteres.`,
  );

/** Nombre o apellido: obligatorio, sin espacios sobrantes y corto. */
const esquemaNombrePropio = (etiqueta: string) =>
  z
    .string()
    .trim()
    .min(1, `Completá tu ${etiqueta}.`)
    .max(LARGO_MAXIMO_CAMPO, `Tu ${etiqueta} no puede pasar de ${LARGO_MAXIMO_CAMPO} caracteres.`);

export const esquemaNombre = esquemaNombrePropio("nombre");
export const esquemaApellido = esquemaNombrePropio("apellido");

/**
 * Registro de una cuenta nueva, tal como lo completa el formulario de la web.
 *
 * `honeypot` es un campo que la interfaz oculta: una persona nunca lo completa,
 * un bot que llena todos los campos del formulario sí. Si llega con contenido,
 * el servidor rechaza el registro.
 */
export const esquemaRegistro = z.object({
  usuario: esquemaUsuario,
  nombre: esquemaNombre,
  apellido: esquemaApellido,
  email: esquemaEmail,
  password: esquemaPassword,
  honeypot: z.string().max(0).optional(),
});

export type DatosRegistro = z.infer<typeof esquemaRegistro>;

/**
 * El mismo registro, pero con los nombres de campo que viajan a Better Auth.
 *
 * La API valida el cuerpo con esto antes de dejar pasar la peticion, de modo que
 * nadie pueda saltear las reglas del formulario llamando al endpoint por su
 * cuenta. `name` lo arma el cliente juntando nombre y apellido.
 */
export const esquemaRegistroServidor = z.object({
  username: esquemaUsuario,
  nombre: esquemaNombre,
  apellido: esquemaApellido,
  email: esquemaEmail,
  password: esquemaPassword,
  name: z
    .string()
    .trim()
    .min(1, "Falta el nombre completo.")
    .max(LARGO_MAXIMO_CAMPO * 2 + 1, "El nombre completo es demasiado largo."),
  honeypot: z.string().max(0).optional(),
});

/**
 * Inicio de sesion.
 *
 * Un unico campo acepta usuario o correo: quien vuelve despues de meses no
 * tiene por que acordarse con cual se registro (ver docs/guias/usabilidad.md).
 */
export const esquemaLogin = z.object({
  identificador: z
    .string()
    .trim()
    .min(1, "Escribí tu usuario o tu correo.")
    .max(LARGO_MAXIMO_EMAIL, "Eso es demasiado largo para ser un usuario o un correo."),
  // A propósito sin largo mínimo: si alguien tiene una contraseña vieja más
  // corta, tiene que poder entrar para después cambiarla.
  password: z.string().min(1, "Escribí tu contraseña."),
});

export type DatosLogin = z.infer<typeof esquemaLogin>;

/** True si el identificador que escribio la persona parece un correo. */
export function pareceEmail(identificador: string): boolean {
  return identificador.includes("@");
}

/** Reenvio del correo de verificacion. */
export const esquemaReenvioVerificacion = z.object({
  email: esquemaEmail,
});

export const esquemaCambioPassword = z
  .object({
    passwordActual: z.string().min(1, "Escribí tu contraseña actual."),
    passwordNueva: esquemaPassword,
    passwordNuevaRepetida: z.string(),
  })
  .refine((datos) => datos.passwordNueva === datos.passwordNuevaRepetida, {
    message: "Las dos contraseñas no coinciden.",
    path: ["passwordNuevaRepetida"],
  })
  .refine((datos) => datos.passwordActual !== datos.passwordNueva, {
    message: "La contraseña nueva tiene que ser distinta de la actual.",
    path: ["passwordNueva"],
  });

export type DatosCambioPassword = z.infer<typeof esquemaCambioPassword>;
