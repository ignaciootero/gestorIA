// Crea las bases de datos del proyecto si todavia no existen.
//
// Se ejecuta con `pnpm db:crear` desde la raiz y funciona igual en Windows y en
// Linux: se conecta con el driver de Node, no depende de tener `psql` en el PATH.
//
// PostgreSQL no soporta "CREATE DATABASE IF NOT EXISTS" ni permite crear bases
// dentro de una transaccion, asi que primero consultamos pg_database y recien
// despues creamos las que falten.

import { Client } from "pg";
import { leerConfigBaseDatos } from "./entorno.ts";

/** Nombres validos para una base: evita inyeccion al interpolar el identificador. */
const NOMBRE_VALIDO = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

async function crearSiNoExiste(cliente: Client, nombre: string): Promise<void> {
  if (!NOMBRE_VALIDO.test(nombre)) {
    throw new Error(
      `El nombre de base "${nombre}" no es valido. Usá solo letras, numeros y guion bajo.`,
    );
  }

  const existentes = await cliente.query("select 1 from pg_database where datname = $1", [nombre]);

  if (existentes.rowCount && existentes.rowCount > 0) {
    console.log(`  ya existía: ${nombre}`);
    return;
  }

  // El nombre ya paso por NOMBRE_VALIDO, y CREATE DATABASE no acepta parametros.
  await cliente.query(`create database "${nombre}"`);
  console.log(`  creada: ${nombre}`);
}

async function principal(): Promise<void> {
  const desarrollo = leerConfigBaseDatos(false);
  const tests = leerConfigBaseDatos(true);

  // Nos conectamos a "postgres", que siempre existe, para poder crear las otras.
  const cliente = new Client({
    host: desarrollo.host,
    port: desarrollo.port,
    user: desarrollo.user,
    password: desarrollo.password,
    database: "postgres",
    ssl: desarrollo.ssl,
    connectionTimeoutMillis: 5_000,
  });

  console.log(`Conectando a ${desarrollo.user}@${desarrollo.host}:${desarrollo.port}…`);
  await cliente.connect();

  try {
    await crearSiNoExiste(cliente, desarrollo.database);
    await crearSiNoExiste(cliente, tests.database);
  } finally {
    await cliente.end();
  }

  console.log("Listo. Ahora podés correr las migraciones con: pnpm db:migrar");
}

principal().catch((error: unknown) => {
  console.error("No se pudieron crear las bases de datos.");
  console.error(error instanceof Error ? error.message : error);
  console.error(
    "\nRevisá que el servicio de PostgreSQL esté corriendo y que POSTGRES_USER y " +
      "POSTGRES_PASSWORD del .env sean correctos.",
  );
  process.exitCode = 1;
});
