// Manejador central de errores de la API.
//
// Es el unico lugar que arma respuestas de error: los endpoints lanzan un
// ErrorApi (o cualquier excepcion) y no repiten try/catch para formatear.
// Separa siempre el mensaje al usuario del detalle tecnico: lo tecnico va al
// log con el idPeticion, nunca a la respuesta (docs/guias/convenciones.md).

import { CODIGOS_ERROR, type CodigoError } from "@gestoria/shared";
import type { ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";
import { type CampoInvalido, ErrorApi, type RespuestaError } from "../errores/error-api.ts";
import type { EntornoHono } from "../tipos.ts";
import { registrarFinDePeticion } from "./logs.ts";

type ErrorNormalizado = {
  codigo: CodigoError;
  estadoHttp: ContentfulStatusCode;
  mensaje: string;
  campos: CampoInvalido[] | undefined;
  /** true cuando no reconocimos el error: se loguea completo y se responde 500 generico. */
  inesperado: boolean;
};

const MENSAJE_GENERICO = "Ocurrió un error inesperado. Probá de nuevo en unos minutos.";

function camposDesdeZod(error: ZodError): CampoInvalido[] {
  return error.issues.map((problema) => ({
    campo: problema.path.join(".") || "(raíz)",
    mensaje: problema.message,
  }));
}

function normalizar(error: unknown): ErrorNormalizado {
  if (error instanceof ErrorApi) {
    return {
      codigo: error.codigo,
      estadoHttp: error.estadoHttp,
      mensaje: error.message,
      campos: error.campos,
      inesperado: false,
    };
  }

  // Validaciones que llegan sin envolver (por ejemplo un .parse() suelto).
  if (error instanceof ZodError) {
    return {
      codigo: CODIGOS_ERROR.VALIDACION_INVALIDA,
      estadoHttp: 400,
      mensaje: "Revisá los datos ingresados.",
      campos: camposDesdeZod(error),
      inesperado: false,
    };
  }

  // Errores que lanza el propio Hono (cuerpo malformado, metodo no permitido…).
  if (error instanceof HTTPException) {
    const esDelCliente = error.status >= 400 && error.status < 500;
    return {
      codigo: esDelCliente ? CODIGOS_ERROR.VALIDACION_INVALIDA : CODIGOS_ERROR.ERROR_INTERNO,
      estadoHttp: error.status,
      mensaje: esDelCliente ? "La petición no es válida." : MENSAJE_GENERICO,
      campos: undefined,
      inesperado: !esDelCliente,
    };
  }

  return {
    codigo: CODIGOS_ERROR.ERROR_INTERNO,
    estadoHttp: 500,
    mensaje: MENSAJE_GENERICO,
    campos: undefined,
    inesperado: true,
  };
}

export const manejadorDeErrores: ErrorHandler<EntornoHono> = (error, c) => {
  const normalizado = normalizar(error);
  const idPeticion = c.get("requestId") ?? "desconocido";
  const log = c.get("log");

  if (log) {
    // Los errores esperados (validaciones, permisos) son ruido a nivel error:
    // van como warn. Lo inesperado se registra entero, con stack, para poder
    // diagnosticarlo despues buscando por idPeticion.
    if (normalizado.inesperado) {
      log.error({ err: error, codigo: normalizado.codigo }, "error no controlado");
    } else {
      log.warn(
        { codigo: normalizado.codigo, causa: (error as ErrorApi).cause },
        "peticion rechazada",
      );
    }
  }

  registrarFinDePeticion(c, normalizado.estadoHttp);

  const cuerpo: RespuestaError = {
    error: {
      codigo: normalizado.codigo,
      mensaje: normalizado.mensaje,
      ...(normalizado.campos ? { campos: normalizado.campos } : {}),
      idPeticion,
    },
  };

  return c.json(cuerpo, normalizado.estadoHttp);
};

export const manejadorNoEncontrado: NotFoundHandler<EntornoHono> = (c) => {
  const cuerpo: RespuestaError = {
    error: {
      codigo: CODIGOS_ERROR.NO_ENCONTRADO,
      mensaje: "No encontramos lo que buscabas.",
      idPeticion: c.get("requestId") ?? "desconocido",
    },
  };

  return c.json(cuerpo, 404);
};
