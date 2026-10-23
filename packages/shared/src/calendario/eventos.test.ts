import { describe, expect, it } from "vitest";
import type { Repeticion } from "../contactos/constantes.ts";
import { proximaOcurrencia } from "../contactos/fechas.ts";
import { proximaOcurrenciaDeTarea } from "../tareas/cuando-cae.ts";
import {
  cantidadDeRestriccionesPorRepeticion,
  compararEventos,
  DIAS_MAXIMOS_POR_CONSULTA_DE_EVENTOS,
  type EventoDeCalendario,
  esquemaEventoDeCalendario,
  esquemaRangoDeEventos,
  type FiltroDeEventos,
  filtroSinRestricciones,
  hayRestricciones,
  type OrigenDeEvento,
  ocurrenciasEnRango,
  pasaElFiltro,
  repeticionesDeEvento,
} from "./eventos.ts";

const VACIO = { repeticion: "unica", fecha: null, diaSemana: null, diaDelMes: null, mes: null };

describe("ocurrenciasEnRango", () => {
  it("una que se repite todos los días cae en cada día del rango, inclusive los extremos", () => {
    const dias = ocurrenciasEnRango(
      (desde) => proximaOcurrencia({ ...VACIO, repeticion: "diaria" }, desde),
      "2026-10-29",
      "2026-11-02",
    );
    expect(dias).toEqual(["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("una semanal cae cada siete días", () => {
    const dias = ocurrenciasEnRango(
      (desde) => proximaOcurrencia({ ...VACIO, repeticion: "semanal", diaSemana: 1 }, desde),
      "2026-10-01",
      "2026-10-31",
    );
    expect(dias).toEqual(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
  });

  it("una semanal de varios días junta los días de todas las semanas", () => {
    const dias = ocurrenciasEnRango(
      (desde) =>
        proximaOcurrenciaDeTarea(
          { repeticion: "semanal", diasSemana: [6, 7], diaDelMes: null, mes: null },
          desde,
        ),
      "2026-10-01",
      "2026-10-14",
    );
    expect(dias).toEqual(["2026-10-03", "2026-10-04", "2026-10-10", "2026-10-11"]);
  });

  it("una mensual del 31 cae el último día de los meses más cortos", () => {
    const dias = ocurrenciasEnRango(
      (desde) => proximaOcurrencia({ ...VACIO, repeticion: "mensual", diaDelMes: 31 }, desde),
      "2026-02-01",
      "2026-04-30",
    );
    expect(dias).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("una anual solo cae si su día está en el rango", () => {
    const anual = (desde: string) =>
      proximaOcurrencia({ ...VACIO, repeticion: "anual", diaDelMes: 29, mes: 2 }, desde);
    expect(ocurrenciasEnRango(anual, "2028-02-01", "2028-03-10")).toEqual(["2028-02-29"]);
    expect(ocurrenciasEnRango(anual, "2027-02-01", "2027-03-10")).toEqual(["2027-02-28"]);
    expect(ocurrenciasEnRango(anual, "2026-06-01", "2026-07-10")).toEqual([]);
  });

  it("una de una sola vez cae solo si su día está en el rango", () => {
    const unica = (desde: string) =>
      proximaOcurrencia({ ...VACIO, repeticion: "unica", fecha: "2026-10-20" }, desde);
    expect(ocurrenciasEnRango(unica, "2026-10-20", "2026-10-20")).toEqual(["2026-10-20"]);
    expect(ocurrenciasEnRango(unica, "2026-10-21", "2026-11-20")).toEqual([]);
    expect(ocurrenciasEnRango(unica, "2026-10-01", "2026-10-19")).toEqual([]);
  });

  it("sin ninguna ocurrencia devuelve una lista vacía", () => {
    expect(ocurrenciasEnRango(() => null, "2026-10-01", "2026-10-31")).toEqual([]);
  });
});

function evento(datos: Partial<EventoDeCalendario>): EventoDeCalendario {
  return {
    id: "x",
    origen: "manual",
    titulo: "Evento",
    detalle: null,
    dia: "2026-10-20",
    hora: null,
    repeticion: null,
    completado: false,
    fallido: false,
    ...datos,
  };
}

describe("compararEventos", () => {
  it("ordena por día", () => {
    const lista = [evento({ dia: "2026-10-21" }), evento({ dia: "2026-10-20" })];
    expect(lista.sort(compararEventos).map((e) => e.dia)).toEqual(["2026-10-20", "2026-10-21"]);
  });

  it("en un día, lo de todo el día va primero y después por hora", () => {
    const lista = [
      evento({ titulo: "C", hora: "18:30" }),
      evento({ titulo: "A", hora: "08:00" }),
      evento({ titulo: "Z", hora: null }),
      evento({ titulo: "B", hora: "09:15" }),
    ];
    expect(lista.sort(compararEventos).map((e) => e.titulo)).toEqual(["Z", "A", "B", "C"]);
  });

  it("con la misma hora, por origen y después por título", () => {
    const lista = [
      evento({ titulo: "m", origen: "manual", hora: "10:00" }),
      evento({ titulo: "t", origen: "tareas", hora: "10:00" }),
      evento({ titulo: "c", origen: "contactos", hora: "10:00" }),
      evento({ titulo: "f", origen: "finanzas", hora: "10:00" }),
      evento({ titulo: "b", origen: "tareas", hora: "10:00" }),
    ];
    expect(lista.sort(compararEventos).map((e) => e.titulo)).toEqual(["f", "c", "b", "t", "m"]);
  });

  it("el título se ordena como se escribe en español", () => {
    const lista = [evento({ titulo: "Óptica" }), evento({ titulo: "Zapatos" })];
    expect(lista.sort(compararEventos).map((e) => e.titulo)).toEqual(["Óptica", "Zapatos"]);
  });
});

describe("esquemaEventoDeCalendario", () => {
  const valido = { titulo: "Dentista", notas: "", fecha: "2026-10-20", hora: "" };

  it("acepta un evento de todo el día y uno con hora", () => {
    expect(esquemaEventoDeCalendario.safeParse(valido).success).toBe(true);
    expect(esquemaEventoDeCalendario.safeParse({ ...valido, hora: "08:30" }).success).toBe(true);
  });

  it("recorta el título y exige que no quede vacío", () => {
    expect(esquemaEventoDeCalendario.parse({ ...valido, titulo: "  Dentista  " }).titulo).toBe(
      "Dentista",
    );
    const resultado = esquemaEventoDeCalendario.safeParse({ ...valido, titulo: "   " });
    expect(resultado.success).toBe(false);
  });

  it("rechaza títulos y notas demasiado largos", () => {
    expect(
      esquemaEventoDeCalendario.safeParse({ ...valido, titulo: "a".repeat(121) }).success,
    ).toBe(false);
    expect(esquemaEventoDeCalendario.safeParse({ ...valido, notas: "a".repeat(501) }).success).toBe(
      false,
    );
  });

  it("rechaza días que no existen, vacíos o fuera del rango del calendario", () => {
    for (const fecha of ["2026-02-30", "", "20/10/2026", "1899-12-31", "2201-01-01"]) {
      expect(esquemaEventoDeCalendario.safeParse({ ...valido, fecha }).success, fecha).toBe(false);
    }
    expect(esquemaEventoDeCalendario.safeParse({ ...valido, fecha: "1900-01-01" }).success).toBe(
      true,
    );
    expect(esquemaEventoDeCalendario.safeParse({ ...valido, fecha: "2200-12-31" }).success).toBe(
      true,
    );
  });

  it("rechaza horas que no existen", () => {
    for (const hora of ["24:00", "12:60", "8:30", "ocho"]) {
      expect(esquemaEventoDeCalendario.safeParse({ ...valido, hora }).success, hora).toBe(false);
    }
  });
});

describe("esquemaRangoDeEventos", () => {
  it("acepta un rango de un día y uno de seis semanas", () => {
    expect(
      esquemaRangoDeEventos.safeParse({ desde: "2026-10-20", hasta: "2026-10-20" }).success,
    ).toBe(true);
    expect(
      esquemaRangoDeEventos.safeParse({ desde: "2026-09-28", hasta: "2026-11-08" }).success,
    ).toBe(true);
  });

  it("rechaza un final anterior al comienzo", () => {
    const resultado = esquemaRangoDeEventos.safeParse({ desde: "2026-10-20", hasta: "2026-10-19" });
    expect(resultado.success).toBe(false);
  });

  it("rechaza rangos más largos que el máximo", () => {
    // 70 días justos pasan; 71 no.
    expect(DIAS_MAXIMOS_POR_CONSULTA_DE_EVENTOS).toBe(70);
    expect(
      esquemaRangoDeEventos.safeParse({ desde: "2026-01-01", hasta: "2026-03-11" }).success,
    ).toBe(true);
    expect(
      esquemaRangoDeEventos.safeParse({ desde: "2026-01-01", hasta: "2026-03-12" }).success,
    ).toBe(false);
  });

  it("rechaza días mal escritos", () => {
    expect(esquemaRangoDeEventos.safeParse({ desde: "ayer", hasta: "2026-10-19" }).success).toBe(
      false,
    );
    expect(esquemaRangoDeEventos.safeParse({ desde: "2026-10-19" }).success).toBe(false);
    // Con los dos mal escritos tampoco se rompe: solo se rechaza.
    expect(esquemaRangoDeEventos.safeParse({ desde: "ayer", hasta: "hoy" }).success).toBe(false);
  });
});

describe("pasaElFiltro", () => {
  const tarea = (repeticion: EventoDeCalendario["repeticion"]) =>
    evento({ origen: "tareas", repeticion });
  const filtro = (
    origenesOcultos: OrigenDeEvento[] = [],
    tareas: Repeticion[] = [],
    contactos: Repeticion[] = [],
  ): FiltroDeEventos => ({
    origenesOcultos: new Set(origenesOcultos),
    repeticionesOcultas: { tareas: new Set(tareas), contactos: new Set(contactos) },
    mostrarCompletados: false,
  });

  it("sin restricciones todo pasa", () => {
    const libre = filtroSinRestricciones();
    for (const repeticion of ["unica", "diaria", "semanal", "mensual", "anual"] as const) {
      expect(pasaElFiltro(tarea(repeticion), libre)).toBe(true);
    }
    expect(pasaElFiltro(evento({ origen: "finanzas" }), libre)).toBe(true);
  });

  it("un origen oculto no pasa, sea cual sea su repetición", () => {
    expect(pasaElFiltro(tarea("semanal"), filtro(["tareas"]))).toBe(false);
    expect(pasaElFiltro(evento({ origen: "finanzas" }), filtro(["finanzas"]))).toBe(false);
  });

  it("se pueden ocultar solo las tareas diarias y ver las demás", () => {
    const sinDiarias = filtro([], ["diaria"]);
    expect(pasaElFiltro(tarea("diaria"), sinDiarias)).toBe(false);
    expect(pasaElFiltro(tarea("semanal"), sinDiarias)).toBe(true);
    expect(pasaElFiltro(tarea("mensual"), sinDiarias)).toBe(true);
    expect(pasaElFiltro(tarea("anual"), sinDiarias)).toBe(true);
    expect(pasaElFiltro(tarea("unica"), sinDiarias)).toBe(true);
  });

  it("se pueden ocultar varias repeticiones a la vez", () => {
    const soloSueltasYAnuales = filtro([], ["diaria", "semanal", "mensual"]);
    expect(pasaElFiltro(tarea("unica"), soloSueltasYAnuales)).toBe(true);
    expect(pasaElFiltro(tarea("anual"), soloSueltasYAnuales)).toBe(true);
    expect(pasaElFiltro(tarea("mensual"), soloSueltasYAnuales)).toBe(false);
  });

  it("las repeticiones de tareas no afectan a los recordatorios, y al revés", () => {
    const recordatorio = (repeticion: EventoDeCalendario["repeticion"]) =>
      evento({ origen: "contactos", repeticion });
    const sinTareasDiarias = filtro([], ["diaria"]);
    expect(pasaElFiltro(recordatorio("diaria"), sinTareasDiarias)).toBe(true);
    const sinRecordatoriosAnuales = filtro([], [], ["anual"]);
    expect(pasaElFiltro(recordatorio("anual"), sinRecordatoriosAnuales)).toBe(false);
    expect(pasaElFiltro(tarea("anual"), sinRecordatoriosAnuales)).toBe(true);
  });

  it("las tareas completadas se ocultan por defecto y se muestran si se pide", () => {
    const hecha = evento({ origen: "tareas", repeticion: "unica", completado: true });
    const pendiente = tarea("unica");
    expect(pasaElFiltro(hecha, filtroSinRestricciones())).toBe(false);
    expect(pasaElFiltro(pendiente, filtroSinRestricciones())).toBe(true);
    const conCompletadas = { ...filtroSinRestricciones(), mostrarCompletados: true };
    expect(pasaElFiltro(hecha, conCompletadas)).toBe(true);
    expect(pasaElFiltro(pendiente, conCompletadas)).toBe(true);
  });

  it("las tareas fallidas se ocultan por defecto igual que las completadas", () => {
    const fallida = evento({ origen: "tareas", repeticion: "diaria", fallido: true });
    expect(pasaElFiltro(fallida, filtroSinRestricciones())).toBe(false);
    expect(pasaElFiltro(fallida, { ...filtroSinRestricciones(), mostrarCompletados: true })).toBe(
      true,
    );
  });

  it("una tarea completada también respeta el filtro de origen y de repetición", () => {
    const hechaDiaria = evento({ origen: "tareas", repeticion: "diaria", completado: true });
    const base = { ...filtro([], ["diaria"]), mostrarCompletados: true };
    expect(pasaElFiltro(hechaDiaria, base)).toBe(false);
    expect(
      pasaElFiltro(hechaDiaria, {
        ...base,
        repeticionesOcultas: filtroSinRestricciones().repeticionesOcultas,
      }),
    ).toBe(true);
    expect(pasaElFiltro(hechaDiaria, { ...base, origenesOcultos: new Set(["tareas"]) })).toBe(
      false,
    );
  });

  it("lo que no tiene repetición (Finanzas y manuales) no se ve afectado por esas restricciones", () => {
    const restringido = filtro([], ["diaria", "semanal", "mensual", "anual", "unica"]);
    expect(pasaElFiltro(evento({ origen: "finanzas", repeticion: null }), restringido)).toBe(true);
    expect(pasaElFiltro(evento({ origen: "manual", repeticion: null }), restringido)).toBe(true);
  });
});

describe("restricciones del filtro", () => {
  const filtro = (
    origenesOcultos: OrigenDeEvento[],
    tareas: Repeticion[],
    contactos: Repeticion[] = [],
  ): FiltroDeEventos => ({
    origenesOcultos: new Set(origenesOcultos),
    repeticionesOcultas: { tareas: new Set(tareas), contactos: new Set(contactos) },
    mostrarCompletados: false,
  });

  it("sin nada oculto no hay restricciones", () => {
    expect(hayRestricciones(filtroSinRestricciones())).toBe(false);
    expect(cantidadDeRestriccionesPorRepeticion(filtroSinRestricciones())).toBe(0);
  });

  it("cuenta las repeticiones ocultas de los orígenes que siguen a la vista", () => {
    expect(cantidadDeRestriccionesPorRepeticion(filtro([], ["diaria", "mensual"], ["anual"]))).toBe(
      3,
    );
  });

  it("las repeticiones de un origen oculto entero no suman", () => {
    expect(cantidadDeRestriccionesPorRepeticion(filtro(["tareas"], ["diaria", "mensual"]))).toBe(0);
  });

  it("hay restricciones si se ocultó un origen o una repetición", () => {
    expect(hayRestricciones(filtro(["finanzas"], []))).toBe(true);
    expect(hayRestricciones(filtro([], [], ["unica"]))).toBe(true);
  });
});

describe("repeticionesDeEvento", () => {
  it("las tareas ofrecen 'cada tantos días' y los recordatorios no", () => {
    expect(repeticionesDeEvento("tareas")).toContain("intervalo");
    expect(repeticionesDeEvento("contactos")).not.toContain("intervalo");
    expect(repeticionesDeEvento("contactos")).toEqual([
      "unica",
      "diaria",
      "semanal",
      "mensual",
      "anual",
    ]);
  });

  it("un evento 'cada tantos días' se puede ocultar por su repetición", () => {
    const filtro = filtroSinRestricciones();
    const cadaDias = evento({ origen: "tareas", repeticion: "intervalo" });
    expect(pasaElFiltro(cadaDias, filtro)).toBe(true);
    const sin = {
      ...filtro,
      repeticionesOcultas: {
        ...filtro.repeticionesOcultas,
        tareas: new Set(["intervalo" as const]),
      },
    };
    expect(pasaElFiltro(cadaDias, sin)).toBe(false);
    expect(pasaElFiltro(evento({ origen: "tareas", repeticion: "diaria" }), sin)).toBe(true);
  });
});
