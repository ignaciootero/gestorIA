// Arranque del servidor de la API.
//
// Orden deliberado: primero se validan las variables de entorno, después se crea
// el logger y recién ahí se abre la base. Si falta configuración, el proceso muere
// con un mensaje claro en vez de arrancar a medias.

import { crearClienteDb, describirConexion, leerConfigBaseDatos } from "@gestoria/db";
import { serve } from "@hono/node-server";
import { crearApp } from "./app.ts";
import { leerEntornoApi } from "./config/entorno.ts";
import { crearLogger } from "./logger.ts";

function abortar(mensaje: string, detalle: unknown): never {
  // Todavía no hay logger cuando falla la configuración, así que va a stderr.
  console.error(mensaje);
  console.error(detalle instanceof Error ? detalle.message : detalle);
  process.exit(1);
}

let entorno: ReturnType<typeof leerEntornoApi>;
try {
  entorno = leerEntornoApi();
} catch (error) {
  abortar("La API no puede arrancar: configuración inválida.", error);
}

const logger = crearLogger(entorno);

let configBase: ReturnType<typeof leerConfigBaseDatos>;
try {
  configBase = leerConfigBaseDatos(entorno.NODE_ENV === "test");
} catch (error) {
  abortar("La API no puede arrancar: configuración de base de datos inválida.", error);
}

const cliente = crearClienteDb(configBase);
const app = crearApp({ cliente, logger, entorno });

const servidor = serve({ fetch: app.fetch, port: entorno.PORT }, (direccion) => {
  logger.info(
    {
      puerto: direccion.port,
      entorno: entorno.NODE_ENV,
      base: describirConexion(configBase),
    },
    "API iniciada",
  );
});

/**
 * Apagado ordenado: dejamos de aceptar conexiones y cerramos el pool antes de
 * salir, para no dejar conexiones colgadas en PostgreSQL en cada reinicio.
 */
async function apagar(senal: string): Promise<void> {
  logger.info({ senal }, "apagando API");
  servidor.close();
  await cliente.cerrar();
  process.exit(0);
}

process.on("SIGINT", () => void apagar("SIGINT"));
process.on("SIGTERM", () => void apagar("SIGTERM"));
