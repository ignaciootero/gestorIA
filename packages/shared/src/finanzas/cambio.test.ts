// Tests de la conversión entre monedas: redondeo, topes y casos borde.

import { describe, expect, it } from "vitest";
import {
  convertirCentavos,
  convertirCentavosInverso,
  decirCotizacion,
  derivarTasa,
  esTasaValida,
  redondearTasa,
  TASA_MAXIMA,
  tasaDesdeCotizacionDicha,
  tasaEntreMonedas,
} from "./cambio.ts";

describe("convertirCentavosInverso", () => {
  it("calcula cuánto hay que entregar para recibir un importe", () => {
    // Con 1 de origen = 40 de destino, para recibir 100,00 hacen falta 2,50 de origen.
    expect(convertirCentavosInverso(10_000, 40)).toBe(250);
    expect(convertirCentavosInverso(10_000, 0.025)).toBe(400_000);
  });

  it("con tasa 1 devuelve lo mismo", () => {
    expect(convertirCentavosInverso(123_456, 1)).toBe(123_456);
  });

  it("redondea al centésimo más cercano, la mitad lejos del cero", () => {
    expect(convertirCentavosInverso(1, 2)).toBe(1);
    expect(convertirCentavosInverso(-1, 2)).toBe(-1);
    expect(convertirCentavosInverso(1, 3)).toBe(0);
    expect(convertirCentavosInverso(2, 3)).toBe(1);
  });

  it("al volver a convertir da el importe pedido (salvo medio centésimo)", () => {
    const tasa = 40.2857;
    for (const pedido of [1, 99, 10_000, 123_457, 999_999_999]) {
      const entregado = convertirCentavosInverso(pedido, tasa);
      expect(Math.abs(convertirCentavos(entregado, tasa) - pedido)).toBeLessThanOrEqual(
        Math.ceil(tasa / 2),
      );
    }
  });

  it("rechaza tasas inválidas e importes que no caben", () => {
    expect(() => convertirCentavosInverso(100, 0)).toThrow(RangeError);
    expect(() => convertirCentavosInverso(100, Number.NaN)).toThrow(RangeError);
    expect(() => convertirCentavosInverso(1.5, 2)).toThrow(RangeError);
    expect(() => convertirCentavosInverso(Number.MAX_SAFE_INTEGER, 0.00000002)).toThrow(RangeError);
  });
});

