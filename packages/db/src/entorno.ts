// Lectura y validacion de las variables de entorno de la base de datos.
// Se comparte entre la API, los tests, el script de migraciones y drizzle-kit,
// para que todos interpreten el .env de la misma manera.

import { z } from "zod";

const esquemaEntornoBase = z.object({
  POSTGRES_HOST: z.string().min(1).default("localhost"),
  POSTGRES_PORT: z.coerce.number().int().positive().max(65535).default(5432),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string(),
  POSTGRES_DB: z.string().min(1),
  POSTGRES_DB_TEST: z.string().min(1),
  POSTGRES_SSL: z
    .enum(["true", "false"])
    .default("false")
    .transform((valor) => valor === "true"),
});

/** Datos de conexion a una base concreta, listos para pasarle al Pool de pg. */
export type ConfigBaseDatos = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
};

/**
 * Lee la configuracion de PostgreSQL desde process.env.
 * Con `usarBaseDeTests` apunta a POSTGRES_DB_TEST en vez de POSTGRES_DB, que es
 * como los tests de integracion corren contra una base separada sin tocar los
 * datos de desarrollo.
 */
export function leerConfigBaseDatos(usarBaseDeTests = false): ConfigBaseDatos {
  const resultado = esquemaEntornoBase.safeParse(process.env);

  if (!resultado.success) {
    const detalle = resultado.error.issues
      .map((problema) => `  - ${problema.path.join(".")}: ${problema.message}`)
      .join("\n");
    throw new Error(
      `Faltan variables de entorno de la base de datos o son invalidas:\n${detalle}\n` +
        "Copiá .env.example a .env y completá los valores.",
    );
  }

  const entorno = resultado.data;

  return {
    host: entorno.POSTGRES_HOST,
    port: entorno.POSTGRES_PORT,
    user: entorno.POSTGRES_USER,
    password: entorno.POSTGRES_PASSWORD,
    database: usarBaseDeTests ? entorno.POSTGRES_DB_TEST : entorno.POSTGRES_DB,
    ssl: entorno.POSTGRES_SSL,
  };
}

/**
 * Descripcion de la conexion apta para logs y mensajes de error.
 * Nunca incluye la contraseña (ver docs/guias/convenciones.md, seccion Logs).
 */
export function describirConexion(config: ConfigBaseDatos): string {
  return `${config.user}@${config.host}:${config.port}/${config.database}`;
}
