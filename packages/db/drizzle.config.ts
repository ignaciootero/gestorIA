// Configuracion de drizzle-kit (generar y revisar migraciones).
// drizzle-kit ejecuta este archivo por su cuenta, asi que carga el .env de la
// raiz del monorepo el mismo, sin depender de flags de Node.

import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "drizzle-kit";
import { leerConfigBaseDatos } from "./src/entorno.ts";

// drizzle-kit compila este archivo antes de ejecutarlo, y en ese contexto
// import.meta.dirname no existe. Usamos process.cwd(), que drizzle-kit ya toma
// como base para resolver "schema" y "out": siempre es packages/db.
const archivoEntorno = path.join(process.cwd(), "..", "..", ".env");
if (existsSync(archivoEntorno)) {
  process.loadEnvFile(archivoEntorno);
}

const config = leerConfigBaseDatos(process.argv.includes("--test"));

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/esquema/index.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: config.ssl,
  },
  verbose: true,
  strict: true,
});
