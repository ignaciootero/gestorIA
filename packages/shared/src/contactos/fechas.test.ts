// Tests unitarios de las fechas de calendario y de cuándo cae un recordatorio.

import { describe, expect, it } from "vitest";
import {
  type CuandoCae,
  describirDiasRestantes,
  describirProgramacion,
  diaDeHoy,
  diaIsoDeLaSemana,
  diasEntre,
  edadQueCumple,
  esDiaReal,
  formatearDiaDeCalendario,
  formatearDiaYMes,
  instanteDelDia,
  proximaOcurrencia,
  recortarHora,
  sumarDias,
} from "./fechas.ts";

describe("esDiaReal", () => {
  it("acepta días que existen, incluido el 29 de febrero de un año bisiesto", () => {
    expect(esDiaReal("2026-10-20")).toBe(true);
    expect(esDiaReal("2024-02-29")).toBe(true);
  });

  it("rechaza días que no existen o mal escritos", () => {
    expect(esDiaReal("2026-02-29")).toBe(false);
    expect(esDiaReal("2026-04-31")).toBe(false);
    expect(esDiaReal("2026-13-01")).toBe(false);
    expect(esDiaReal("2026-00-10")).toBe(false);
    expect(esDiaReal("2026-1-5")).toBe(false);
    expect(esDiaReal("20/10/2026")).toBe(false);
    expect(esDiaReal("")).toBe(false);
  });
});

describe("diaDeHoy", () => {
  it("da el día en la zona de la persona, que puede ser distinto del de UTC", () => {
    const ahora = new Date("2026-10-20T01:30:00Z");
    expect(diaDeHoy("UTC", ahora)).toBe("2026-10-20");
    expect(diaDeHoy("America/Montevideo", ahora)).toBe("2026-10-19");
    expect(diaDeHoy("Asia/Tokyo", ahora)).toBe("2026-10-20");
  });
});

describe("instanteDelDia", () => {
  it("es el mediodía local convertido a UTC, en zonas con distinto desfase", () => {
    // Montevideo es UTC-3 todo el año.
    expect(instanteDelDia("2026-10-05", "America/Montevideo").toISOString()).toBe(
      "2026-10-05T15:00:00.000Z",
    );
    expect(instanteDelDia("2026-01-15", "America/Montevideo").toISOString()).toBe(
      "2026-01-15T15:00:00.000Z",
    );
    expect(instanteDelDia("2026-10-05", "UTC").toISOString()).toBe("2026-10-05T12:00:00.000Z");
    // Madrid: UTC+2 en verano y UTC+1 en invierno.
    expect(instanteDelDia("2026-07-01", "Europe/Madrid").toISOString()).toBe(
      "2026-07-01T10:00:00.000Z",
    );
    expect(instanteDelDia("2026-12-01", "Europe/Madrid").toISOString()).toBe(
      "2026-12-01T11:00:00.000Z",
    );
    // Zona con media hora.
    expect(instanteDelDia("2026-10-05", "Asia/Kolkata").toISOString()).toBe(
      "2026-10-05T06:30:00.000Z",
    );
  });

  it("el día que cambia la hora sigue dando el mediodía local de ese día", () => {
    // Madrid pasó al horario de verano el 29 de marzo de 2026 (a las 02:00 saltó a las 03:00).
    expect(instanteDelDia("2026-03-29", "Europe/Madrid").toISOString()).toBe(
      "2026-03-29T10:00:00.000Z",
    );
    expect(instanteDelDia("2026-10-25", "Europe/Madrid").toISOString()).toBe(
      "2026-10-25T11:00:00.000Z",
    );
  });

  it("de vuelta a esa zona, es el mismo día y la hora pedida", () => {
    const instante = instanteDelDia("2026-02-28", "America/Montevideo", 9);
    expect(diaDeHoy("America/Montevideo", instante)).toBe("2026-02-28");
    expect(instante.toISOString()).toBe("2026-02-28T12:00:00.000Z");
  });
});

