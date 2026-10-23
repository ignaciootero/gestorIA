import { describe, expect, it } from "vitest";
import {
  type CuandoCaeUnaTarea,
  caeEnElDiaDeTarea,
  describirRepeticionDeTarea,
  ordenarDiasDeLaSemana,
  proximaOcurrenciaDeTarea,
} from "./cuando-cae.ts";

const semanal = (...diasSemana: number[]): CuandoCaeUnaTarea => ({
  repeticion: "semanal",
  diasSemana,
  diaDelMes: null,
  mes: null,
});
const vacio = { diasSemana: null, diaDelMes: null, mes: null };

// El miércoles 21 de octubre de 2026.
const MIERCOLES = "2026-10-21";

describe("proximaOcurrenciaDeTarea", () => {
  it("una semanal de un día es el próximo de ese día, hoy incluido", () => {
    expect(proximaOcurrenciaDeTarea(semanal(3), MIERCOLES)).toBe("2026-10-21");
    expect(proximaOcurrenciaDeTarea(semanal(1), MIERCOLES)).toBe("2026-10-26");
  });

  it("con varios días es el más cercano", () => {
    expect(proximaOcurrenciaDeTarea(semanal(1, 2, 4), MIERCOLES)).toBe("2026-10-22"); // jueves
    expect(proximaOcurrenciaDeTarea(semanal(6, 7), MIERCOLES)).toBe("2026-10-24"); // sábado
    expect(proximaOcurrenciaDeTarea(semanal(7, 1), "2026-10-25")).toBe("2026-10-25"); // domingo
  });

  it("no importa el orden en que vengan los días", () => {
    expect(proximaOcurrenciaDeTarea(semanal(4, 2, 1), MIERCOLES)).toBe("2026-10-22");
  });

  it("sin días no hay próxima vez", () => {
    expect(proximaOcurrenciaDeTarea(semanal(), MIERCOLES)).toBeNull();
    expect(proximaOcurrenciaDeTarea({ repeticion: "semanal", ...vacio }, MIERCOLES)).toBeNull();
  });

  it("las demás repeticiones funcionan como los recordatorios", () => {
    expect(proximaOcurrenciaDeTarea({ repeticion: "diaria", ...vacio }, MIERCOLES)).toBe(MIERCOLES);
    expect(
      proximaOcurrenciaDeTarea({ repeticion: "mensual", ...vacio, diaDelMes: 31 }, "2026-04-10"),
    ).toBe("2026-04-30");
    expect(
      proximaOcurrenciaDeTarea(
        { repeticion: "anual", ...vacio, diaDelMes: 29, mes: 2 },
        "2026-03-01",
      ),
    ).toBe("2027-02-28");
  });
});

describe("caeEnElDiaDeTarea", () => {
  it("cae en cada uno de los días elegidos y en ningún otro", () => {
    const lunMarJue = semanal(1, 2, 4);
    const resultados = Array.from({ length: 7 }, (_, i) => {
      const dia = `2026-10-${String(19 + i).padStart(2, "0")}`; // lunes 19 a domingo 25
      return caeEnElDiaDeTarea(lunMarJue, dia);
    });
    expect(resultados).toEqual([true, true, false, true, false, false, false]);
  });

  it("los fines de semana", () => {
    const finde = semanal(6, 7);
    expect(caeEnElDiaDeTarea(finde, "2026-10-24")).toBe(true);
    expect(caeEnElDiaDeTarea(finde, "2026-10-25")).toBe(true);
    expect(caeEnElDiaDeTarea(finde, "2026-10-26")).toBe(false);
  });

  it("los siete días son todos los días", () => {
    for (let i = 0; i < 14; i++) {
      const dia = `2026-11-${String(1 + i).padStart(2, "0")}`;
      expect(caeEnElDiaDeTarea(semanal(1, 2, 3, 4, 5, 6, 7), dia)).toBe(true);
    }
  });
});

