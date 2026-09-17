// Configuracion que lee el CLI de Better Auth para generar el esquema de Drizzle.
//
// No la usa la API en tiempo de ejecucion (para eso esta crearAuth): existe solo
// para que `pnpm auth:generar` sepa que tablas y columnas hacen falta.

import { existsSync } from "node:fs";
import path from "node:path";
import { crearClienteDb, leerConfigBaseDatos } from "@gestoria/db";
import { crearAuth } from "./src/auth/crear-auth.ts";

const archivoEntorno = path.join(process.cwd(), "..", "..", ".env");
if (existsSync(archivoEntorno)) {
  process.loadEnvFile(archivoEntorno);
}

export const auth = crearAuth({
  cliente: crearClienteDb(leerConfigBaseDatos(false)),
  secreto: process.env["BETTER_AUTH_SECRET"] ?? "solo-para-generar-el-esquema-no-se-usa-nunca",
  urlBase: process.env["BETTER_AUTH_URL"] ?? "http://localhost:3001",
  origenesConfiables: ["http://localhost:3000"],
  enProduccion: false,
});
