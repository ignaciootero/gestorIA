// Tests unitarios de los importes escritos en un campo de texto.

import { describe, expect, it } from "vitest";
import {
  darFormatoAImporteEscrito,
  interpretarImporteEscrito,
  normalizarImportePegado,
  separadoresDeImporte,
  textoDeImporte,
} from "./importe-escrito.ts";

describe("separadoresDeImporte", () => {
  it("en es-UY el punto separa los miles y la coma los decimales", () => {
    expect(separadoresDeImporte("es-UY")).toEqual({ grupo: ".", decimal: "," });
  });
});

describe("darFormatoAImporteEscrito", () => {
  it.each([
    ["", ""],
    ["1", "1"],
    ["12", "12"],
    ["123", "123"],
    ["1234", "1.234"],
    ["12345", "12.345"],
    ["1234567", "1.234.567"],
    ["9999999999", "9.999.999.999"],
  ])("separa los miles: %s → %s", (crudo, esperado) => {
    expect(darFormatoAImporteEscrito(crudo)).toBe(esperado);
  });

  it("vuelve a calcular los miles aunque ya hubiera puntos en otro lugar", () => {
    // Al escribir un dígito más en "1.234" queda "1.2345".
    expect(darFormatoAImporteEscrito("1.2345")).toBe("12.345");
    // Al borrar uno de "12.345" queda "12.34".
    expect(darFormatoAImporteEscrito("12.34")).toBe("1.234");
    expect(darFormatoAImporteEscrito("1.23")).toBe("123");
  });

  it("conserva la coma recién escrita y limita a dos decimales", () => {
    expect(darFormatoAImporteEscrito("12,")).toBe("12,");
    expect(darFormatoAImporteEscrito("12,5")).toBe("12,5");
    expect(darFormatoAImporteEscrito("1234,567")).toBe("1.234,56");
    expect(darFormatoAImporteEscrito("1.234,50")).toBe("1.234,50");
  });

  it("una coma al principio da 0,", () => {
    expect(darFormatoAImporteEscrito(",")).toBe("0,");
    expect(darFormatoAImporteEscrito(",5")).toBe("0,5");
  });

  it("quita los ceros a la izquierda salvo el único cero", () => {
    expect(darFormatoAImporteEscrito("007")).toBe("7");
    expect(darFormatoAImporteEscrito("0")).toBe("0");
    expect(darFormatoAImporteEscrito("000")).toBe("0");
    expect(darFormatoAImporteEscrito("0,5")).toBe("0,5");
  });

  it("descarta lo que no es número y una segunda coma deja pasar solo los dígitos", () => {
    expect(darFormatoAImporteEscrito("1a2b3")).toBe("123");
    expect(darFormatoAImporteEscrito("$ 1.234")).toBe("1.234");
    expect(darFormatoAImporteEscrito("1,2,3")).toBe("1,23");
  });

  it("no pasa de doce dígitos enteros", () => {
    expect(darFormatoAImporteEscrito("1234567890123456")).toBe("123.456.789.012");
  });

  it("el signo menos solo se acepta si se permite, y solo al principio", () => {
    expect(darFormatoAImporteEscrito("-1234")).toBe("1.234");
    expect(darFormatoAImporteEscrito("-1234", { permitirNegativo: true })).toBe("-1.234");
    expect(darFormatoAImporteEscrito("-", { permitirNegativo: true })).toBe("-");
    expect(darFormatoAImporteEscrito("12-34", { permitirNegativo: true })).toBe("1.234");
    expect(darFormatoAImporteEscrito("-,5", { permitirNegativo: true })).toBe("-0,5");
  });
});

describe("interpretarImporteEscrito", () => {
  it.each([
    ["1.234,50", 1234.5],
    ["12", 12],
    ["0,5", 0.5],
    ["12,", 12],
    ["9.999.999.999", 9_999_999_999],
    ["-1.000", -1000],
    ["-0,25", -0.25],
  ])("%s → %s", (texto, esperado) => {
    expect(interpretarImporteEscrito(texto)).toBe(esperado);
  });

  it.each(["", " ", "-", "abc", ","])("lo vacío o incompleto da NaN: %j", (texto) => {
    expect(interpretarImporteEscrito(texto)).toBeNaN();
  });

  it("da vuelta con el formato: lo que se muestra se interpreta igual", () => {
    for (const numero of [0, 1, 12.5, 999, 1000, 123456.78, 9_999_999_999, -4500.5]) {
      expect(interpretarImporteEscrito(textoDeImporte(numero))).toBe(numero);
    }
  });
});

describe("textoDeImporte", () => {
  it("formatea con miles y hasta dos decimales", () => {
    expect(textoDeImporte(1234.5)).toBe("1.234,5");
    expect(textoDeImporte(1000)).toBe("1.000");
    expect(textoDeImporte(0)).toBe("0");
    expect(textoDeImporte(-1234.56)).toBe("-1.234,56");
  });

  it("da vacío si no hay un número", () => {
    expect(textoDeImporte(undefined)).toBe("");
    expect(textoDeImporte(null)).toBe("");
    expect(textoDeImporte(Number.NaN)).toBe("");
  });
});

describe("normalizarImportePegado", () => {
  it.each([
    ["1234", "1234"],
    ["1.234,56", "1234,56"],
    ["1,234.56", "1234,56"],
    ["250.5", "250,5"],
    ["250,5", "250,5"],
    ["1.234", "1234"],
    ["1,234", "1234"],
    ["1.234.567", "1234567"],
    ["1.234.567,8", "1234567,8"],
    ["$ 1.200,50", "1200,50"],
    ["US$ 1,200.50", "1200,50"],
    ["  42  ", "42"],
  ])("%s → %s", (pegado, esperado) => {
    expect(normalizarImportePegado(pegado)).toBe(esperado);
  });

  it("conserva el signo menos", () => {
    expect(normalizarImportePegado("-1.234,5")).toBe("-1234,5");
  });

  it("lo pegado, una vez formateado, queda listo para el campo", () => {
    expect(darFormatoAImporteEscrito(normalizarImportePegado("1,234,567.89"))).toBe("1.234.567,89");
    expect(darFormatoAImporteEscrito(normalizarImportePegado("250.5"))).toBe("250,5");
  });

  it("un texto sin números da vacío", () => {
    expect(normalizarImportePegado("hola")).toBe("");
  });
});
