/// <reference types="vitest" />
// Configuracion de Vitest para los esquemas y utilidades compartidas.
// Son tests puros: no tocan la base ni la red.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
