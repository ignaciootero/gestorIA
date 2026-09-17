// Traduce los códigos de error de la API a mensajes para la persona.
//
// La API manda un `codigo` estable y un `mensaje`; la web decide cómo mostrarlo
// y, cuando corresponde, junto a qué campo. Tener la traducción acá y no
// desperdigada por las pantallas es lo que hace que el mismo problema se
// explique siempre igual (docs/guias/usabilidad.md, Consistencia).

import { CODIGOS_ERROR, type CodigoError, esRespuestaError } from "@gestoria/shared";

export type ErrorParaMostrar = {
  /** Código original de la API, para los casos que necesitan un trato especial. */
  codigo?: CodigoError | undefined;
  /** Mensaje principal. Dice qué pasó y, cuando se puede, qué hacer. */
  mensaje: string;
  /** Campo del formulario al que corresponde, si el error es de un campo. */
  campo?: "identificador" | "password" | "usuario" | "email" | "nombre" | "apellido";
  /** true cuando no tiene sentido reintentar tal cual (la cuenta no puede entrar). */
  definitivo?: boolean;
};

const POR_CODIGO: Partial<Record<CodigoError, ErrorParaMostrar>> = {
  [CODIGOS_ERROR.CREDENCIALES_INVALIDAS]: {
    mensaje: "Usuario o contraseña incorrectos. Revisalos y probá de nuevo.",
    campo: "password",
  },
  [CODIGOS_ERROR.EMAIL_NO_VERIFICADO]: {
    mensaje:
      "Todavía no confirmaste tu correo. Buscá el mensaje que te mandamos y tocá el enlace; si no llegó, entrá con tu correo en vez de tu usuario para poder reenviarlo.",
    definitivo: true,
  },
  [CODIGOS_ERROR.CUENTA_PENDIENTE]: {
    mensaje:
      "Tu cuenta todavía está esperando aprobación. Te avisamos apenas esté lista; no hace falta que te registres de nuevo.",
    definitivo: true,
  },
  [CODIGOS_ERROR.CUENTA_RECHAZADA]: {
    mensaje: "Tu solicitud de cuenta fue rechazada.",
    definitivo: true,
  },
  [CODIGOS_ERROR.CUENTA_BLOQUEADA]: {
    mensaje: "Tu cuenta está bloqueada. Escribinos si creés que es un error.",
    definitivo: true,
  },
  [CODIGOS_ERROR.USUARIO_EN_USO]: {
    mensaje: "Ese usuario ya está ocupado. Probá con otro.",
    campo: "usuario",
  },
  [CODIGOS_ERROR.EMAIL_EN_USO]: {
    mensaje: "Ya hay una cuenta con ese correo.",
    campo: "email",
  },
  [CODIGOS_ERROR.DEMASIADOS_INTENTOS]: {
    mensaje: "Demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.",
  },
  [CODIGOS_ERROR.VALIDACION_INVALIDA]: {
    mensaje: "Revisá los datos: hay algo que no está bien.",
  },
  [CODIGOS_ERROR.NO_AUTENTICADO]: {
    mensaje: "Tu sesión terminó. Volvé a entrar.",
  },
  [CODIGOS_ERROR.SIN_PERMISO]: {
    mensaje: "No tenés permiso para hacer eso.",
  },
  [CODIGOS_ERROR.BASE_NO_DISPONIBLE]: {
    mensaje: "El servicio no está disponible en este momento. Probá de nuevo en unos minutos.",
  },
};

const SIN_CONEXION: ErrorParaMostrar = {
  // Se distingue a propósito de un error del servidor: lo que tiene que hacer
  // la persona es distinto (docs/guias/usabilidad.md, Comportamiento sin conexión).
  mensaje: "No pudimos conectarnos. Revisá tu conexión a internet y probá de nuevo.",
};

const DESCONOCIDO: ErrorParaMostrar = {
  mensaje: "Algo salió mal. Probá de nuevo en unos minutos.",
};

/** true si el navegador sabe que no hay conexión. */
export function estaSinConexion(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * Convierte lo que haya fallado en algo que se le pueda mostrar a la persona.
 *
 * Acepta tanto una respuesta de error de la API como un error de red o
 * cualquier excepción inesperada.
 */
export function interpretarError(problema: unknown): ErrorParaMostrar {
  if (estaSinConexion()) {
    return SIN_CONEXION;
  }

  // Better Auth envuelve el cuerpo de la respuesta en `error`; la API ya devuelve
  // nuestro formato, así que buscamos el código en los dos lugares posibles.
  const cuerpo =
    problema !== null && typeof problema === "object" && "error" in problema
      ? problema
      : { error: problema };

  if (esRespuestaError(cuerpo)) {
    const conocido = POR_CODIGO[cuerpo.error.codigo];
    // El código viaja junto al mensaje: hay casos, como el correo sin confirmar,
    // donde la pantalla necesita hacer algo más que mostrar un texto.
    return { codigo: cuerpo.error.codigo, ...(conocido ?? { mensaje: cuerpo.error.mensaje }) };
  }

  // Un fetch que no llega a destino tira TypeError, sin respuesta que leer.
  if (problema instanceof TypeError) {
    return SIN_CONEXION;
  }

  return DESCONOCIDO;
}
