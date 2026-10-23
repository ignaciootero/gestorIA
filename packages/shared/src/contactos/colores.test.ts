import { describe, expect, it } from "vitest";
import { colorDeTextoSobre, mezclarColores, TEXTO_CLARO, TEXTO_OSCURO } from "./colores.ts";

describe("mezclarColores", () => {
  it("sin colores no hay mezcla", () => {
    expect(mezclarColores([])).toBeNull();
  });

  it("con un solo color es ese mismo color", () => {
    expect(mezclarColores(["#cf1754"])).toBe("#cf1754");
    expect(mezclarColores(["#CF1754"])).toBe("#cf1754");
  });

  it("con varios es el promedio de cada canal", () => {
    expect(mezclarColores(["#000000", "#ffffff"])).toBe("#808080");
    expect(mezclarColores(["#ff0000", "#0000ff"])).toBe("#800080");
    expect(mezclarColores(["#ff0000", "#00ff00", "#0000ff"])).toBe("#555555");
  });

  it("el orden no cambia el resultado", () => {
    expect(mezclarColores(["#cf1754", "#17b0cf", "#889933"])).toBe(
      mezclarColores(["#889933", "#cf1754", "#17b0cf"]),
    );
  });

  it("ignora los colores mal escritos", () => {
    expect(mezclarColores(["rojo", "#000000", "#ffffff", "#12345"])).toBe("#808080");
    expect(mezclarColores(["rojo"])).toBeNull();
  });
});

describe("colorDeTextoSobre", () => {
  it("texto claro sobre fondos oscuros y oscuro sobre fondos claros", () => {
    expect(colorDeTextoSobre("#000000")).toBe(TEXTO_CLARO);
    expect(colorDeTextoSobre("#1717cf")).toBe(TEXTO_CLARO);
    expect(colorDeTextoSobre("#ffffff")).toBe(TEXTO_OSCURO);
    expect(colorDeTextoSobre("#17b0cf")).toBe(TEXTO_OSCURO);
    expect(colorDeTextoSobre("#889933")).toBe(TEXTO_OSCURO);
  });

  it("con un fondo inválido, texto oscuro", () => {
    expect(colorDeTextoSobre("nada")).toBe(TEXTO_OSCURO);
  });

  it("sobre cualquier color llega al contraste mínimo de 4,5:1", () => {
    const luminancia = (hex: string) => {
      const canales = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
      const [r, g, b] = canales.map((c) =>
        c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
      );
      return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
    };
    for (let rojo = 0; rojo <= 255; rojo += 51) {
      for (let verde = 0; verde <= 255; verde += 51) {
        for (let azul = 0; azul <= 255; azul += 51) {
          const fondo = `#${[rojo, verde, azul].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
          const texto = colorDeTextoSobre(fondo);
          const a = luminancia(fondo);
          const b = luminancia(texto);
          const contraste = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          expect(contraste, `${fondo} con ${texto}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});
