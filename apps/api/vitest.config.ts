/// <reference types="vitest" />
// Configuracion de Vitest para la API.
//
// Desde Vitest 5 el archivo de configuracion ya no se busca en carpetas padre,
// asi que cada app o paquete que tenga tests lleva el suyo.

import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Los tests de integracion necesitan las credenciales de PostgreSQL del .env de
// la raiz. Node lo carga aca porque Vitest no recibe los flags --env-file.
const archivoEntorno = path.join(import.meta.dirname, "..", "..", ".env");
if (existsSync(archivoEntorno)) {
  process.loadEnvFile(archivoEntorno);
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      // Sin esto cada test escupiria las lineas de log de sus peticiones.
      LOG_LEVEL: "silent",
    },
    // Los tests de integracion comparten una unica base (gestion_test): correrlos
    // en un solo proceso evita que se pisen entre si.
    pool: "forks",
    maxWorkers: 1,
    isolate: false,
    testTimeout: 15_000,
    // Cada archivo vacia la base antes de sus propios tests (beforeEach); esto
    // la vuelve a vaciar al terminar toda la corrida, para no dejarla sucia
    // con lo que hizo el ultimo test.
    globalSetup: "./src/pruebas/limpieza-global.ts",
  },
});
