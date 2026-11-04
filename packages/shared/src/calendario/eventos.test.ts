import { describe, expect, it } from "vitest";
import type { Repeticion } from "../contactos/constantes.ts";
import { proximaOcurrencia } from "../contactos/fechas.ts";
import { proximaOcurrenciaDeTarea } from "../tareas/cuando-cae.ts";
import {
  cantidadDeRestriccionesPorRepeticion,
  compararEventos,
  DIAS_MAXIMOS_POR_CONSULTA_DE_EVENTOS,
  ESTADOS_OCULTOS_POR_DEFECTO,
  type EstadoDeEvento,
  type EventoDeCalendario,
  esquemaEventoDeCalendario,
  esquemaRangoDeEventos,
  estadoDeEvento,
  estadosPorDefecto,
  type FiltroDeEventos,
  filtroSinRestricciones,
  hayRestricciones,
  marcadorDeEventos,
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

const HOY = "2026-10-20";
const pasa = (evento: EventoDeCalendario, filtro: FiltroDeEventos) =>
  pasaElFiltro(evento, filtro, HOY);

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
    estadosOcultos: new Set(ESTADOS_OCULTOS_POR_DEFECTO),
  });

  it("sin restricciones todo pasa", () => {
    const libre = filtroSinRestricciones();
    for (const repeticion of ["unica", "diaria", "semanal", "mensual", "anual"] as const) {
      expect(pasa(tarea(repeticion), libre)).toBe(true);
    }
    expect(pasa(evento({ origen: "finanzas" }), libre)).toBe(true);
  });

  it("un origen oculto no pasa, sea cual sea su repetición", () => {
    expect(pasa(tarea("semanal"), filtro(["tareas"]))).toBe(false);
    expect(pasa(evento({ origen: "finanzas" }), filtro(["finanzas"]))).toBe(false);
  });

  it("se pueden ocultar solo las tareas diarias y ver las demás", () => {
    const sinDiarias = filtro([], ["diaria"]);
    expect(pasa(tarea("diaria"), sinDiarias)).toBe(false);
    expect(pasa(tarea("semanal"), sinDiarias)).toBe(true);
    expect(pasa(tarea("mensual"), sinDiarias)).toBe(true);
    expect(pasa(tarea("anual"), sinDiarias)).toBe(true);
    expect(pasa(tarea("unica"), sinDiarias)).toBe(true);
  });

  it("se pueden ocultar varias repeticiones a la vez", () => {
    const soloSueltasYAnuales = filtro([], ["diaria", "semanal", "mensual"]);
    expect(pasa(tarea("unica"), soloSueltasYAnuales)).toBe(true);
    expect(pasa(tarea("anual"), soloSueltasYAnuales)).toBe(true);
    expect(pasa(tarea("mensual"), soloSueltasYAnuales)).toBe(false);
  });

  it("las repeticiones de tareas no afectan a los recordatorios, y al revés", () => {
    const recordatorio = (repeticion: EventoDeCalendario["repeticion"]) =>
      evento({ origen: "contactos", repeticion });
    const sinTareasDiarias = filtro([], ["diaria"]);
    expect(pasa(recordatorio("diaria"), sinTareasDiarias)).toBe(true);
    const sinRecordatoriosAnuales = filtro([], [], ["anual"]);
    expect(pasa(recordatorio("anual"), sinRecordatoriosAnuales)).toBe(false);
    expect(pasa(tarea("anual"), sinRecordatoriosAnuales)).toBe(true);
  });

  const mostrando = (...estados: EstadoDeEvento[]): FiltroDeEventos => ({
    ...filtroSinRestricciones(),
    estadosOcultos: new Set(
      (["pendiente", "atrasada", "finalizada"] as const).filter(
        (estado) => !estados.includes(estado),
      ),
    ),
  });

  it("por defecto se ven las pendientes y las atrasadas, y se ocultan las finalizadas (completadas y fallidas)", () => {
    const libre = filtroSinRestricciones();
    const hecha = evento({ origen: "tareas", repeticion: "unica", completado: true });
    const fallida = evento({ origen: "tareas", repeticion: "diaria", fallido: true });
    const atrasada = evento({ origen: "tareas", repeticion: "unica", dia: "2026-10-19" });
    expect(pasa(tarea("unica"), libre)).toBe(true);
    expect(pasa(atrasada, libre)).toBe(true);
    expect(pasa(hecha, libre)).toBe(false);
    expect(pasa(fallida, libre)).toBe(false);
  });

  it("cada estado se muestra u oculta por su cuenta", () => {
    const hecha = evento({ origen: "tareas", repeticion: "unica", completado: true });
    const fallida = evento({ origen: "tareas", repeticion: "unica", fallido: true });
    const atrasada = evento({ origen: "tareas", repeticion: "unica", dia: "2026-10-19" });
    const pendiente = tarea("unica");

    // "Finalizada" muestra las completadas y las fallidas juntas.
    expect(pasa(hecha, mostrando("finalizada"))).toBe(true);
    expect(pasa(fallida, mostrando("finalizada"))).toBe(true);
    expect(pasa(pendiente, mostrando("finalizada"))).toBe(false);
    expect(pasa(atrasada, mostrando("finalizada"))).toBe(false);

    expect(pasa(atrasada, mostrando("pendiente", "finalizada"))).toBe(false);
    expect(pasa(atrasada, mostrando("atrasada"))).toBe(true);
    expect(pasa(pendiente, mostrando("atrasada"))).toBe(false);
    expect(pasa(hecha, mostrando("pendiente", "atrasada"))).toBe(false);
  });

  it("con todos los estados a la vista se ve todo, y con ninguno no se ve nada", () => {
    const todos = mostrando("pendiente", "atrasada", "finalizada");
    const hecha = evento({ origen: "tareas", repeticion: "unica", completado: true });
    expect(pasa(hecha, todos)).toBe(true);
    expect(pasa(tarea("unica"), todos)).toBe(true);
    expect(pasa(tarea("unica"), mostrando())).toBe(false);
  });

  it("Finanzas y los eventos manuales son siempre pendientes, aunque su día haya pasado", () => {
    const pasado = { dia: "2026-10-01" };
    expect(pasa(evento({ origen: "finanzas", ...pasado }), mostrando("pendiente"))).toBe(true);
    expect(pasa(evento({ origen: "manual", ...pasado }), mostrando("atrasada"))).toBe(false);
  });

  it("un estado cerrado también respeta el filtro de origen y de repetición", () => {
    const hechaDiaria = evento({ origen: "tareas", repeticion: "diaria", completado: true });
    const base = { ...filtro([], ["diaria"]), estadosOcultos: new Set<EstadoDeEvento>() };
    expect(pasa(hechaDiaria, base)).toBe(false);
    expect(
      pasa(hechaDiaria, {
        ...base,
        repeticionesOcultas: filtroSinRestricciones().repeticionesOcultas,
      }),
    ).toBe(true);
    expect(pasa(hechaDiaria, { ...base, origenesOcultos: new Set(["tareas"]) })).toBe(false);
  });

  it("lo que no tiene repetición (Finanzas y manuales) no se ve afectado por esas restricciones", () => {
    const restringido = filtro([], ["diaria", "semanal", "mensual", "anual", "unica"]);
    expect(pasa(evento({ origen: "finanzas", repeticion: null }), restringido)).toBe(true);
    expect(pasa(evento({ origen: "manual", repeticion: null }), restringido)).toBe(true);
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
    estadosOcultos: new Set(ESTADOS_OCULTOS_POR_DEFECTO),
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
    expect(pasa(cadaDias, filtro)).toBe(true);
    const sin = {
      ...filtro,
      repeticionesOcultas: {
        ...filtro.repeticionesOcultas,
        tareas: new Set(["intervalo" as const]),
      },
    };
    expect(pasa(cadaDias, sin)).toBe(false);
    expect(pasa(evento({ origen: "tareas", repeticion: "diaria" }), sin)).toBe(true);
  });
});