describe("convertirCentavos", () => {
  it("convierte dólares a pesos con la tasa", () => {
    // US$ 100,00 a 40,25 = $ 4.025,00
    expect(convertirCentavos(10_000, 40.25)).toBe(402_500);
  });

  it("con tasa 1 devuelve el mismo importe", () => {
    expect(convertirCentavos(123_456, 1)).toBe(123_456);
  });

  it("redondea al centésimo más cercano", () => {
    // 1,01 × 40,2857 = 40,685557 → 40,69
    expect(convertirCentavos(101, 40.2857)).toBe(4_069);
    // 0,01 × 0,4 = 0,004 → 0,00
    expect(convertirCentavos(1, 0.4)).toBe(0);
  });

  it("redondea la mitad lejos del cero", () => {
    // 0,01 × 0,5 = 0,005 → 0,01
    expect(convertirCentavos(1, 0.5)).toBe(1);
    expect(convertirCentavos(-1, 0.5)).toBe(-1);
    // 3 × 0,5 = 1,5 → 2 ; 5 × 0,5 = 2,5 → 3
    expect(convertirCentavos(3, 0.5)).toBe(2);
    expect(convertirCentavos(5, 0.5)).toBe(3);
  });

  it("convierte un saldo negativo con el mismo criterio", () => {
    expect(convertirCentavos(-10_000, 40.25)).toBe(-402_500);
    expect(convertirCentavos(-101, 40.2857)).toBe(-4_069);
  });

  it("no pierde precisión con importes grandes", () => {
    // 9.999.999.999,00 × 1522,21036116: el producto no cabe exacto en un double.
    const resultado = convertirCentavos(999_999_999_900, 1522.21036116);
    expect(resultado).toBe(
      Number((999_999_999_900n * 152_221_036_116n + 50_000_000n) / 100_000_000n),
    );
  });

  it("falla si el resultado no cabe en un número seguro", () => {
    expect(() => convertirCentavos(Number.MAX_SAFE_INTEGER, 2)).toThrow(RangeError);
  });

  it("rechaza tasas inválidas", () => {
    expect(() => convertirCentavos(100, 0)).toThrow(RangeError);
    expect(() => convertirCentavos(100, -3)).toThrow(RangeError);
    expect(() => convertirCentavos(100, Number.NaN)).toThrow(RangeError);
    expect(() => convertirCentavos(100, Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => convertirCentavos(100, TASA_MAXIMA + 1)).toThrow(RangeError);
  });

  it("rechaza centésimos que no son enteros", () => {
    expect(() => convertirCentavos(10.5, 2)).toThrow(RangeError);
  });
});

describe("esTasaValida / redondearTasa", () => {
  it("acepta tasas normales y chicas", () => {
    expect(esTasaValida(40.2857)).toBe(true);
    expect(esTasaValida(0.026357)).toBe(true);
  });

  it("rechaza cero, negativas, enormes y no numéricas", () => {
    expect(esTasaValida(0)).toBe(false);
    expect(esTasaValida(-1)).toBe(false);
    expect(esTasaValida(1e-9)).toBe(false);
    expect(esTasaValida(TASA_MAXIMA * 2)).toBe(false);
    expect(esTasaValida(Number.NaN)).toBe(false);
  });

  it("redondea a ocho decimales", () => {
    expect(redondearTasa(40.123456789)).toBe(40.12345679);
  });
});

describe("derivarTasa", () => {
  it("deduce la tasa de lo entregado y lo recibido", () => {
    // $ 4.000 por US$ 100 → 40
    expect(derivarTasa(400_000, 10_000)).toBeCloseTo(0.025, 8);
    expect(derivarTasa(10_000, 400_000)).toBe(40);
  });

  it("no inventa una tasa si falta un importe", () => {
    expect(derivarTasa(0, 100)).toBeNull();
    expect(derivarTasa(100, 0)).toBeNull();
    expect(derivarTasa(-100, 100)).toBeNull();
  });

  it("rechaza una relación absurda", () => {
    expect(derivarTasa(1, 99_999_999_999)).toBeNull();
  });
});

describe("tasaEntreMonedas", () => {
  it("de dólares a pesos es el valor del dólar en pesos", () => {
    expect(tasaEntreMonedas(1, 40.28565824)).toBe(40.28565824);
  });

  it("de pesos a dólares es la inversa", () => {
    expect(tasaEntreMonedas(40, 1)).toBe(0.025);
  });

  it("cruza dos monedas que no son el dólar", () => {
    // 1 USD = 40 UYU y 1 USD = 0,8 EUR → 1 EUR = 50 UYU
    expect(tasaEntreMonedas(0.8, 40)).toBe(50);
  });

  it("devuelve null con datos inválidos", () => {
    expect(tasaEntreMonedas(0, 40)).toBeNull();
    expect(tasaEntreMonedas(1, -1)).toBeNull();
  });
});

describe("decirCotizacion / tasaDesdeCotizacionDicha", () => {
  it("de la moneda que más vale a la que menos, se dice tal cual", () => {
    expect(decirCotizacion("USD", "UYU", 40)).toEqual({
      unidad: "USD",
      otra: "UYU",
      valor: 40,
      invertida: false,
    });
  });

  it("de la que menos vale a la que más, se invierte para decir 1 USD = 40 UYU", () => {
    const dicha = decirCotizacion("UYU", "USD", 0.025);
    expect(dicha).toMatchObject({ unidad: "USD", otra: "UYU", invertida: true });
    expect(dicha.valor).toBeCloseTo(40, 8);
  });

  it("entre euros y dólares, el euro va de a uno", () => {
    expect(decirCotizacion("USD", "EUR", 0.8)).toMatchObject({ unidad: "EUR", otra: "USD" });
    expect(decirCotizacion("EUR", "USD", 1.25)).toMatchObject({ unidad: "EUR", otra: "USD" });
  });

  it("una moneda desconocida se considera de poco valor", () => {
    expect(decirCotizacion("XYZ", "UYU", 0.5)).toMatchObject({ unidad: "UYU", otra: "XYZ" });
  });

  it("lo que se escribe vuelve a la tasa guardada, en los dos sentidos", () => {
    expect(tasaDesdeCotizacionDicha("USD", "UYU", 40.25)).toBe(40.25);
    expect(tasaDesdeCotizacionDicha("UYU", "USD", 40)).toBe(0.025);
  });

  it("ida y vuelta no pierde precisión relevante", () => {
    for (const tasa of [0.0245, 0.026357, 0.5, 1.25, 38.5, 0.00067]) {
      const dicha = decirCotizacion("UYU", "USD", tasa);
      expect(tasaDesdeCotizacionDicha("UYU", "USD", dicha.valor)).toBeCloseTo(tasa, 7);
    }
  });
});
