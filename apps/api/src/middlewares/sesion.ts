// Middleware de sesion: deja la sesion actual en el contexto de la peticion.
//
// Regla del proyecto: el id de usuario sale SIEMPRE de aca, nunca del cuerpo de
// la peticion (CLAUDE.md, Principios de arquitectura).

import { createMiddleware } from "hono/factory";
import type { Auth } from "../auth/crear-auth.ts";
import { errores } from "../errores/error-api.ts";
import type { EntornoHono } from "../tipos.ts";

/**
 * Lee la sesion y la guarda en el contexto. No exige que exista: las rutas
 * publicas tambien pasan por aca.
 */
export function cargarSesion(auth: Auth) {
  return createMiddleware<EntornoHono>(async (c, next) => {
    const sesion = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set("sesion", sesion ?? null);
    await next();
  });
}

/**
 * Corta la peticion si no hay sesion. Va despues de `cargarSesion`.
 *
 * Tambien rechaza a quien tenga `debeCambiarPassword`: despues de un reseteo,
 * la cuenta solo puede cambiar su contraseña, nada mas.
 */
export const exigirSesion = createMiddleware<EntornoHono>(async (c, next) => {
  const sesion = c.get("sesion");

  if (!sesion) {
    throw errores.noAutenticado();
  }

  if (sesion.user.debeCambiarPassword) {
    throw errores.debeCambiarPassword();
  }

  c.get("log")?.setBindings?.({ usuarioId: sesion.user.id });

  await next();
});

/** Corta la peticion si quien la hace no es admin. Va despues de `exigirSesion`. */
export const exigirAdmin = createMiddleware<EntornoHono>(async (c, next) => {
  const sesion = c.get("sesion");

  if (sesion?.user.role !== "admin") {
    throw errores.sinPermiso();
  }

  await next();
});
