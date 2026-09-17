// Montaje de Better Auth dentro de la API.
//
// Better Auth trae sus propios endpoints (/sign-up/email, /sign-in/username,
// /get-session, /admin/*) y responde el mismo. No envolvemos sus rutas ni
// reimplementamos su logica: le pasamos la peticion cruda tal cual llega.
//
// Lo unico que interceptamos son sus respuestas de error, para que salgan con
// el formato y el idioma del resto de la API.

import { Hono } from "hono";
import type { Auth } from "../auth/crear-auth.ts";
import { RUTA_BASE_AUTH } from "../auth/opciones.ts";
import { traducirErrorDeAuth } from "../auth/traducir-errores.ts";
import type { EntornoHono } from "../tipos.ts";

export function rutasDeAuth(auth: Auth): Hono<EntornoHono> {
  const rutas = new Hono<EntornoHono>();

  rutas.all(`${RUTA_BASE_AUTH}/*`, async (c) => {
    const respuesta = await auth.handler(c.req.raw);

    if (respuesta.status < 400) {
      return respuesta;
    }

    // Clonamos antes de leer el cuerpo: el original podria seguir siendo util si
    // no es JSON y hay que devolverlo tal cual.
    let cuerpoOriginal: unknown;
    try {
      cuerpoOriginal = await respuesta.clone().json();
    } catch {
      cuerpoOriginal = undefined;
    }

    const idPeticion = c.get("requestId") ?? "desconocido";
    const traducido = traducirErrorDeAuth(respuesta.status, cuerpoOriginal, idPeticion);

    c.get("log")?.warn(
      { codigo: traducido.error.codigo, ruta: c.req.path, estado: respuesta.status },
      "peticion de autenticación rechazada",
    );

    // Conservamos las cabeceras que puso Better Auth (Set-Cookie al cerrar
    // sesion, Retry-After del rate limiting) y solo reemplazamos el cuerpo.
    const cabeceras = new Headers(respuesta.headers);
    cabeceras.set("content-type", "application/json; charset=UTF-8");

    return new Response(JSON.stringify(traducido), {
      status: respuesta.status,
      headers: cabeceras,
    });
  });

  return rutas;
}
