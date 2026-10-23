// Tests unitarios del formato de porcentajes. En es-UY, `Intl` escribe el símbolo pegado
// al número ("12,5%"), sin espacio.

import { describe, expect, it } from "vitest";
import { formatearPorcentaje } from "./porcentaje.ts";

describe("formatearPorcentaje", () => {
  it("usa la coma decimal de la región", () => {
    expect(formatearPorcentaje(12.5)).toBe(`12,5%`);
  });

  it("no agrega decimales de más", () => {
    expect(formatearPorcentaje(50)).toBe(`50%`);
  });

  it("redondea a un decimal", () => {
    expect(formatearPorcentaje(33.333)).toBe(`33,3%`);
  });

  it("acepta cero, negativos y valores mayores a 100", () => {
    expect(formatearPorcentaje(0)).toBe(`0%`);
    expect(formatearPorcentaje(-25)).toBe(`-25%`);
    expect(formatearPorcentaje(250)).toBe(`250%`);
  });

  it("separa los miles", () => {
    expect(formatearPorcentaje(1200)).toBe(`1.200%`);
  });
});
