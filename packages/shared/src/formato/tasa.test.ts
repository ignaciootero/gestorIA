import { describe, expect, it } from "vitest";
import {
  darFormatoAImporteEscrito,
  interpretarImporteEscrito,
  textoDeImporte,
} from "./importe-escrito.ts";
import { formatearTasa } from "./tasa.ts";

describe("formatearTasa", () => {
  it("muestra cuatro decimales a una tasa cercana a la unidad", () => {
    expect(formatearTasa(40.2857)).toBe("40,2857");
  });

  it("no deja ceros de más pero siempre muestra dos decimales", () => {
    expect(formatearTasa(40)).toBe("40,00");
    expect(formatearTasa(40.5)).toBe("40,50");
  });

  it("muestra solo dos decimales a una tasa grande", () => {
    expect(formatearTasa(1522.21036116)).toBe("1.522,21");
  });

  it("muestra más decimales a una tasa chica", () => {
    expect(formatearTasa(0.026357)).toBe("0,026357");
  });
});

describe("importes escritos con más decimales (cotizaciones)", () => {
  it("deja escribir hasta los decimales pedidos", () => {
    expect(darFormatoAImporteEscrito("40,285678", { decimales: 4 })).toBe("40,2856");
    expect(darFormatoAImporteEscrito("40,285678")).toBe("40,28");
  });

  it("muestra el número con los decimales pedidos", () => {
    expect(textoDeImporte(40.2857, { decimales: 4 })).toBe("40,2857");
    expect(textoDeImporte(40.2857)).toBe("40,29");
  });

  it("interpreta lo escrito", () => {
    expect(interpretarImporteEscrito("40,2857")).toBe(40.2857);
  });
});
