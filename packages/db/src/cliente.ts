// Cliente de base de datos: crea el pool de conexiones y la instancia de Drizzle.

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { ConfigBaseDatos } from "./entorno.ts";
import * as esquema from "./esquema/index.ts";

export type ClienteDb = {
  /** Instancia de Drizzle: es lo que usan los servicios para consultar. */
  db: ReturnType<typeof crearDrizzle>;
  /** Cierra todas las conexiones. Se usa al apagar el servidor y entre tests. */
  cerrar: () => Promise<void>;
  /** Hace un SELECT 1 para confirmar que la base responde. */
  verificarConexion: () => Promise<void>;
};

function crearDrizzle(pool: Pool) {
  // snake_case en la base y camelCase en el codigo, sin escribir cada nombre de
  // columna a mano (ver docs/guias/convenciones.md). Tiene que coincidir con lo
  // que declara drizzle.config.ts, o las migraciones saldrian con otros nombres.
  return drizzle({ client: pool, schema: esquema, casing: "snake_case" });
}

/**
 * Crea un cliente de base de datos a partir de una configuracion explicita.
 *
 * Recibe la configuracion en vez de leerla del entorno para que la API, el
 * script de migraciones y los tests puedan apuntar a bases distintas (o a una
 * base inexistente, que es como se prueba el caso de base caida) sin trucos.
 */
export function crearClienteDb(config: ConfigBaseDatos): ClienteDb {
  const pool = new Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: config.ssl,

    // Reutilizar conexiones es lo que mantiene los tiempos de respuesta bajos
    // (ver docs/guias/rendimiento.md). El timeout corto evita que una base
    // caida deje peticiones colgadas: preferimos fallar rapido con un 503.
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 3_000,
  });

  // Sin este listener, un error de una conexion ociosa del pool tumba el proceso.
  pool.on("error", () => {
    // El detalle se registra en quien consulta; aca solo evitamos el crash.
  });

  const db = crearDrizzle(pool);

  return {
    db,
    cerrar: () => pool.end(),
    verificarConexion: async () => {
      await db.execute(sql`select 1`);
    },
  };
}