describe("estadoDeEvento", () => {
  it("una tarea sin hacer de hoy o de un día futuro está pendiente", () => {
    expect(estadoDeEvento(evento({ origen: "tareas", dia: HOY }), HOY)).toBe("pendiente");
    expect(estadoDeEvento(evento({ origen: "tareas", dia: "2026-10-21" }), HOY)).toBe("pendiente");
  });

  it("una tarea sin hacer de un día anterior a hoy está atrasada", () => {
    expect(estadoDeEvento(evento({ origen: "tareas", dia: "2026-10-19" }), HOY)).toBe("atrasada");
  });

  it("completada y fallida son finalizadas, y ganan a atrasada", () => {
    const ayer = { origen: "tareas", dia: "2026-10-19" } as const;
    expect(estadoDeEvento(evento({ ...ayer, completado: true }), HOY)).toBe("finalizada");
    expect(estadoDeEvento(evento({ ...ayer, fallido: true }), HOY)).toBe("finalizada");
  });

  it("solo las tareas se atrasan: lo demás de un día pasado sigue pendiente", () => {
    for (const origen of ["finanzas", "manual", "contactos"] as const) {
      expect(estadoDeEvento(evento({ origen, dia: "2026-10-19" }), HOY)).toBe("pendiente");
    }
  });

  it("un recordatorio pasado está finalizado", () => {
    expect(
      estadoDeEvento(evento({ origen: "contactos", dia: "2026-10-19", completado: true }), HOY),
    ).toBe("finalizada");
  });
});