describe("sumarDias y diasEntre", () => {
  it("cruzan fin de mes y de año", () => {
    expect(sumarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(sumarDias("2024-03-01", -1)).toBe("2024-02-29");
  });

  it("cuentan días enteros, con signo", () => {
    expect(diasEntre("2026-10-20", "2026-10-20")).toBe(0);
    expect(diasEntre("2026-10-20", "2026-10-27")).toBe(7);
    expect(diasEntre("2026-10-27", "2026-10-20")).toBe(-7);
    expect(diasEntre("2025-12-31", "2026-01-01")).toBe(1);
  });

  it("no se desvían con el cambio de horario de verano", () => {
    expect(diasEntre("2026-03-01", "2026-04-01")).toBe(31);
    expect(diasEntre("2026-10-01", "2026-11-01")).toBe(31);
  });
});

/** Arma el "cuándo cae" dejando en nulo lo que la repetición no usa. */
const cuando = (datos: Partial<CuandoCae> & Pick<CuandoCae, "repeticion">): CuandoCae => ({
  fecha: null,
  diaSemana: null,
  diaDelMes: null,
  mes: null,
  ...datos,
});

describe("diaIsoDeLaSemana", () => {
  it("1 es lunes y 7 es domingo", () => {
    expect(diaIsoDeLaSemana("2026-10-19")).toBe(1);
    expect(diaIsoDeLaSemana("2026-10-20")).toBe(2);
    expect(diaIsoDeLaSemana("2026-10-24")).toBe(6);
    expect(diaIsoDeLaSemana("2026-10-25")).toBe(7);
  });
});

describe("proximaOcurrencia", () => {
  it("una sola vez: ocurre el día, y deja de existir cuando pasa", () => {
    const rec = cuando({ repeticion: "unica", fecha: "2026-10-20" });
    expect(proximaOcurrencia(rec, "2026-10-19")).toBe("2026-10-20");
    expect(proximaOcurrencia(rec, "2026-10-20")).toBe("2026-10-20");
    expect(proximaOcurrencia(rec, "2026-10-21")).toBeNull();
  });

  it("diaria: es hoy, todos los días", () => {
    const rec = cuando({ repeticion: "diaria" });
    expect(proximaOcurrencia(rec, "2026-10-20")).toBe("2026-10-20");
    expect(proximaOcurrencia(rec, "2027-01-01")).toBe("2027-01-01");
  });

  it("semanal: cae el día de la semana pedido, hoy incluido", () => {
    // Hoy es martes 20/10/2026.
    const martes = cuando({ repeticion: "semanal", diaSemana: 2 });
    expect(proximaOcurrencia(martes, "2026-10-20")).toBe("2026-10-20");
    expect(proximaOcurrencia(martes, "2026-10-21")).toBe("2026-10-27");

    const viernes = cuando({ repeticion: "semanal", diaSemana: 5 });
    expect(proximaOcurrencia(viernes, "2026-10-20")).toBe("2026-10-23");

    const lunes = cuando({ repeticion: "semanal", diaSemana: 1 });
    expect(proximaOcurrencia(lunes, "2026-10-20")).toBe("2026-10-26");

    const domingo = cuando({ repeticion: "semanal", diaSemana: 7 });
    expect(proximaOcurrencia(domingo, "2026-10-20")).toBe("2026-10-25");
    expect(proximaOcurrencia(domingo, "2026-12-30")).toBe("2027-01-03");
  });

  it("mensual: cae el mismo número de día, y a fin de mes toma el último que exista", () => {
    const el15 = cuando({ repeticion: "mensual", diaDelMes: 15 });
    expect(proximaOcurrencia(el15, "2026-10-15")).toBe("2026-10-15");
    expect(proximaOcurrencia(el15, "2026-10-16")).toBe("2026-11-15");
    expect(proximaOcurrencia(el15, "2026-12-16")).toBe("2027-01-15");

    const el31 = cuando({ repeticion: "mensual", diaDelMes: 31 });
    expect(proximaOcurrencia(el31, "2026-02-01")).toBe("2026-02-28");
    expect(proximaOcurrencia(el31, "2026-04-01")).toBe("2026-04-30");
    expect(proximaOcurrencia(el31, "2026-04-30")).toBe("2026-04-30");
    expect(proximaOcurrencia(el31, "2026-05-01")).toBe("2026-05-31");
    expect(proximaOcurrencia(el31, "2028-02-01")).toBe("2028-02-29");
    // Pasado el último día de febrero, el siguiente es el de marzo.
    expect(proximaOcurrencia(el31, "2026-03-01")).toBe("2026-03-31");
  });

  it("anual: un cumpleaños vuelve cada año, y el 29 de febrero cae el 28 en los años comunes", () => {
    const cumple = cuando({ repeticion: "anual", diaDelMes: 12, mes: 5 });
    expect(proximaOcurrencia(cumple, "2026-05-12")).toBe("2026-05-12");
    expect(proximaOcurrencia(cumple, "2026-05-13")).toBe("2027-05-12");
    expect(proximaOcurrencia(cumple, "2026-01-01")).toBe("2026-05-12");

    const bisiesto = cuando({ repeticion: "anual", diaDelMes: 29, mes: 2 });
    expect(proximaOcurrencia(bisiesto, "2026-01-01")).toBe("2026-02-28");
    expect(proximaOcurrencia(bisiesto, "2027-03-01")).toBe("2028-02-29");
  });

  it("si falta el campo que le toca a la repetición, no inventa una fecha", () => {
    expect(proximaOcurrencia(cuando({ repeticion: "semanal" }), "2026-10-20")).toBeNull();
    expect(proximaOcurrencia(cuando({ repeticion: "mensual" }), "2026-10-20")).toBeNull();
    expect(
      proximaOcurrencia(cuando({ repeticion: "anual", diaDelMes: 5 }), "2026-10-20"),
    ).toBeNull();
  });
});

describe("describirProgramacion", () => {
  it("dice cuándo cae cada repetición, con la hora si la hay", () => {
    expect(describirProgramacion(cuando({ repeticion: "unica", fecha: "2026-10-20" }), null)).toBe(
      "El 20/10/2026",
    );
    expect(
      describirProgramacion(cuando({ repeticion: "unica", fecha: "2026-10-20" }), "18:30:00"),
    ).toBe("El 20/10/2026 a las 18:30");
    expect(describirProgramacion(cuando({ repeticion: "diaria" }), "08:00")).toBe(
      "Todos los días a las 08:00",
    );
    expect(describirProgramacion(cuando({ repeticion: "semanal", diaSemana: 1 }), null)).toBe(
      "Todos los lunes",
    );
    expect(describirProgramacion(cuando({ repeticion: "semanal", diaSemana: 6 }), "10:00")).toBe(
      "Todos los sábados a las 10:00",
    );
    expect(describirProgramacion(cuando({ repeticion: "mensual", diaDelMes: 15 }), null)).toBe(
      "El día 15 de cada mes",
    );
    expect(
      describirProgramacion(cuando({ repeticion: "anual", diaDelMes: 12, mes: 5 }), null),
    ).toBe("Cada 12 de mayo");
  });
});

describe("recortarHora", () => {
  it("quita los segundos que devuelve la base", () => {
    expect(recortarHora("08:30:00")).toBe("08:30");
    expect(recortarHora("08:30")).toBe("08:30");
    expect(recortarHora(null)).toBeNull();
  });
});

describe("edadQueCumple", () => {
  it("es la diferencia de años entre el nacimiento y el año del cumpleaños", () => {
    expect(edadQueCumple("1990-05-12", "2026-05-12")).toBe(36);
    expect(edadQueCumple("2000-02-29", "2027-02-28")).toBe(27);
  });
});

describe("formatos", () => {
  it("escribe el día en el formato regional, sin que la zona del dispositivo lo corra", () => {
    expect(formatearDiaDeCalendario("2026-10-20")).toBe("20/10/2026");
    expect(formatearDiaDeCalendario("2026-01-01")).toBe("01/01/2026");
    expect(formatearDiaYMes("2026-10-20")).toBe("20 de octubre");
    expect(formatearDiaYMes("2026-01-01")).toBe("1 de enero");
  });

  it("describe cuántos días faltan", () => {
    expect(describirDiasRestantes(0)).toBe("hoy");
    expect(describirDiasRestantes(1)).toBe("mañana");
    expect(describirDiasRestantes(5)).toBe("en 5 días");
  });
});
