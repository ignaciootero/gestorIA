// Tests unitarios del nombre sugerido para un período.

import { describe, expect, it } from "vitest";
import { nombreDelMes, nombreDelMesYAnio, sugerirNombreDePeriodo } from "./periodos.ts";

const MONTEVIDEO = "America/Montevideo";

describe("nombreDelMes", () => {
  it("da el nombre del mes con la inicial en mayúscula", () => {
    expect(nombreDelMes("2026-10-15T12:00:00Z", MONTEVIDEO)).toBe("Octubre");
    expect(nombreDelMes("2026-01-15T12:00:00Z", MONTEVIDEO)).toBe("Enero");
  });

  it("usa la zona horaria: el mismo instante cae en meses distintos según dónde se mire", () => {
    // 1/10 01:00 UTC es todavía 30/09 22:00 en Montevideo (UTC-3).
    const instante = "2026-10-01T01:00:00Z";
    expect(nombreDelMes(instante, MONTEVIDEO)).toBe("Setiembre");
    expect(nombreDelMes(instante, "UTC")).toBe("Octubre");
  });

  it("acepta un Date igual que un texto", () => {
    expect(nombreDelMes(new Date("2026-03-10T12:00:00Z"), MONTEVIDEO)).toBe("Marzo");
  });
});

describe("nombreDelMesYAnio", () => {
  it("da el mes y el año", () => {
    expect(nombreDelMesYAnio("2026-10-15T12:00:00Z", MONTEVIDEO)).toBe("Octubre 2026");
    expect(nombreDelMesYAnio(new Date("2027-01-15T12:00:00Z"), MONTEVIDEO)).toBe("Enero 2027");
  });

  it("el año también sigue a la zona horaria: en la noche de fin de año cambia según dónde se mire", () => {
    // 1/1/2027 01:00 UTC es todavía 31/12/2026 22:00 en Montevideo (UTC-3).
    const instante = "2027-01-01T01:00:00Z";
    expect(nombreDelMesYAnio(instante, MONTEVIDEO)).toBe("Diciembre 2026");
    expect(nombreDelMesYAnio(instante, "UTC")).toBe("Enero 2027");
  });
});

describe("sugerirNombreDePeriodo", () => {
  const apertura = "2026-10-05T12:00:00Z";

  it("propone mes y año cuando el nombre está libre", () => {
    expect(sugerirNombreDePeriodo(apertura, MONTEVIDEO, [])).toBe("Octubre 2026");
    expect(
      sugerirNombreDePeriodo(apertura, MONTEVIDEO, ["Septiembre 2026", "Noviembre 2026"]),
    ).toBe("Octubre 2026");
  });

  it("el mismo mes de otro año no cuenta como ocupado", () => {
    expect(sugerirNombreDePeriodo(apertura, MONTEVIDEO, ["Octubre 2025"])).toBe("Octubre 2026");
  });

  it("agrega un número incremental si el nombre ya existe", () => {
    expect(sugerirNombreDePeriodo(apertura, MONTEVIDEO, ["Octubre 2026"])).toBe("Octubre 2026 2");
    expect(sugerirNombreDePeriodo(apertura, MONTEVIDEO, ["Octubre 2026", "Octubre 2026 2"])).toBe(
      "Octubre 2026 3",
    );
  });

  it("no distingue mayúsculas ni espacios sobrantes al comparar", () => {
    expect(sugerirNombreDePeriodo(apertura, MONTEVIDEO, ["  octubre 2026 "])).toBe(
      "Octubre 2026 2",
    );
    expect(sugerirNombreDePeriodo(apertura, MONTEVIDEO, ["OCTUBRE 2026", "octubre 2026 2"])).toBe(
      "Octubre 2026 3",
    );
  });

  it("usa el primer número libre aunque falten intermedios", () => {
    expect(sugerirNombreDePeriodo(apertura, MONTEVIDEO, ["Octubre 2026", "Octubre 2026 3"])).toBe(
      "Octubre 2026 2",
    );
  });

  it("un nombre que solo se parece no cuenta como ocupado (ni el solo mes sin año)", () => {
    expect(sugerirNombreDePeriodo(apertura, MONTEVIDEO, ["Octubre de vacaciones", "Octubre"])).toBe(
      "Octubre 2026",
    );
  });
});
