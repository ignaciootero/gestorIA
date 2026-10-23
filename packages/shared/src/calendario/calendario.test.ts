import { describe, expect, it } from "vitest";
import {
  describirDiaCompleto,
  esElMismoMes,
  mesDe,
  mesesEntre,
  mismoDiaEnOtroMes,
  nombreDelMesConAnio,
  nombreDeMesDelCalendario,
  numeroDeSemana,
  primerDiaDelMes,
  semanasDelMes,
  sumarMeses,
} from "./calendario.ts";

describe("sumarMeses", () => {
  it("avanza y retrocede dentro del año", () => {
    expect(sumarMeses({ anio: 2026, mes: 10 }, 1)).toEqual({ anio: 2026, mes: 11 });
    expect(sumarMeses({ anio: 2026, mes: 10 }, -3)).toEqual({ anio: 2026, mes: 7 });
  });

  it("cruza el fin y el comienzo de año", () => {
    expect(sumarMeses({ anio: 2026, mes: 12 }, 1)).toEqual({ anio: 2027, mes: 1 });
    expect(sumarMeses({ anio: 2026, mes: 1 }, -1)).toEqual({ anio: 2025, mes: 12 });
    expect(sumarMeses({ anio: 2026, mes: 1 }, -13)).toEqual({ anio: 2024, mes: 12 });
    expect(sumarMeses({ anio: 2026, mes: 6 }, 30)).toEqual({ anio: 2028, mes: 12 });
  });

  it("sumar cero no cambia nada", () => {
    expect(sumarMeses({ anio: 2026, mes: 10 }, 0)).toEqual({ anio: 2026, mes: 10 });
  });
});

describe("mesesEntre y esElMismoMes", () => {
  it("cuenta los meses de diferencia, con signo", () => {
    expect(mesesEntre({ anio: 2026, mes: 10 }, { anio: 2027, mes: 2 })).toBe(4);
    expect(mesesEntre({ anio: 2026, mes: 10 }, { anio: 2026, mes: 7 })).toBe(-3);
    expect(mesesEntre({ anio: 2026, mes: 10 }, { anio: 2026, mes: 10 })).toBe(0);
  });

  it("reconoce el mismo mes", () => {
    expect(esElMismoMes({ anio: 2026, mes: 10 }, mesDe("2026-10-31"))).toBe(true);
    expect(esElMismoMes({ anio: 2026, mes: 10 }, mesDe("2025-10-31"))).toBe(false);
  });
});

describe("semanasDelMes", () => {
  it("siempre dibuja seis semanas de siete días", () => {
    for (const mes of [
      { anio: 2026, mes: 2 }, // arranca en domingo: febrero sin día 29
      { anio: 2027, mes: 2 }, // arranca en lunes y mide justo 4 semanas
      { anio: 2026, mes: 3 },
      { anio: 2024, mes: 2 }, // bisiesto
    ]) {
      const semanas = semanasDelMes(mes);
      expect(semanas).toHaveLength(6);
      for (const semana of semanas) expect(semana).toHaveLength(7);
    }
  });

  it("empieza en lunes y los días son consecutivos", () => {
    const semanas = semanasDelMes({ anio: 2026, mes: 10 });
    // Octubre de 2026 arranca un jueves: la primera fila empieza el lunes 28 de septiembre.
    expect(semanas[0]?.[0]).toBe("2026-09-28");
    expect(semanas[0]?.[3]).toBe("2026-10-01");
    expect(semanas[5]?.[6]).toBe("2026-11-08");
    expect(semanas.flat().every((dia, i, todos) => i === 0 || dia > (todos[i - 1] ?? ""))).toBe(
      true,
    );
  });

  it("si el mes arranca en lunes, la primera fila es del propio mes", () => {
    // Febrero de 2027 arranca un lunes.
    const semanas = semanasDelMes({ anio: 2027, mes: 2 });
    expect(semanas[0]?.[0]).toBe("2027-02-01");
  });

  it("si el mes arranca en domingo, la primera fila trae seis días del mes anterior", () => {
    // Febrero de 2026 arranca un domingo.
    const semanas = semanasDelMes({ anio: 2026, mes: 2 });
    expect(semanas[0]?.[0]).toBe("2026-01-26");
    expect(semanas[0]?.[6]).toBe("2026-02-01");
  });

  it("incluye todos los días del mes, incluido el 29 de febrero de un bisiesto", () => {
    const dias = semanasDelMes({ anio: 2024, mes: 2 }).flat();
    expect(dias).toContain("2024-02-29");
    expect(dias.filter((dia) => dia.startsWith("2024-02"))).toHaveLength(29);
  });
});

describe("mismoDiaEnOtroMes", () => {
  it("conserva el número de día cuando el otro mes lo tiene", () => {
    expect(mismoDiaEnOtroMes("2026-10-15", { anio: 2026, mes: 11 })).toBe("2026-11-15");
  });

  it("cae el último día si el otro mes no lo tiene", () => {
    expect(mismoDiaEnOtroMes("2026-10-31", { anio: 2026, mes: 11 })).toBe("2026-11-30");
    expect(mismoDiaEnOtroMes("2026-01-31", { anio: 2026, mes: 2 })).toBe("2026-02-28");
    expect(mismoDiaEnOtroMes("2026-01-31", { anio: 2028, mes: 2 })).toBe("2028-02-29");
  });
});

describe("numeroDeSemana", () => {
  it("sigue la numeración ISO", () => {
    expect(numeroDeSemana("2026-01-01")).toBe(1); // jueves
    expect(numeroDeSemana("2026-10-20")).toBe(43);
    expect(numeroDeSemana("2026-12-31")).toBe(53); // 2026 tiene 53 semanas
  });

  it("los primeros días de enero pueden ser de la última semana del año anterior", () => {
    // 1 de enero de 2027 es viernes: pertenece a la semana 53 de 2026.
    expect(numeroDeSemana("2027-01-01")).toBe(53);
    expect(numeroDeSemana("2027-01-04")).toBe(1);
  });

  it("los últimos días de diciembre pueden ser de la semana 1 del año siguiente", () => {
    // 29 de diciembre de 2025 es lunes: es la semana 1 de 2026.
    expect(numeroDeSemana("2025-12-29")).toBe(1);
  });
});

describe("textos", () => {
  it("escribe el nombre del mes con mayúscula y el año", () => {
    expect(nombreDeMesDelCalendario(10)).toBe("Octubre");
    expect(nombreDelMesConAnio({ anio: 2026, mes: 1 })).toBe("Enero de 2026");
  });

  it("describe un día completo", () => {
    expect(describirDiaCompleto("2026-10-20")).toBe("martes, 20 de octubre de 2026");
    expect(describirDiaCompleto("2024-02-29")).toBe("jueves, 29 de febrero de 2024");
  });

  it("el primer día de un mes", () => {
    expect(primerDiaDelMes({ anio: 2026, mes: 3 })).toBe("2026-03-01");
  });
});
