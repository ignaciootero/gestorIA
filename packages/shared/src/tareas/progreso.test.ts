import { describe, expect, it } from "vitest";
import { esquemaProgresoDeTarea, esquemaTarea } from "./esquemas.ts";
import {
  aCentesimos,
  desdeCentesimos,
  formatearCantidad,
  progresoEnPalabras,
  proporcionDelProgreso,
  sumasRapidas,
  tieneHastaDosDecimales,
} from "./progreso.ts";

describe("cantidades de una tarea progresiva", () => {
  it("se guardan en centésimos sin errores de redondeo", () => {
    expect(aCentesimos(0.1 + 0.2)).toBe(30);
    expect(aCentesimos(1.5)).toBe(150);
    expect(desdeCentesimos(aCentesimos(0.1) + aCentesimos(0.2))).toBe(0.3);
  });

  it("aceptan hasta dos decimales", () => {
    expect(tieneHastaDosDecimales(2)).toBe(true);
    expect(tieneHastaDosDecimales(0.25)).toBe(true);
    expect(tieneHastaDosDecimales(1.005)).toBe(false);
  });

  it("se escriben como en Uruguay", () => {
    expect(formatearCantidad(1.5)).toBe("1,5");
    expect(formatearCantidad(10000)).toBe("10.000");
    expect(progresoEnPalabras(1.5, 2, "litros")).toBe("1,5 de 2 litros");
    expect(progresoEnPalabras(3, 5, null)).toBe("3 de 5");
  });

  it("la proporción va de 0 a 1, aunque se pase de la meta", () => {
    expect(proporcionDelProgreso(0, 2)).toBe(0);
    expect(proporcionDelProgreso(1, 2)).toBe(0.5);
    expect(proporcionDelProgreso(3, 2)).toBe(1);
  });

  it("las sumas rápidas son números cómodos cerca de la cuarta parte y la mitad", () => {
    expect(sumasRapidas(2)).toEqual([0.5, 1]);
    expect(sumasRapidas(8)).toEqual([2, 4]);
    expect(sumasRapidas(10000)).toEqual([2500, 5000]);
    expect(sumasRapidas(1)).toEqual([0.25, 0.5]);
  });
});

describe("esquemas de una tarea progresiva", () => {
  const base = { titulo: "Tomar agua", notas: "", fecha: "", hora: "" };

  it("la meta es opcional, positiva y con hasta dos decimales", () => {
    expect(esquemaTarea.safeParse(base).success).toBe(true);
    expect(esquemaTarea.safeParse({ ...base, meta: null }).success).toBe(true);
    expect(esquemaTarea.safeParse({ ...base, meta: 2, unidad: "litros" }).success).toBe(true);
    expect(esquemaTarea.safeParse({ ...base, meta: 0 }).success).toBe(false);
    expect(esquemaTarea.safeParse({ ...base, meta: -1 }).success).toBe(false);
    expect(esquemaTarea.safeParse({ ...base, meta: 1.234 }).success).toBe(false);
    expect(esquemaTarea.safeParse({ ...base, meta: 2_000_000 }).success).toBe(false);
    expect(esquemaTarea.safeParse({ ...base, meta: 2, unidad: "x".repeat(17) }).success).toBe(false);
  });

  it("el progreso se suma o se corrige el total", () => {
    expect(esquemaProgresoDeTarea.safeParse({ sumar: 0.5 }).success).toBe(true);
    expect(esquemaProgresoDeTarea.safeParse({ total: 0 }).success).toBe(true);
    expect(esquemaProgresoDeTarea.safeParse({ total: 1.5 }).success).toBe(true);
    expect(esquemaProgresoDeTarea.safeParse({ sumar: 0 }).success).toBe(false);
    expect(esquemaProgresoDeTarea.safeParse({ sumar: -1 }).success).toBe(false);
    expect(esquemaProgresoDeTarea.safeParse({ total: -1 }).success).toBe(false);
    expect(esquemaProgresoDeTarea.safeParse({}).success).toBe(false);
  });
});
