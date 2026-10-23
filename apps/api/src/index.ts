// Arranque del servidor de la API.
//
// Orden deliberado: primero se validan las variables de entorno, después se crea
// el logger y recién ahí se abre la base. Si falta configuración, el proceso muere
// con un mensaje claro en vez de arrancar a medias.

import { crearClienteDb, describirConexion, leerConfigBaseDatos } from "@gestoria/db";
import { serve } from "@hono/node-server";
import { crearApp } from "./app.ts";
import { crearAuth } from "./auth/crear-auth.ts";
import { leerConfigSmtp, leerEntornoApi } from "./config/entorno.ts";
import { crearMensajero } from "./correo/enviar.ts";
import { crearLogger } from "./logger.ts";
import { iniciarProgramador, type Programador } from "./tareas/programador.ts";

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

const configSmtp = leerConfigSmtp(entorno);
const mensajero = crearMensajero(logger, configSmtp);

if (!configSmtp && entorno.NODE_ENV === "production") {
  // En producción un correo que no sale deja cuentas nuevas sin poder verificarse.
  logger.warn("SMTP sin configurar: los correos de verificación NO se van a enviar");
}

const auth = crearAuth({
  cliente,
  secreto: entorno.BETTER_AUTH_SECRET,
  urlBase: entorno.BETTER_AUTH_URL,
  urlWeb: entorno.URL_WEB,
  origenesConfiables: entorno.ORIGENES_PERMITIDOS,
  enProduccion: entorno.NODE_ENV === "production",
  mensajero,
});

const app = crearApp({ cliente, auth, logger, entorno });

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

// Las tareas programadas no se arrancan en los tests: ahí cada tarea se prueba como
// una función común. Si no pueden arrancar, la API sigue sirviendo: lo único que se
// atrasa es la limpieza, que no corta nada de lo que ve la persona.
let programador: Programador | null = null;
if (entorno.NODE_ENV !== "test") {
  try {
    programador = await iniciarProgramador({ cliente, config: configBase, logger });
  } catch (error) {
    logger.error({ err: error }, "no se pudieron iniciar las tareas programadas");
  }
}

/**
 * Apagado ordenado: dejamos de aceptar conexiones, terminamos las tareas en curso y
 * cerramos el pool antes de salir, para no dejar conexiones colgadas en PostgreSQL en
 * cada reinicio.
 */
async function apagar(senal: string): Promise<void> {
  logger.info({ senal }, "apagando API");
  servidor.close();
  await programador?.detener();
  await cliente.cerrar();
  process.exit(0);
}

process.on("SIGINT", () => void apagar("SIGINT"));
process.on("SIGTERM", () => void apagar("SIGTERM"));
