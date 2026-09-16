// Aplica las migraciones pendientes a la base indicada.
//
// Uso:
//   pnpm db:migrar        -> base de desarrollo (POSTGRES_DB)
//   pnpm db:migrar:test   -> base de tests (POSTGRES_DB_TEST)
//
// Las variables de entorno las carga Node con --env-file-if-exists (ver los
// scripts de package.json), asi no hace falta dotenv.

import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { crearClienteDb } from "./cliente.ts";
import { describirConexion, leerConfigBaseDatos } from "./entorno.ts";

const CARPETA_MIGRACIONES = path.join(import.meta.dirname, "..", "drizzle");

async function principal(): Promise<void> {
  const usarBaseDeTests = process.argv.includes("--test");
  const config = leerConfigBaseDatos(usarBaseDeTests);
  const cliente = crearClienteDb(config);

  console.log(`Aplicando migraciones en ${describirConexion(config)}…`);

  try {
    await migrate(cliente.db, { migrationsFolder: CARPETA_MIGRACIONES });
    console.log("Migraciones aplicadas.");
  } finally {
    await cliente.cerrar();
  }
}

principal().catch((error: unknown) => {
  console.error("No se pudieron aplicar las migraciones.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
