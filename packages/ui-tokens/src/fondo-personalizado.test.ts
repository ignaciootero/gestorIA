// Tests de los ajustes del fondo animado elegidos por la persona.

import { describe, expect, it } from "vitest";
import {
  AJUSTES_DEL_FONDO_POR_DEFECTO,
  INTENSIDAD_MAXIMA_DEL_FONDO,
  mezclarTonos,
  opacidadDelFondo,
} from "./fondo-personalizado.ts";
import { FONDO_ANIMADO } from "./index.ts";

describe("opacidadDelFondo", () => {
  it("el 100 % es la intensidad máxima legible y el 0 apaga el fondo", () => {
    expect(opacidadDelFondo(100, "claro")).toBe(INTENSIDAD_MAXIMA_DEL_FONDO.claro);
    expect(opacidadDelFondo(100, "oscuro")).toBe(INTENSIDAD_MAXIMA_DEL_FONDO.oscuro);
    expect(opacidadDelFondo(0, "claro")).toBe(0);
  });

  it("no se pasa del máximo ni baja de 0 con valores fuera de rango", () => {
    expect(opacidadDelFondo(250, "claro")).toBe(INTENSIDAD_MAXIMA_DEL_FONDO.claro);
    expect(opacidadDelFondo(-10, "oscuro")).toBe(0);
  });

  it("los ajustes por defecto dan la intensidad de siempre", () => {
    for (const modo of ["claro", "oscuro"] as const) {
      expect(
        Math.abs(
          opacidadDelFondo(AJUSTES_DEL_FONDO_POR_DEFECTO[modo].intensidad, modo) -
            FONDO_ANIMADO[modo].intensidad,
        ),
      ).toBeLessThan(0.005);
    }
  });

  it("la intensidad de siempre entra en el máximo", () => {
    expect(FONDO_ANIMADO.claro.intensidad).toBeLessThanOrEqual(INTENSIDAD_MAXIMA_DEL_FONDO.claro);
    expect(FONDO_ANIMADO.oscuro.intensidad).toBeLessThanOrEqual(INTENSIDAD_MAXIMA_DEL_FONDO.oscuro);
  });
});

describe("mezclarTonos", () => {
  it("va por el camino corto del círculo", () => {
    expect(mezclarTonos(350, 10, 0.5)).toBeCloseTo(0);
    expect(mezclarTonos(10, 350, 0.5)).toBeCloseTo(0);
    expect(mezclarTonos(100, 200, 0.5)).toBeCloseTo(150);
  });

  it("en los extremos da cada tono y siempre queda entre 0 y 360", () => {
    expect(mezclarTonos(40, 300, 0)).toBeCloseTo(40);
    expect(mezclarTonos(40, 300, 1)).toBeCloseTo(300);
    for (let mezcla = 0; mezcla <= 1; mezcla += 0.1) {
      const tono = mezclarTonos(350, 20, mezcla);
      expect(tono).toBeGreaterThanOrEqual(0);
      expect(tono).toBeLessThan(360);
    }
  });
});
