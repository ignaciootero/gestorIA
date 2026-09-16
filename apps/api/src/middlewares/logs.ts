// Middleware de logs de peticiones.
//
// Cada peticion arranca con un identificador propio (hono/request-id) que se
// inyecta en un logger hijo, asi todas las lineas de esa peticion quedan
// enlazadas y se puede seguir de punta a punta. Tambien mide la duracion y
// avisa cuando supera el objetivo de la guia de rendimiento.

import type { Context, MiddlewareHandler } from "hono";
import type { Logger } from "../logger.ts";
import type { EntornoHono } from "../tipos.ts";

/** Objetivo p95 de docs/guias/rendimiento.md para operaciones habituales. */
export const UMBRAL_PETICION_LENTA_MS = 200;

/** Milisegundos transcurridos desde que empezo la peticion. */
export function duracionPeticionMs(c: Context<EntornoHono>): number {
  const inicio = c.get("inicioMs");
  return inicio === undefined ? 0 : Math.round(performance.now() - inicio);
}

/**
 * Registra el cierre de una peticion.
 * Solo se loguean metodo, ruta y estado: nunca la query, el cuerpo ni las
 * cabeceras, que pueden traer datos personales (docs/guias/convenciones.md).
 */
export function registrarFinDePeticion(c: Context<EntornoHono>, estado: number): void {
  const log = c.get("log");
  if (!log) return;

  const duracionMs = duracionPeticionMs(c);
  const datos = {
    metodo: c.req.method,
    ruta: c.req.routePath === "/*" ? c.req.path : c.req.routePath,
    estado,
    duracionMs,
  };

  if (estado >= 500) {
    log.error(datos, "peticion fallida");
  } else if (duracionMs > UMBRAL_PETICION_LENTA_MS) {
    log.warn(datos, "peticion lenta");
  } else {
    log.info(datos, "peticion completada");
  }
}

export function registrarPeticiones(logger: Logger): MiddlewareHandler<EntornoHono> {
  return async (c, next) => {
    c.set("log", logger.child({ idPeticion: c.get("requestId") }));
    c.set("inicioMs", performance.now());

    await next();

    // Si el handler lanza una excepcion, este punto no se alcanza y el cierre lo
    // registra el manejador central de errores, que sí conoce el estado final.
    registrarFinDePeticion(c, c.res.status);
  };
}
