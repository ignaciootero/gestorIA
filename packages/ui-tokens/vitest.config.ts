/// <reference types="vitest" />
// Tests de los tokens del sistema visual: puros, sin base ni red.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
