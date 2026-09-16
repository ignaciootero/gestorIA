// Tests unitarios de la validacion de variables de entorno de la API.

import { describe, expect, it } from "vitest";
import { leerEntornoApi } from "./entorno.ts";

const MINIMO = { ORIGENES_PERMITIDOS: "http://localhost:3000" };

describe("leerEntornoApi", () => {
  it("aplica valores por defecto razonables cuando solo estan los obligatorios", () => {
    const entorno = leerEntornoApi(MINIMO);

    expect(entorno.NODE_ENV).toBe("development");
    expect(entorno.PORT).toBe(3001);
    expect(entorno.LOG_LEVEL).toBe("info");
  });

  it("convierte el puerto a numero", () => {
    expect(leerEntornoApi({ ...MINIMO, PORT: "8080" }).PORT).toBe(8080);
  });

  it("parte la lista de origenes y descarta espacios sobrantes", () => {
    const entorno = leerEntornoApi({
      ORIGENES_PERMITIDOS: " http://localhost:3000 , https://gestion.example ,, ",
    });

    expect(entorno.ORIGENES_PERMITIDOS).toEqual([
      "http://localhost:3000",
      "https://gestion.example",
    ]);
  });

  it("rechaza un comodin en CORS", () => {
    expect(() => leerEntornoApi({ ORIGENES_PERMITIDOS: "*" })).toThrow(/CORS no admite/);
  });

  it("rechaza que falte la lista de origenes", () => {
    expect(() => leerEntornoApi({})).toThrow(/ORIGENES_PERMITIDOS/);
  });

  it("rechaza una lista de origenes vacia", () => {
    expect(() => leerEntornoApi({ ORIGENES_PERMITIDOS: "  ,  " })).toThrow(/al menos un origen/);
  });

  it("rechaza un puerto fuera de rango", () => {
    expect(() => leerEntornoApi({ ...MINIMO, PORT: "70000" })).toThrow(/PORT/);
    expect(() => leerEntornoApi({ ...MINIMO, PORT: "0" })).toThrow(/PORT/);
    expect(() => leerEntornoApi({ ...MINIMO, PORT: "no-es-un-numero" })).toThrow(/PORT/);
  });

  it("rechaza un nivel de log desconocido", () => {
    expect(() => leerEntornoApi({ ...MINIMO, LOG_LEVEL: "gritando" })).toThrow(/LOG_LEVEL/);
  });

  it("rechaza un NODE_ENV desconocido", () => {
    expect(() => leerEntornoApi({ ...MINIMO, NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
  });

  it("menciona el archivo .env.example para orientar a quien configura", () => {
    expect(() => leerEntornoApi({})).toThrow(/\.env\.example/);
  });
});
