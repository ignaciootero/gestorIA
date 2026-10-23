// Utilidades compartidas por los tests de la API.
// No se incluye en el build de produccion (ver tsconfig.build.json).

import { type ClienteDb, crearClienteDb, leerConfigBaseDatos } from "@gestoria/db";
import { crearApp } from "../app.ts";
import { crearAuth } from "../auth/crear-auth.ts";
import { type EntornoApi, leerEntornoApi } from "../config/entorno.ts";
import type { Correo, Mensajero } from "../correo/enviar.ts";
import { crearLogger } from "../logger.ts";
import type { FuenteDeCotizaciones } from "../servicios/finanzas/cotizaciones.ts";
import { crearFuenteDePrueba } from "./cotizaciones-de-prueba.ts";

export const ORIGEN_PERMITIDO = "http://localhost:3000";
export const URL_API = "http://localhost:3001";

/** Secreto ficticio: los tests no comparten claves con ningún entorno real. */
export const SECRETO_DE_PRUEBA = "secreto-de-prueba-para-vitest-no-usar-en-serio";

/** Entorno minimo y explicito para los tests, sin depender del .env del desarrollador. */
export function entornoDePrueba(): EntornoApi {
  return leerEntornoApi({
    NODE_ENV: "test",
    PORT: "3001",
    LOG_LEVEL: "silent",
    BETTER_AUTH_SECRET: SECRETO_DE_PRUEBA,
    BETTER_AUTH_URL: URL_API,
    URL_WEB: ORIGEN_PERMITIDO,
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

/** Instancia de Better Auth apuntando al cliente que se le pase. */
/**
 * Mensajero que guarda los correos en memoria en vez de mandarlos.
 *
 * Permite verificar qué se mandó y a quién, y sacar el enlace de verificación
 * para completar el flujo en los tests.
 */
export function crearMensajeroDePrueba() {
  const enviados: Correo[] = [];

  const mensajero: Mensajero = {
    enviaDeVerdad: false,
    enviar: async (correo) => {
      enviados.push(correo);
    },
  };

  return {
    mensajero,
    enviados,
    ultimo: () => enviados.at(-1),
    /** Saca el primer enlace http del cuerpo en texto plano del último correo. */
    ultimoEnlace: () => /https?:\/\/\S+/.exec(enviados.at(-1)?.texto ?? "")?.[0],
    limpiar: () => {
      enviados.length = 0;
    },
  };
}

export function authDePrueba(cliente: ClienteDb, mensajero?: Mensajero) {
  return crearAuth({
    cliente,
    secreto: SECRETO_DE_PRUEBA,
    urlBase: URL_API,
    urlWeb: ORIGEN_PERMITIDO,
    origenesConfiables: [ORIGEN_PERMITIDO],
    enProduccion: false,
    mensajero: mensajero ?? crearMensajeroDePrueba().mensajero,
  });
}

/**
 * App lista para pedirle rutas con `app.request(...)`, sin levantar un servidor.
 * Las cotizaciones salen de una fuente falsa (nunca de internet) salvo que se pase otra.
 */
export function appDePrueba(
  cliente: ClienteDb,
  mensajero?: Mensajero,
  fuenteDeCotizaciones: FuenteDeCotizaciones = crearFuenteDePrueba().fuente,
) {
  const entorno = entornoDePrueba();
  return crearApp({
    cliente,
    auth: authDePrueba(cliente, mensajero),
    logger: crearLogger(entorno),
    entorno,
    fuenteDeCotizaciones,
  });
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
