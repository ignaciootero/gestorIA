import { describe, expect, it } from "vitest";
import {
  CODIGOS_DE_MONEDA,
  esMonedaAdmitida,
  MONEDAS_ADMITIDAS,
  nombreDeMoneda,
} from "./monedas.ts";

describe("monedas admitidas", () => {
  it("incluye el peso uruguayo, la moneda base por defecto", () => {
    expect(esMonedaAdmitida("UYU")).toBe(true);
  });

  it("no repite códigos y todos son de tres letras mayúsculas", () => {
    expect(new Set(CODIGOS_DE_MONEDA).size).toBe(MONEDAS_ADMITIDAS.length);
    for (const codigo of CODIGOS_DE_MONEDA) expect(codigo).toMatch(/^[A-Z]{3}$/);
  });

  it("todas las monedas admitidas se pueden formatear con Intl", () => {
    for (const codigo of CODIGOS_DE_MONEDA) {
      expect(
        () => new Intl.NumberFormat("es-UY", { style: "currency", currency: codigo }),
      ).not.toThrow();
    }
  });

  it("rechaza un código desconocido o en minúsculas", () => {
    expect(esMonedaAdmitida("XYZ")).toBe(false);
    expect(esMonedaAdmitida("usd")).toBe(false);
  });

  it("da el nombre de la moneda, o el código si no la conoce", () => {
    expect(nombreDeMoneda("USD")).toBe("Dólar estadounidense");
    expect(nombreDeMoneda("XYZ")).toBe("XYZ");
  });
});
