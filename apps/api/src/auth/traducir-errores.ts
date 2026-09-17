// Traduce las respuestas de error de Better Auth al formato unico de la API.
//
// Better Auth responde sus propios errores ({ code, message } en ingles) y no
// los deja pasar al manejador central de Hono. Sin esta traduccion los clientes
// tendrian que entender dos formatos de error distintos y dos idiomas.
//
// Los mensajes que ve la persona son siempre los nuestros, nunca los de la
// libreria: asi controlamos el tono y no se filtra vocabulario tecnico.

import {
  type CampoInvalido,
  CODIGOS_ERROR,
  type CodigoError,
  type RespuestaError,
} from "@gestoria/shared";

type ErrorTraducido = {
  codigo: CodigoError;
  mensaje: string;
};

/**
 * Mismo mensaje para contraseña incorrecta y para usuario inexistente.
 * Distinguirlos le permitiria a cualquiera averiguar que cuentas existen.
 */
const CREDENCIALES: ErrorTraducido = {
  codigo: CODIGOS_ERROR.CREDENCIALES_INVALIDAS,
  mensaje: "Usuario o contraseña incorrectos.",
};

/** Codigos de Better Auth y de nuestros hooks, con el mensaje que mostramos. */
const POR_CODIGO: Record<string, ErrorTraducido> = {
  INVALID_EMAIL_OR_PASSWORD: CREDENCIALES,
  INVALID_USERNAME_OR_PASSWORD: CREDENCIALES,
  INVALID_PASSWORD: CREDENCIALES,
  USER_NOT_FOUND: CREDENCIALES,
  CREDENCIALES_INVALIDAS: CREDENCIALES,

  USER_ALREADY_EXISTS: {
    codigo: CODIGOS_ERROR.EMAIL_EN_USO,
    mensaje: "Ya hay una cuenta con ese correo.",
  },
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: {
    codigo: CODIGOS_ERROR.EMAIL_EN_USO,
    mensaje: "Ya hay una cuenta con ese correo.",
  },
  USERNAME_IS_ALREADY_TAKEN: {
    codigo: CODIGOS_ERROR.USUARIO_EN_USO,
    mensaje: "Ese usuario ya está ocupado. Probá con otro.",
  },
  USERNAME_IS_ALREADY_TAKEN_PLEASE_TRY_ANOTHER: {
    codigo: CODIGOS_ERROR.USUARIO_EN_USO,
    mensaje: "Ese usuario ya está ocupado. Probá con otro.",
  },

  // Better Auth corta el login si el correo no está verificado. Es el primero
  // de los dos requisitos para entrar; el segundo es la aprobación del admin.
  EMAIL_NOT_VERIFIED: {
    codigo: CODIGOS_ERROR.EMAIL_NO_VERIFICADO,
    mensaje: "Todavía no confirmaste tu correo. Buscá el mensaje que te mandamos y tocá el enlace.",
  },

  // El plugin de admin corta el login de una cuenta bloqueada antes de que
  // llegue a nuestro hook de sesión, así que su código se traduce acá.
  BANNED_USER: {
    codigo: CODIGOS_ERROR.CUENTA_BLOQUEADA,
    mensaje: "Tu cuenta está bloqueada. Escribinos si creés que es un error.",
  },
  USER_BANNED: {
    codigo: CODIGOS_ERROR.CUENTA_BLOQUEADA,
    mensaje: "Tu cuenta está bloqueada. Escribinos si creés que es un error.",
  },

  // Los lanzan nuestros propios hooks en crear-auth.ts, ya en español.
  CUENTA_PENDIENTE: {
    codigo: CODIGOS_ERROR.CUENTA_PENDIENTE,
    mensaje: "Tu cuenta todavía está esperando aprobación. Te avisamos cuando esté lista.",
  },
  CUENTA_RECHAZADA: {
    codigo: CODIGOS_ERROR.CUENTA_RECHAZADA,
    mensaje: "Tu solicitud de cuenta fue rechazada.",
  },
  CUENTA_BLOQUEADA: {
    codigo: CODIGOS_ERROR.CUENTA_BLOQUEADA,
    mensaje: "Tu cuenta está bloqueada. Escribinos si creés que es un error.",
  },
};

/** Cuando el codigo no nos dice nada, nos guiamos por el estado HTTP. */
function porEstadoHttp(estado: number): ErrorTraducido {
  if (estado === 401) {
    return { codigo: CODIGOS_ERROR.NO_AUTENTICADO, mensaje: "Iniciá sesión para continuar." };
  }
  if (estado === 403) {
    return { codigo: CODIGOS_ERROR.SIN_PERMISO, mensaje: "No tenés permiso para hacer esto." };
  }
  if (estado === 404) {
    return { codigo: CODIGOS_ERROR.NO_ENCONTRADO, mensaje: "No encontramos lo que buscabas." };
  }
  if (estado === 429) {
    return {
      codigo: CODIGOS_ERROR.DEMASIADOS_INTENTOS,
      mensaje: "Demasiados intentos. Esperá unos minutos y probá de nuevo.",
    };
  }
  if (estado >= 400 && estado < 500) {
    return {
      codigo: CODIGOS_ERROR.VALIDACION_INVALIDA,
      mensaje: "Revisá los datos ingresados.",
    };
  }
  return {
    codigo: CODIGOS_ERROR.ERROR_INTERNO,
    mensaje: "Ocurrió un error inesperado. Probá de nuevo en unos minutos.",
  };
}

export function traducirErrorDeAuth(
  estado: number,
  cuerpo: unknown,
  idPeticion: string,
): RespuestaError {
  const codigoOriginal =
    typeof cuerpo === "object" && cuerpo !== null && "code" in cuerpo
      ? String((cuerpo as { code: unknown }).code)
      : undefined;

  const traducido =
    (codigoOriginal ? POR_CODIGO[codigoOriginal] : undefined) ?? porEstadoHttp(estado);

  // El detalle por campo lo ponen nuestras propias validaciones del registro
  // (apps/api/src/auth/opciones.ts) para que la web pueda mostrar cada mensaje
  // junto al campo que corresponde.
  const campos =
    typeof cuerpo === "object" && cuerpo !== null && "campos" in cuerpo
      ? ((cuerpo as { campos: unknown }).campos as CampoInvalido[])
      : undefined;

  return {
    error: {
      codigo: traducido.codigo,
      mensaje: traducido.mensaje,
      ...(Array.isArray(campos) && campos.length > 0 ? { campos } : {}),
      idPeticion,
    },
  };
}
