// Corre un script del proyecto (crear el admin, aprobar cuentas, cargar datos de prueba) desde tu
// máquina contra la base del ambiente de prueba en Render. Ver docs/despliegue-render.md.
//
// El plan gratuito de Render no tiene consola, así que esto se hace desde afuera, con la "External
// Database URL" de la base (en su página de Render, "Connect"). Esa URL tiene la contraseña: se pasa
// por variable de entorno y no queda en ningún archivo. Desde afuera Render exige TLS.
//
// Uso (PowerShell):
//   $env:DATABASE_URL = "<External Database URL>"
//   node scripts/ambiente-de-prueba/contra-render.ts usuario:admin
//   node scripts/ambiente-de-prueba/contra-render.ts usuario:aprobar --listar
//   Remove-Item Env:DATABASE_URL

import { spawnSync } from "node:child_process";
import path from "node:path";
import { completarBaseDeDatos } from "./comun.ts";

const [comando, ...argumentos] = process.argv.slice(2);
if (!process.env["DATABASE_URL"] || !comando) {
  console.error(
    "Uso: con DATABASE_URL definida (la External Database URL de Render),\n" +
      "  node scripts/ambiente-de-prueba/contra-render.ts <script de package.json> [argumentos]",
  );
  process.exit(1);
}

// Las POSTGRES_* que estén en el .env apuntan a la base local: se ignoran para usar la de Render.
for (const clave of ["POSTGRES_HOST", "POSTGRES_PORT", "POSTGRES_USER", "POSTGRES_PASSWORD"]) {
  delete process.env[clave];
}
delete process.env["POSTGRES_DB"];
delete process.env["POSTGRES_DB_TEST"];
completarBaseDeDatos(process.env);
process.env["POSTGRES_SSL"] ??= "true";
// Un script que manda correos (la carga de datos crea cuentas) no tiene por qué usar el SMTP local.
process.env["SMTP_HOST"] = "";

console.log(
  `Contra ${process.env["POSTGRES_USER"]}@${process.env["POSTGRES_HOST"]}/${process.env["POSTGRES_DB"]}`,
);
const resultado = spawnSync("pnpm", [comando, ...argumentos], {
  stdio: "inherit",
  cwd: path.resolve(import.meta.dirname, "..", ".."),
  env: process.env,
  shell: process.platform === "win32",
});
process.exit(resultado.status ?? 1);