describe("marcadorDeEventos", () => {
  const HOY = "2026-10-20";
  const tareaDe = (datos: Partial<EventoDeCalendario>) => evento({ origen: "tareas", ...datos });
  const pendiente = tareaDe({ dia: HOY });
  const atrasada = tareaDe({ dia: "2026-10-19" });
  const hecha = tareaDe({ dia: "2026-10-19", completado: true });
  const fallida = tareaDe({ dia: "2026-10-19", fallido: true });

  it("con algo pendiente es pendiente, aunque haya atrasadas y finalizadas", () => {
    expect(marcadorDeEventos([pendiente], HOY)).toBe("pendiente");
    expect(marcadorDeEventos([hecha, atrasada, pendiente, fallida], HOY)).toBe("pendiente");
  });

  it("sin pendientes pero con alguna atrasada es atrasada, aunque haya finalizadas", () => {
    expect(marcadorDeEventos([atrasada], HOY)).toBe("atrasada");
    expect(marcadorDeEventos([hecha, atrasada, fallida], HOY)).toBe("atrasada");
  });

  it("con todo finalizado depende de cómo terminó: completada, fallida o mixta", () => {
    expect(marcadorDeEventos([hecha], HOY)).toBe("completada");
    expect(marcadorDeEventos([hecha, hecha], HOY)).toBe("completada");
    expect(marcadorDeEventos([fallida], HOY)).toBe("fallida");
    expect(marcadorDeEventos([fallida, fallida], HOY)).toBe("fallida");
    expect(marcadorDeEventos([hecha, fallida], HOY)).toBe("mixta");
    expect(marcadorDeEventos([fallida, hecha, hecha], HOY)).toBe("mixta");
  });

  it("los recordatorios de Contactos son próximos (pendiente) o pasados, sin otros estados", () => {
    const pasado = evento({ origen: "contactos", dia: "2026-10-19", completado: true });
    const proximo = evento({ origen: "contactos", dia: HOY });
    expect(marcadorDeEventos([pasado], HOY)).toBe("pasado");
    expect(marcadorDeEventos([pasado, pasado], HOY)).toBe("pasado");
    expect(marcadorDeEventos([proximo], HOY)).toBe("pendiente");
    expect(marcadorDeEventos([pasado, proximo], HOY)).toBe("pendiente");
  });

  it("Finanzas y los manuales de un día pasado siguen pendientes", () => {
    expect(marcadorDeEventos([evento({ origen: "finanzas", dia: "2026-10-01" })], HOY)).toBe(
      "pendiente",
    );
  });
});

describe("estadosPorDefecto", () => {
  it("el filtro nuevo tiene los estados por defecto y cambiarlos lo deja de ser", () => {
    const libre = filtroSinRestricciones();
    expect(estadosPorDefecto(libre)).toBe(true);
    expect(
      estadosPorDefecto({ ...libre, estadosOcultos: new Set<EstadoDeEvento>(["pendiente"]) }),
    ).toBe(false);
    expect(estadosPorDefecto({ ...libre, estadosOcultos: new Set<EstadoDeEvento>() })).toBe(false);
  });

  it("ocultar estados no cuenta como restricción de origen o de repetición", () => {
    expect(hayRestricciones(filtroSinRestricciones())).toBe(false);
  });
});
