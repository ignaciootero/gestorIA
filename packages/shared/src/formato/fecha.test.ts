// Tests unitarios del formato de fechas y horas.

import { describe, expect, it } from "vitest";
import { formatearFecha, formatearFechaHora } from "./fecha.ts";

describe("formatearFecha", () => {
  it("da día/mes/año con ceros a la izquierda", () => {
    expect(formatearFecha("2026-09-05T15:00:00Z", "UTC")).toBe("05/09/2026");
  });

  it("respeta la zona horaria: el día puede cambiar", () => {
    // 02:00 UTC del 6/9 es 23:00 del 5/9 en Montevideo.
    expect(formatearFecha("2026-09-06T02:00:00Z", "America/Montevideo")).toBe("05/09/2026");
    expect(formatearFecha("2026-09-06T02:00:00Z", "UTC")).toBe("06/09/2026");
  });
});

describe("formatearFechaHora", () => {
  it("da la hora en formato de 24 horas", () => {
    expect(formatearFechaHora("2026-09-16T14:30:00Z", "UTC")).toBe("16/09/2026 14:30");
    expect(formatearFechaHora("2026-09-16T00:05:00Z", "UTC")).toBe("16/09/2026 00:05");
  });

  it("convierte a la zona indicada", () => {
    expect(formatearFechaHora("2026-09-16T17:30:00Z", "America/Montevideo")).toBe(
      "16/09/2026 14:30",
    );
  });
});
