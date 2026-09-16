// Construccion de la aplicacion Hono.
//
// Recibe sus dependencias (base de datos, logger, entorno) en vez de crearlas,
// para que los tests puedan levantar la app apuntando a la base de tests o a una
// base caida sin tocar variables globales.

import type { ClienteDb } from "@gestoria/db";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import type { EntornoApi } from "./config/entorno.ts";
import type { Logger } from "./logger.ts";
import { manejadorDeErrores, manejadorNoEncontrado } from "./middlewares/errores.ts";
import { registrarPeticiones } from "./middlewares/logs.ts";
import { rutasDeSalud } from "./rutas/salud.ts";
import type { EntornoHono } from "./tipos.ts";

export type OpcionesApp = {
  cliente: ClienteDb;
  logger: Logger;
  entorno: EntornoApi;
};

export function crearApp({ cliente, logger, entorno }: OpcionesApp): Hono<EntornoHono> {
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

  app.route("/", rutasDeSalud(cliente));

  app.notFound(manejadorNoEncontrado);
  app.onError(manejadorDeErrores);

  return app;
}
