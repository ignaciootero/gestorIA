// Tests unitarios del formato y la conversión de montos.
//
// Los strings esperados son los de docs/guias/convenciones.md (Formatos
// regionales): "$ 1.200,50" para pesos uruguayos, "US$ 1.200,50" para dólares.
// `Intl` separa el símbolo del número con un espacio irrompible (U+00A0), no
// con un espacio común: visualmente son iguales, así que se arma con
// para no dejar un carácter invisible distinto escrito a mano en el archivo.

import { describe, expect, it } from "vitest";
import { centavosDesdeImporte, formatearMonto, importeDesdeCentavos } from "./moneda.ts";

const EI = " "; // espacio irrompible

describe("centavosDesdeImporte / importeDesdeCentavos", () => {
  it("son inversas entre sí", () => {
    expect(centavosDesdeImporte(1200.5)).toBe(120_050);
    expect(importeDesdeCentavos(120_050)).toBe(1200.5);
  });

  it("redondea al centésimo más cercano en vez de truncar", () => {
    // 0.1 + 0.2 en punto flotante da 0.30000000000000004: sin redondear, esto
    // guardaría un centésimo de más o de menos.
    expect(centavosDesdeImporte(0.1 + 0.2)).toBe(30);
  });

  it("maneja el cero", () => {
    expect(centavosDesdeImporte(0)).toBe(0);
    expect(importeDesdeCentavos(0)).toBe(0);
  });
});

describe("formatearMonto", () => {
  it("formatea pesos uruguayos como manda la guía de convenciones", () => {
    expect(formatearMonto(120_050, "UYU")).toBe(`$${EI}1.200,50`);
  });

  it("formatea dólares como manda la guía de convenciones", () => {
    expect(formatearMonto(120_050, "USD")).toBe(`US$${EI}1.200,50`);
  });

  it("formatea un monto negativo", () => {
    expect(formatearMonto(-120_050, "UYU")).toBe(`-$${EI}1.200,50`);
  });

  it("formatea cero con dos decimales", () => {
    expect(formatearMonto(0, "UYU")).toBe(`$${EI}0,00`);
  });
});
