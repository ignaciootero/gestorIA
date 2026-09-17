// Configuracion de Playwright para los tests end-to-end de la web.
//
// Levanta la API y la web por su cuenta y las apunta a la base de tests
// (gestion_test), nunca a la de desarrollo (docs/guias/testing.md).

import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const archivoEntorno = path.join(import.meta.dirname, "..", "..", ".env");
if (existsSync(archivoEntorno)) {
  process.loadEnvFile(archivoEntorno);
}

const PUERTO_WEB = 3100;
const PUERTO_API = 3101;
const URL_WEB = `http://localhost:${PUERTO_WEB}`;
const URL_API = `http://localhost:${PUERTO_API}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // Los tests comparten la base de pruebas: en paralelo se pisarían.
  workers: 1,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? "github" : "list",

  use: {
    baseURL: URL_WEB,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: [
    {
      // La API de pruebas: mismos puertos fijos, base gestion_test.
      command: "pnpm --filter @gestoria/api run start:e2e",
      url: `${URL_API}/health`,
      reuseExistingServer: !process.env["CI"],
      timeout: 60_000,
      env: {
        NODE_ENV: "test",
        PORT: String(PUERTO_API),
        LOG_LEVEL: "silent",
        BETTER_AUTH_URL: URL_API,
        URL_WEB,
        ORIGENES_PERMITIDOS: URL_WEB,
      },
    },
    {
      command: `pnpm exec next dev --port ${PUERTO_WEB}`,
      url: URL_WEB,
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
      env: { NEXT_PUBLIC_URL_API: URL_API },
    },
  ],
});
