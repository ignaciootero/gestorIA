// Construccion de la aplicacion Hono.
//
// Recibe sus dependencias (base de datos, auth, logger, entorno) en vez de
// crearlas, para que los tests puedan levantar la app apuntando a la base de
// tests o a una base caida sin tocar variables globales.

import type { ClienteDb } from "@gestoria/db";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import type { Auth } from "./auth/crear-auth.ts";
import type { EntornoApi } from "./config/entorno.ts";
import type { Logger } from "./logger.ts";
import { manejadorDeErrores, manejadorNoEncontrado } from "./middlewares/errores.ts";
import { registrarPeticiones } from "./middlewares/logs.ts";
import { cargarSesion } from "./middlewares/sesion.ts";
import { rutasDeAdmin } from "./rutas/admin.ts";
import { rutasDeAuth } from "./rutas/auth.ts";
import { rutasDeCalendario } from "./rutas/calendario.ts";
import { rutasDeContactos } from "./rutas/contactos.ts";
import { rutasDeDeudas } from "./rutas/deudas.ts";
import { rutasDeFinanzas } from "./rutas/finanzas.ts";
import { rutasDeSalud } from "./rutas/salud.ts";
import { rutasDeTareas } from "./rutas/tareas.ts";
import { rutasDeSesion } from "./rutas/yo.ts";
import type { FuenteDeCotizaciones } from "./servicios/finanzas/cotizaciones.ts";
import type { EntornoHono } from "./tipos.ts";

export type OpcionesApp = {
  cliente: ClienteDb;
  auth: Auth;
  logger: Logger;
  entorno: EntornoApi;
  /** De dónde salen las cotizaciones. Sin esto, la fuente pública real (los tests pasan una falsa). */
  fuenteDeCotizaciones?: FuenteDeCotizaciones;
};

export function crearApp({
  cliente,
  auth,
  logger,
  entorno,
  fuenteDeCotizaciones,
}: OpcionesApp): Hono<EntornoHono> {
  const app = new Hono<EntornoHono>();

  // El orden importa: primero el id de peticion, para que todo lo que se loguee
  // después (incluidos los errores) lo lleve.
  app.use("*", requestId());
  app.use("*", registrarPeticiones(logger));

  app.use(
    "*",
    secureHeaders({
      // La API solo devuelve JSON: no debe poder cargar ni embeber nada.
      contentSecurityPolicy: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
      xFrameOptions: "DENY",
      xContentTypeOptions: "nosniff",
      referrerPolicy: "no-referrer",
      // HSTS solo tiene sentido sobre HTTPS, que es donde corre producción.
      strictTransportSecurity:
        entorno.NODE_ENV === "production" ? "max-age=31536000; includeSubDomains" : false,
    }),
  );

  // CORS restringido a los dominios propios: nunca "*" (docs/guias/seguridad-y-datos.md).
  // `credentials: true` es lo que permite que viaje la cookie de sesión.
  app.use(
    "*",
    cors({
      origin: entorno.ORIGENES_PERMITIDOS,
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      maxAge: 86_400,
    }),
  );

  // Better Auth maneja sus propias rutas y lee las cookies por su cuenta, así
  // que va antes del middleware de sesión.
  app.route("/", rutasDeAuth(auth));

  app.use("*", cargarSesion(auth));

  app.route("/", rutasDeSalud(cliente));
  app.route("/", rutasDeSesion());
  app.route("/", rutasDeAdmin(cliente, auth));
  app.route("/", rutasDeDeudas(cliente, { fuenteDeCotizaciones }));
  app.route("/", rutasDeFinanzas(cliente, { fuenteDeCotizaciones }));
  app.route("/", rutasDeContactos(cliente));
  app.route("/", rutasDeTareas(cliente));
  app.route("/", rutasDeCalendario(cliente));

  app.notFound(manejadorNoEncontrado);
  app.onError(manejadorDeErrores);

  return app;
}
