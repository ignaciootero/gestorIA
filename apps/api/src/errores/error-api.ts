// Error de dominio de la API y forma unica de las respuestas de error.

import type { ContentfulStatusCode } from "hono/utils/http-status";
import { CODIGOS_ERROR, type CodigoError } from "./codigos.ts";

/** Detalle por campo, solo para errores de validacion. */
export type CampoInvalido = {
  campo: string;
  mensaje: string;
};

/**
 * Cuerpo de toda respuesta de error de la API.
 * Nunca incluye stack traces, SQL ni detalles internos: eso va al log.
 */
export type RespuestaError = {
  error: {
    codigo: CodigoError;
    mensaje: string;
    campos?: CampoInvalido[];
    idPeticion: string;
  };
};

type OpcionesErrorApi = {
  /** Detalle tecnico para el log; nunca se manda al cliente. */
  causa?: unknown;
  campos?: CampoInvalido[];
};

/**
 * Error que la API sabe traducir a una respuesta. Cualquier otro error que
 * llegue al manejador central se trata como 500 sin revelar su contenido.
 */
export class ErrorApi extends Error {
  readonly codigo: CodigoError;
  readonly estadoHttp: ContentfulStatusCode;
  readonly campos: CampoInvalido[] | undefined;

  constructor(
    codigo: CodigoError,
    estadoHttp: ContentfulStatusCode,
    mensaje: string,
    opciones: OpcionesErrorApi = {},
  ) {
    super(mensaje, opciones.causa === undefined ? undefined : { cause: opciones.causa });
    this.name = "ErrorApi";
    this.codigo = codigo;
    this.estadoHttp = estadoHttp;
    this.campos = opciones.campos;
  }
}

/** Atajos para los errores mas comunes, con el codigo HTTP que manda la guia. */
export const errores = {
  validacion: (campos: CampoInvalido[], mensaje = "Revisá los datos ingresados.") =>
    new ErrorApi(CODIGOS_ERROR.VALIDACION_INVALIDA, 400, mensaje, { campos }),

  noAutenticado: (mensaje = "Iniciá sesión para continuar.") =>
    new ErrorApi(CODIGOS_ERROR.NO_AUTENTICADO, 401, mensaje),

  sinPermiso: (mensaje = "No tenés permiso para hacer esto.") =>
    new ErrorApi(CODIGOS_ERROR.SIN_PERMISO, 403, mensaje),

  noEncontrado: (mensaje = "No encontramos lo que buscabas.") =>
    new ErrorApi(CODIGOS_ERROR.NO_ENCONTRADO, 404, mensaje),

  conflicto: (mensaje: string) => new ErrorApi(CODIGOS_ERROR.CONFLICTO, 409, mensaje),

  demasiadosIntentos: (mensaje = "Demasiados intentos. Probá de nuevo en un rato.") =>
    new ErrorApi(CODIGOS_ERROR.DEMASIADOS_INTENTOS, 429, mensaje),

  baseNoDisponible: (causa: unknown) =>
    new ErrorApi(
      CODIGOS_ERROR.BASE_NO_DISPONIBLE,
      503,
      "El servicio no está disponible en este momento. Probá de nuevo en unos minutos.",
      { causa },
    ),
};
