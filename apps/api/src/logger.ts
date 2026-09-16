// Logger estructurado de la API (Pino).
//
// Reglas de docs/guias/convenciones.md:
// - salida en JSON (en desarrollo se embellece con pino-pretty para poder leerla);
// - nunca datos sensibles: cabeceras de autorizacion, cookies, contraseñas,
//   tokens ni contenido personal. Registramos identificadores, no contenido.

import { type Logger, pino } from "pino";
import type { EntornoApi } from "./config/entorno.ts";

export type { Logger };

/** Rutas que Pino reemplaza por [Redacted] si alguna vez llegaran a un log. */
const CAMPOS_OCULTOS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "headers.authorization",
  "headers.cookie",
  "*.password",
  "*.contrasena",
  "*.token",
  "*.secret",
];

export function crearLogger(entorno: EntornoApi): Logger {
  const enDesarrollo = entorno.NODE_ENV === "development";

  return pino({
    level: entorno.LOG_LEVEL,
    redact: { paths: CAMPOS_OCULTOS, censor: "[oculto]" },
    base: { app: "api" },
    formatters: {
      level: (etiqueta) => ({ level: etiqueta }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    // pino-pretty es solo una comodidad de desarrollo: en producción la salida
    // es JSON plano, que es lo que el VPS puede recolectar y filtrar.
    ...(enDesarrollo
      ? {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss",
              ignore: "pid,hostname,app",
            },
          },
        }
      : {}),
  });
}
