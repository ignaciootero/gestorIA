// Tests unitarios de los colores de categorías.

import { describe, expect, it } from "vitest";
import { colorMasDistinto, distanciaDeColor } from "./colores.ts";
import { CATEGORIA_DE_TRANSFERENCIA, CATEGORIAS_POR_DEFECTO } from "./constantes.ts";

const FORMATO = /^#[0-9a-f]{6}$/;

describe("distanciaDeColor", () => {
  it("es cero entre un color y él mismo, y simétrica", () => {
    expect(distanciaDeColor("#336699", "#336699")).toBe(0);
    expect(distanciaDeColor("#ff0000", "#00ff00")).toBeCloseTo(
      distanciaDeColor("#00ff00", "#ff0000"),
    );
  });

  it("es grande entre colores muy distintos y chica entre colores casi iguales", () => {
    expect(distanciaDeColor("#000000", "#ffffff")).toBeGreaterThan(90);
    expect(distanciaDeColor("#ff0000", "#00ff00")).toBeGreaterThan(80);
    expect(distanciaDeColor("#336699", "#346699")).toBeLessThan(2);
  });

  it("distingue más un rojo de un verde que dos rojos parecidos", () => {
    expect(distanciaDeColor("#cc0000", "#00cc00")).toBeGreaterThan(
      distanciaDeColor("#cc0000", "#dd0000"),
    );
  });
});

describe("colores por defecto de las categorías", () => {
  const todas = [
    ...CATEGORIAS_POR_DEFECTO.map((categoria) => categoria.color),
    CATEGORIA_DE_TRANSFERENCIA.color,
  ];

  it("son #rrggbb y no se repite ninguno", () => {
    expect(todas.every((color) => FORMATO.test(color))).toBe(true);
    expect(new Set(todas).size).toBe(todas.length);
  });

  it("son lo más distintos posible entre sí: ningún par se parece", () => {
    let minimo = Number.POSITIVE_INFINITY;
    for (let i = 0; i < todas.length; i += 1) {
      for (let j = i + 1; j < todas.length; j += 1) {
        minimo = Math.min(minimo, distanciaDeColor(todas[i] ?? "", todas[j] ?? ""));
      }
    }
    expect(minimo).toBeGreaterThan(40);
  });

  it("la transferencia es amarilla", () => {
    // Matiz entre 45° y 60°: amarillo, no naranja ni verde.
    const [r, g, b] = [1, 3, 5].map((i) =>
      Number.parseInt(CATEGORIA_DE_TRANSFERENCIA.color.slice(i, i + 2), 16),
    );
    expect(r).toBeGreaterThan(200);
    expect(g).toBeGreaterThan(180);
    expect(b).toBeLessThan(80);
  });

  it("los nombres son únicos (sin distinguir mayúsculas) y distintos del de la transferencia", () => {
    const nombres = [
      ...CATEGORIAS_POR_DEFECTO.map((c) => c.nombre),
      CATEGORIA_DE_TRANSFERENCIA.nombre,
    ];
    expect(new Set(nombres.map((nombre) => nombre.toLowerCase())).size).toBe(nombres.length);
  });
});

describe("colorMasDistinto", () => {
  it("devuelve un #rrggbb, y siempre lo mismo para los mismos colores en uso", () => {
    const usados = ["#ff0000", "#00ff00"];

    expect(colorMasDistinto(usados)).toMatch(FORMATO);
    expect(colorMasDistinto(usados)).toBe(colorMasDistinto([...usados]));
  });

  it("sin colores en uso devuelve alguno válido", () => {
    expect(colorMasDistinto([])).toMatch(FORMATO);
  });

  it("elige un color bien alejado de los que ya hay (no uno parecido)", () => {
    const usados = ["#cf5417", "#1717cf", "#17cf54"];

    const elegido = colorMasDistinto(usados);

    for (const usado of usados) {
      expect(distanciaDeColor(elegido, usado)).toBeGreaterThan(30);
    }
  });

  it("no repite un color en uso ni uno casi idéntico", () => {
    const usados = [
      ...CATEGORIAS_POR_DEFECTO.map((c) => c.color),
      CATEGORIA_DE_TRANSFERENCIA.color,
    ];

    const elegido = colorMasDistinto(usados);

    expect(usados).not.toContain(elegido);
    for (const usado of usados) {
      expect(distanciaDeColor(elegido, usado)).toBeGreaterThan(15);
    }
  });

  it("agregando colores en cadena, cada uno se aleja de los anteriores", () => {
    const usados: string[] = ["#facc15"];
    for (let i = 0; i < 15; i += 1) {
      const nuevo = colorMasDistinto(usados);
      expect(usados).not.toContain(nuevo);
      usados.push(nuevo);
    }
    expect(new Set(usados).size).toBe(16);
  });

  it("ignora un color con formato inválido en la lista de usados", () => {
    expect(colorMasDistinto(["no-es-un-color", "#ff0000"])).toMatch(FORMATO);
    expect(colorMasDistinto(["no-es-un-color", "#ff0000"])).toBe(colorMasDistinto(["#ff0000"]));
  });

  it("con un solo color en uso, elige uno claramente distinto", () => {
    expect(distanciaDeColor(colorMasDistinto(["#ff0000"]), "#ff0000")).toBeGreaterThan(60);
  });
});
