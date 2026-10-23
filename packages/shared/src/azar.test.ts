// Tests unitarios de las utilidades de azar, con fuentes de números fijas.

import { describe, expect, it } from "vitest";
import { elegirAlAzar, mezclar } from "./azar.ts";

describe("mezclar", () => {
  it("devuelve los mismos elementos, ni más ni menos", () => {
    const original = [1, 2, 3, 4, 5, 6];

    expect([...mezclar(original)].sort()).toEqual(original);
  });

  it("no modifica la lista original", () => {
    const original = ["a", "b", "c"];

    mezclar(original, () => 0);

    expect(original).toEqual(["a", "b", "c"]);
  });

  it("con una fuente fija da un orden predecible", () => {
    // Con 0 siempre se intercambia con el primero: ["a","b","c"] -> ["b","c","a"].
    expect(mezclar(["a", "b", "c"], () => 0)).toEqual(["b", "c", "a"]);
    // Con un valor casi 1 cada elemento se queda en su lugar.
    expect(mezclar(["a", "b", "c"], () => 0.999)).toEqual(["a", "b", "c"]);
  });

  it("acepta listas vacías y de un solo elemento", () => {
    expect(mezclar([])).toEqual([]);
    expect(mezclar(["solo"])).toEqual(["solo"]);
  });

  it("puede producir todos los órdenes posibles de una lista corta", () => {
    // Con 3 elementos se sortea dos veces (entre 3 y entre 2 posiciones): estos valores
    // recorren las 6 combinaciones.
    const vistos = new Set<string>();
    for (const primero of [0, 0.4, 0.7]) {
      for (const segundo of [0, 0.5]) {
        const sorteos = [primero, segundo];
        vistos.add(mezclar(["a", "b", "c"], () => sorteos.shift() ?? 0).join(""));
      }
    }

    expect(vistos.size).toBe(6);
  });
});

describe("elegirAlAzar", () => {
  it("devuelve undefined si la lista está vacía", () => {
    expect(elegirAlAzar([])).toBeUndefined();
  });

  it("elige según el número: el primero con 0 y el último con casi 1", () => {
    expect(elegirAlAzar(["a", "b", "c"], () => 0)).toBe("a");
    expect(elegirAlAzar(["a", "b", "c"], () => 0.5)).toBe("b");
    expect(elegirAlAzar(["a", "b", "c"], () => 0.999)).toBe("c");
  });

  it("con un solo elemento, ese", () => {
    expect(elegirAlAzar(["solo"])).toBe("solo");
  });
});