describe("describirRepeticionDeTarea", () => {
  it("nombra los días elegidos, en orden de lunes a domingo", () => {
    expect(describirRepeticionDeTarea(semanal(3), null)).toBe("Todos los miércoles");
    expect(describirRepeticionDeTarea(semanal(2, 1), null)).toBe("Todos los lunes y martes");
    expect(describirRepeticionDeTarea(semanal(4, 1, 2), "08:00:00")).toBe(
      "Todos los lunes, martes y jueves a las 08:00",
    );
    expect(describirRepeticionDeTarea(semanal(7, 6), null)).toBe("Todos los sábados y domingos");
  });

  it("con los siete días dice 'todos los días'", () => {
    expect(describirRepeticionDeTarea(semanal(1, 2, 3, 4, 5, 6, 7), "07:30")).toBe(
      "Todos los días a las 07:30",
    );
  });

  it("las demás repeticiones se dicen como los recordatorios", () => {
    expect(describirRepeticionDeTarea({ repeticion: "diaria", ...vacio }, null)).toBe(
      "Todos los días",
    );
    expect(
      describirRepeticionDeTarea({ repeticion: "mensual", ...vacio, diaDelMes: 5 }, null),
    ).toBe("El día 5 de cada mes");
    expect(
      describirRepeticionDeTarea({ repeticion: "anual", ...vacio, diaDelMes: 30, mes: 4 }, null),
    ).toBe("Cada 30 de abril");
  });
});

describe("ordenarDiasDeLaSemana", () => {
  it("ordena y quita repetidos", () => {
    expect(ordenarDiasDeLaSemana([5, 1, 5, 3])).toEqual([1, 3, 5]);
    expect(ordenarDiasDeLaSemana([])).toEqual([]);
  });
});

describe("cada tantos días (intervalo)", () => {
  const cada = (cadaDias: number, fechaInicio: string): CuandoCaeUnaTarea => ({
    repeticion: "intervalo",
    ...vacio,
    cadaDias,
    fechaInicio,
  });

  it("antes del inicio, la próxima es el propio inicio", () => {
    expect(proximaOcurrenciaDeTarea(cada(2, "2026-10-25"), "2026-10-21")).toBe("2026-10-25");
    expect(proximaOcurrenciaDeTarea(cada(2, "2026-10-25"), "2026-10-25")).toBe("2026-10-25");
  });

  it("día por medio: cae en el inicio y de a dos días, hoy incluido", () => {
    const regla = cada(2, MIERCOLES);
    expect(proximaOcurrenciaDeTarea(regla, "2026-10-21")).toBe("2026-10-21");
    expect(proximaOcurrenciaDeTarea(regla, "2026-10-22")).toBe("2026-10-23");
    expect(proximaOcurrenciaDeTarea(regla, "2026-10-23")).toBe("2026-10-23");
    expect(caeEnElDiaDeTarea(regla, "2026-10-25")).toBe(true);
    expect(caeEnElDiaDeTarea(regla, "2026-10-24")).toBe(false);
  });

  it("cada 3 y cada 10 días siguen el ciclo desde el inicio", () => {
    expect(proximaOcurrenciaDeTarea(cada(3, MIERCOLES), "2026-10-22")).toBe("2026-10-24");
    expect(proximaOcurrenciaDeTarea(cada(3, MIERCOLES), "2026-10-25")).toBe("2026-10-27");
    expect(proximaOcurrenciaDeTarea(cada(10, MIERCOLES), "2026-10-22")).toBe("2026-10-31");
  });

  it("el ciclo cruza meses y años sin cortarse", () => {
    const regla = cada(2, "2026-12-30");
    expect(caeEnElDiaDeTarea(regla, "2027-01-01")).toBe(true);
    expect(caeEnElDiaDeTarea(regla, "2027-01-02")).toBe(false);
    // Y el año bisiesto: 2028-02-28 → 2028-03-01 son dos días (existe el 29).
    expect(proximaOcurrenciaDeTarea(cada(2, "2028-02-27"), "2028-02-28")).toBe("2028-02-29");
  });

  it("cada 365 días vuelve al mismo día de un año común", () => {
    expect(proximaOcurrenciaDeTarea(cada(365, "2026-10-21"), "2026-10-22")).toBe("2027-10-21");
  });

  it("una regla incompleta no tiene próxima vez", () => {
    expect(proximaOcurrenciaDeTarea({ repeticion: "intervalo", ...vacio }, MIERCOLES)).toBeNull();
    expect(
      proximaOcurrenciaDeTarea({ repeticion: "intervalo", ...vacio, cadaDias: 2 }, MIERCOLES),
    ).toBeNull();
  });

  it("se describe en palabras", () => {
    expect(describirRepeticionDeTarea(cada(2, MIERCOLES), null)).toBe("Día por medio");
    expect(describirRepeticionDeTarea(cada(2, MIERCOLES), "08:30:00")).toBe(
      "Día por medio a las 08:30",
    );
    expect(describirRepeticionDeTarea(cada(5, MIERCOLES), null)).toBe("Cada 5 días");
  });
});
