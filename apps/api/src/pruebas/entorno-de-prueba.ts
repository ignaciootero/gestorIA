// Utilidades compartidas por los tests de la API.
// No se incluye en el build de produccion (ver tsconfig.build.json).

import { type ClienteDb, crearClienteDb, leerConfigBaseDatos } from "@gestoria/db";
import { crearApp } from "../app.ts";
import { type EntornoApi, leerEntornoApi } from "../config/entorno.ts";
import { crearLogger } from "../logger.ts";

export const ORIGEN_PERMITIDO = "http://localhost:3000";

/** Entorno minimo y explicito para los tests, sin depender del .env del desarrollador. */
export function entornoDePrueba(): EntornoApi {
  return leerEntornoApi({
    NODE_ENV: "test",
    PORT: "3001",
    LOG_LEVEL: "silent",
    ORIGENES_PERMITIDOS: ORIGEN_PERMITIDO,
  });
}

/** Cliente apuntando a la base de tests real (POSTGRES_DB_TEST). */
export function clienteDePrueba(): ClienteDb {
  return crearClienteDb(leerConfigBaseDatos(true));
}

/**
 * Cliente apuntando a una base que no existe, para probar el camino de fallo.
 * Es a proposito una base inexistente y no un mock: queremos ver como reacciona
 * la API ante un error real del driver (docs/guias/testing.md).
 */
export function clienteHaciaBaseCaida(): ClienteDb {
  const config = leerConfigBaseDatos(true);
  return crearClienteDb({ ...config, database: "gestoria_base_inexistente" });
}

/** App lista para pedirle rutas con `app.request(...)`, sin levantar un servidor. */
export function appDePrueba(cliente: ClienteDb) {
  const entorno = entornoDePrueba();
  return crearApp({ cliente, logger: crearLogger(entorno), entorno });
}

/** Lee el cuerpo JSON de una respuesta con el tipo que el test espera. */
export async function leerJson<T>(respuesta: Response): Promise<T> {
  return (await respuesta.json()) as T;
}

/** Forma del cuerpo de GET /health cuando todo está bien. */
export type CuerpoSalud = {
  estado?: string;
  version?: string;
  base?: { estado: string; duracionMs: number };
  tiempo?: string;
};
