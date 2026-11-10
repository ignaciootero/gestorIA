// Eventos del calendario: lo que se muestra en cada día, venga de donde venga.
//
// El calendario junta cuatro orígenes y los muestra todos igual: los eventos que la persona anota
// a mano en el propio calendario y lo que aportan los otros módulos (el vencimiento de una deuda
// de Finanzas, un recordatorio de un contacto, una tarea pendiente). Cada evento dice de dónde
// viene (`origen`) para que la pantalla lo indique y lleve al módulo que corresponde.
//
// Todo es de días de calendario ("AAAA-MM-DD") y horas de reloj de la persona ("HH:MM"), sin zona
// horaria: un evento "a las 15:00" es a las 15:00 de donde esté la persona.
//
// Acá viven los tipos, los límites, el esquema del evento manual (lo usan el formulario de la web y
// la API) y las cuentas puras para ubicar y ordenar eventos, que se prueban sin base de datos.

import { z } from "zod";
import type { Repeticion } from "../contactos/constantes.ts";
import { esquemaDiaDeCalendario, esquemaHoraOpcional } from "../contactos/esquemas.ts";
import { diasEntre, esDiaReal, sumarDias } from "../contactos/fechas.ts";

/** De dónde viene un evento. "manual" son los que se agregan en el propio calendario. */
export const ORIGENES_DE_EVENTO = ["manual", "finanzas", "contactos", "tareas"] as const;
export type OrigenDeEvento = (typeof ORIGENES_DE_EVENTO)[number];

/** Cómo se llama cada origen en pantalla. */
export const NOMBRES_DE_ORIGEN: Record<OrigenDeEvento, string> = {
  manual: "Calendario",
  finanzas: "Finanzas",
  contactos: "Contactos",
  tareas: "Tareas",
};

/** Un evento tal como lo muestra el calendario. */
export type EventoDeCalendario = {
  /**
   * Identifica al evento en la lista. Los manuales usan el id de la base (sirve para editarlos y
   * eliminarlos); los demás arman el suyo con lo que los origina y el día, porque una misma
   * tarea o recordatorio repetido aparece en muchos días.
   */
  id: string;
  origen: OrigenDeEvento;
  titulo: string;
  /** Una línea de contexto: con quién, de cuánto, qué categoría. En los manuales, son las notas. */
  detalle: string | null;
  /** "AAAA-MM-DD". */
  dia: string;
  /** "HH:MM"; null es "todo el día". */
  hora: string | null;
  /**
   * Cada cuánto se repite lo que lo origina, para los orígenes que lo distinguen (Tareas y Contactos):
   * "unica" es una tarea suelta o un recordatorio de una sola vez. Es null en los demás orígenes.
   */
  repeticion: RepeticionDeEvento | null;
  /**
   * true si ya está hecho: una tarea tildada, un recordatorio de Contactos cuyo día ya pasó (un
   * recordatorio no se tilda) o una deuda de Finanzas ya pagada. Por defecto el filtro los oculta (ver
   * `FiltroDeEventos.estadosOcultos`); los manuales siempre traen false (se sabe si pasaron por el día).
   */
  completado: boolean;
  /**
   * true si es una tarea atrasada que la persona marcó como fallida (ya no se va a hacer). Se trata
   * como lo completado: queda oculta por defecto. Todos los demás eventos traen false.
   */
  fallido: boolean;
};

/** Cada cuánto se repite lo que origina un evento: las de siempre y "intervalo" (cada tantos días, solo de tareas). */
export type RepeticionDeEvento = Repeticion | "intervalo";

/** Los orígenes cuyos eventos tienen una repetición por la que se pueden filtrar. */
export const ORIGENES_CON_REPETICION = ["tareas", "contactos"] as const;
export type OrigenConRepeticion = (typeof ORIGENES_CON_REPETICION)[number];

/** Las repeticiones por las que se filtra, de la que no se repite a la más espaciada. */
export const REPETICIONES_DE_EVENTO = [
  "unica",
  "diaria",
  "intervalo",
  "semanal",
  "mensual",
  "anual",
] as const satisfies readonly RepeticionDeEvento[];

/** Las repeticiones que ofrece el filtro de cada origen: los recordatorios no tienen "cada tantos días". */
export function repeticionesDeEvento(origen: OrigenConRepeticion): readonly RepeticionDeEvento[] {
  return origen === "tareas"
    ? REPETICIONES_DE_EVENTO
    : REPETICIONES_DE_EVENTO.filter((repeticion) => repeticion !== "intervalo");
}

/** Cómo se llama cada repetición en el filtro ("Diarias", "Semanales"…). */
export const NOMBRES_DE_REPETICION_EN_PLURAL: Record<RepeticionDeEvento, string> = {
  unica: "Una sola vez",
  diaria: "Diarias",
  intervalo: "Cada varios días",
  semanal: "Semanales",
  mensual: "Mensuales",
  anual: "Anuales",
};

/** Los años que acepta el calendario. */
export const ANIO_MINIMO_DEL_CALENDARIO = 1900;
export const ANIO_MAXIMO_DEL_CALENDARIO = 2200;

export const LARGO_MAXIMO_TITULO_DE_EVENTO = 120;
export const LARGO_MAXIMO_NOTAS_DE_EVENTO = 500;

/** Tope contra errores de carga y abusos; no es un límite técnico. */
export const MAXIMO_DE_EVENTOS_DE_CALENDARIO = 2000;

/** Cuántos días se pueden pedir de una vez: alcanza para las seis semanas de un mes con margen. */
export const DIAS_MAXIMOS_POR_CONSULTA_DE_EVENTOS = 70;

/** Un día dentro de los años que acepta el calendario. */
const esquemaDiaDelCalendario = esquemaDiaDeCalendario.refine((dia) => {
  const anio = Number(dia.slice(0, 4));
  return anio >= ANIO_MINIMO_DEL_CALENDARIO && anio <= ANIO_MAXIMO_DEL_CALENDARIO;
}, `El año tiene que estar entre ${ANIO_MINIMO_DEL_CALENDARIO} y ${ANIO_MAXIMO_DEL_CALENDARIO}.`);

/**
 * Un evento que la persona agrega a mano: un día, con hora opcional (sin hora es "todo el día").
 * Los textos opcionales aceptan cadena vacía, que es lo que manda un campo en blanco.
 */
export const esquemaEventoDeCalendario = z.object({
  titulo: z
    .string()
    .trim()
    .min(1, "Escribí cómo se llama el evento.")
    .max(
      LARGO_MAXIMO_TITULO_DE_EVENTO,
      `El título no puede pasar de ${LARGO_MAXIMO_TITULO_DE_EVENTO} caracteres.`,
    ),
  notas: z
    .string()
    .trim()
    .max(
      LARGO_MAXIMO_NOTAS_DE_EVENTO,
      `Las notas no pueden pasar de ${LARGO_MAXIMO_NOTAS_DE_EVENTO} caracteres.`,
    ),
  fecha: esquemaDiaDelCalendario,
  hora: esquemaHoraOpcional,
});
export type DatosDeEventoDeCalendario = z.infer<typeof esquemaEventoDeCalendario>;

/** El rango de días que se consulta (ambos inclusive). */
export const esquemaRangoDeEventos = z
  .object({ desde: esquemaDiaDelCalendario, hasta: esquemaDiaDelCalendario })
  .superRefine((rango, contexto) => {
    // Con un día mal escrito (ya avisado en su campo) no hay rango que revisar: `diasEntre` fallaría.
    if (!esDiaReal(rango.desde) || !esDiaReal(rango.hasta)) return;
    if (rango.hasta < rango.desde) {
      contexto.addIssue({
        code: "custom",
        path: ["hasta"],
        message: "El final no puede ser anterior al comienzo.",
      });
    } else if (diasEntre(rango.desde, rango.hasta) + 1 > DIAS_MAXIMOS_POR_CONSULTA_DE_EVENTOS) {
      contexto.addIssue({
        code: "custom",
        path: ["hasta"],
        message: `Se pueden pedir hasta ${DIAS_MAXIMOS_POR_CONSULTA_DE_EVENTOS} días de una vez.`,
      });
    }
  });
export type RangoDeEventos = z.infer<typeof esquemaRangoDeEventos>;

/**
 * Los días entre `desde` y `hasta` (inclusive) en que cae algo que se repite. `proxima` es la
 * misma pregunta que ya responde cada módulo ("¿cuál es el primer día, desde este, en que
 * cae?"): se la va haciendo desde el día siguiente a cada respuesta hasta salirse del rango.
 */
export function ocurrenciasEnRango(
  proxima: (desde: string) => string | null,
  desde: string,
  hasta: string,
): string[] {
  const dias: string[] = [];
  let cursor = desde;
  while (cursor <= hasta) {
    const dia = proxima(cursor);
    if (dia === null || dia > hasta) break;
    dias.push(dia);
    cursor = sumarDias(dia, 1);
  }
  return dias;
}

/**
 * Qué eventos se muestran. Se filtra por origen (ocultar todo lo de Finanzas, por ejemplo) y, para los
 * orígenes con repetición (Tareas y Contactos), también por cada cuánto se repite lo que lo origina: se
 * puede ocultar las tareas diarias y dejar las semanales, mensuales y anuales. Se guardan los que se
 * **ocultan**, así un origen o una repetición nuevos aparecen visibles sin migrar nada.
 *
 * Los cuatro orígenes se filtran también por estado, cada uno con los suyos (ver `estadosDeOrigen`): las
 * tareas son pendientes, atrasadas o finalizadas; los recordatorios, próximos o pasados; las deudas de
 * Finanzas, pendientes, atrasadas o pagadas; y los eventos propios, futuros o pasados. Por defecto se
 * ocultan las tareas finalizadas, los recordatorios pasados, las deudas pagadas y los eventos propios
 * pasados: el calendario sirve para ver lo que falta, y un mes pasado lleno de cosas hechas lo taparía. Los
 * estados también se guardan como "ocultos"; lo que cambia es el valor por defecto, que no es "todo visible".
 */
export type FiltroDeEventos = {
  origenesOcultos: ReadonlySet<OrigenDeEvento>;
  repeticionesOcultas: Readonly<Record<OrigenConRepeticion, ReadonlySet<RepeticionDeEvento>>>;
  estadosOcultos: Readonly<Record<OrigenDeEvento, ReadonlySet<EstadoParaFiltrar>>>;
};

/**
 * En qué punto está un evento. "Finalizada" junta lo completado (una tarea tildada o un recordatorio cuyo
 * día ya pasó) y lo fallido (una tarea que se dio por perdida). Solo las tareas pueden estar atrasadas o
 * fallidas. Son también los estados por los que se filtran las tareas.
 */
export const ESTADOS_DE_EVENTO = ["pendiente", "atrasada", "finalizada"] as const;
export type EstadoDeEvento = (typeof ESTADOS_DE_EVENTO)[number];

/**
 * Los estados por los que se filtran los recordatorios de Contactos: un recordatorio no se tilda ni se
 * atrasa, solo es próximo (hoy o más adelante) o pasado (su día ya pasó).
 */
export const ESTADOS_DE_RECORDATORIO = ["proximo", "pasado"] as const;
export type EstadoDeRecordatorio = (typeof ESTADOS_DE_RECORDATORIO)[number];

/**
 * Los estados por los que se filtran las deudas de Finanzas: pendiente (vence hoy o más adelante),
 * atrasada (venció y no se pagó del todo) o pagada (saldada).
 */
export const ESTADOS_DE_DEUDA = ["pendiente", "atrasada", "pagada"] as const;
export type EstadoDeDeudaEnElCalendario = (typeof ESTADOS_DE_DEUDA)[number];

/**
 * Los estados por los que se filtran los eventos propios del calendario: un evento no se tilda, solo es
 * futuro (hoy o más adelante) o pasado (su día ya pasó).
 */
export const ESTADOS_DE_EVENTO_PROPIO = ["futuro", "pasado"] as const;
export type EstadoDeEventoPropio = (typeof ESTADOS_DE_EVENTO_PROPIO)[number];

/** Cualquiera de los estados por los que se filtra, de cualquier origen. */
export type EstadoParaFiltrar =
  | EstadoDeEvento
  | EstadoDeRecordatorio
  | EstadoDeDeudaEnElCalendario
  | EstadoDeEventoPropio;

/** Los estados que ofrece el filtro de cada origen. */
const ESTADOS_DE_ORIGEN: Readonly<Record<OrigenDeEvento, readonly EstadoParaFiltrar[]>> = {
  manual: ESTADOS_DE_EVENTO_PROPIO,
  finanzas: ESTADOS_DE_DEUDA,
  contactos: ESTADOS_DE_RECORDATORIO,
  tareas: ESTADOS_DE_EVENTO,
};

/** Los estados que ofrece el filtro de cada origen. */
export function estadosDeOrigen(origen: OrigenDeEvento): readonly EstadoParaFiltrar[] {
  return ESTADOS_DE_ORIGEN[origen];
}

/** Los estados que el filtro oculta mientras la persona no cambie nada: lo hecho y lo pasado. */
export const ESTADOS_OCULTOS_POR_DEFECTO: Readonly<
  Record<OrigenDeEvento, readonly EstadoParaFiltrar[]>
> = { manual: ["pasado"], finanzas: ["pagada"], contactos: ["pasado"], tareas: ["finalizada"] };

/**
 * El estado de un evento. Lo completado (también una deuda pagada) y lo fallido vienen del origen y están
 * finalizados; una tarea de un día anterior a `hoy` que no se hizo ni se dio por fallida está atrasada, y
 * una deuda cuyo límite ya pasó sin pagarse, también. Todo lo demás (también los manuales) es pendiente.
 */
export function estadoDeEvento(evento: EventoDeCalendario, hoy: string): EstadoDeEvento {
  if (evento.fallido || evento.completado) return "finalizada";
  if ((evento.origen === "tareas" || evento.origen === "finanzas") && evento.dia < hoy) {
    return "atrasada";
  }
  return "pendiente";
}

/**
 * El estado de un evento tal como lo filtra su origen: el de `estadoDeEvento` para las tareas; próximo o
 * pasado para los recordatorios (pasado es el que viene completado: su día ya pasó; el de hoy es próximo);
 * pendiente, atrasada o pagada para las deudas; y futuro o pasado para los eventos propios (el de hoy es
 * futuro: todavía no terminó el día).
 */
export function estadoParaFiltrar(evento: EventoDeCalendario, hoy: string): EstadoParaFiltrar {
  switch (evento.origen) {
    case "contactos":
      return evento.completado ? "pasado" : "proximo";
    case "manual":
      return evento.dia < hoy ? "pasado" : "futuro";
    case "finanzas": {
      const estado = estadoDeEvento(evento, hoy);
      return estado === "finalizada" ? "pagada" : estado;
    }
    case "tareas":
      return estadoDeEvento(evento, hoy);
  }
}

/** true si el evento ya pasó sin poder tildarse: un recordatorio o un evento propio de un día anterior. */
export function esEventoPasado(evento: EventoDeCalendario, hoy: string): boolean {
  const estado = estadoParaFiltrar(evento, hoy);
  return (evento.origen === "contactos" || evento.origen === "manual") && estado === "pasado";
}

/**
 * Lo que marca el punto de un origen en un día de la grilla. Manda lo que más pide atención: si hay algo
 * pendiente, "pendiente"; si no, pero hay algo atrasado, "atrasada". Con todo finalizado depende de cómo
 * terminó: "completada" si todo se completó, "fallida" si todo falló y "mixta" si hubo de las dos.
 */
export type MarcadorDeEstado =
  | "pendiente"
  | "atrasada"
  | "completada"
  | "fallida"
  | "mixta"
  | "pasado";

/**
 * El marcador de un conjunto de eventos (los de un origen en un día). Sin eventos, "pendiente". Los
 * recordatorios de Contactos y los eventos propios solo pueden ser próximos o pasados: con alguno
 * próximo, "pendiente"; con todos pasados, "pasado". Una deuda pagada cuenta como completada.
 */
export function marcadorDeEventos(
  eventos: readonly EventoDeCalendario[],
  hoy: string,
): MarcadorDeEstado {
  const soloPasan = eventos.every(
    (evento) => evento.origen === "contactos" || evento.origen === "manual",
  );
  if (eventos.length > 0 && soloPasan) {
    return eventos.every((evento) => esEventoPasado(evento, hoy)) ? "pasado" : "pendiente";
  }
  const estados = eventos.map((evento) => estadoDeEvento(evento, hoy));
  if (estados.includes("pendiente") || estados.length === 0) return "pendiente";
  if (estados.includes("atrasada")) return "atrasada";
  const fallidos = eventos.some((evento) => evento.fallido);
  const completados = eventos.some((evento) => !evento.fallido);
  if (fallidos && completados) return "mixta";
  return fallidos ? "fallida" : "completada";
}

/** Sin restricciones de origen ni de repetición, y con los estados por defecto: lo que se ve la primera vez. */
export function filtroSinRestricciones(): FiltroDeEventos {
  return {
    origenesOcultos: new Set(),
    repeticionesOcultas: { tareas: new Set(), contactos: new Set() },
    estadosOcultos: {
      manual: new Set(ESTADOS_OCULTOS_POR_DEFECTO.manual),
      finanzas: new Set(ESTADOS_OCULTOS_POR_DEFECTO.finanzas),
      contactos: new Set(ESTADOS_OCULTOS_POR_DEFECTO.contactos),
      tareas: new Set(ESTADOS_OCULTOS_POR_DEFECTO.tareas),
    },
  };
}

/** true si los estados ocultos de cada origen son los de la primera vez. */
export function estadosPorDefecto(filtro: FiltroDeEventos): boolean {
  return ORIGENES_DE_EVENTO.every((origen) => {
    const ocultos = filtro.estadosOcultos[origen];
    const porDefecto = ESTADOS_OCULTOS_POR_DEFECTO[origen];
    return ocultos.size === porDefecto.length && porDefecto.every((estado) => ocultos.has(estado));
  });
}

function esOrigenConRepeticion(origen: OrigenDeEvento): origen is OrigenConRepeticion {
  return (ORIGENES_CON_REPETICION as readonly OrigenDeEvento[]).includes(origen);
}

/** true si el evento se muestra con ese filtro. `hoy` hace falta para saber qué está atrasado o pasó. */
export function pasaElFiltro(
  evento: EventoDeCalendario,
  filtro: FiltroDeEventos,
  hoy: string,
): boolean {
  if (filtro.origenesOcultos.has(evento.origen)) return false;
  if (filtro.estadosOcultos[evento.origen].has(estadoParaFiltrar(evento, hoy))) return false;
  // Solo Tareas y Contactos tienen repetición; para otro origen no hay nada más que filtrar.
  if (!esOrigenConRepeticion(evento.origen)) return true;
  return (
    evento.repeticion === null || !filtro.repeticionesOcultas[evento.origen].has(evento.repeticion)
  );
}

/**
 * Cuántas restricciones tiene puestas el filtro, para avisarlo en el botón de filtros avanzados: las
 * repeticiones ocultas de los orígenes que siguen a la vista (las de un origen oculto entero no suman,
 * porque ya no se ven de ningún modo).
 */
export function cantidadDeRestriccionesPorRepeticion(filtro: FiltroDeEventos): number {
  return ORIGENES_CON_REPETICION.reduce(
    (suma, origen) =>
      suma + (filtro.origenesOcultos.has(origen) ? 0 : filtro.repeticionesOcultas[origen].size),
    0,
  );
}

/** true si algo está oculto: algún origen o alguna repetición. */
export function hayRestricciones(filtro: FiltroDeEventos): boolean {
  return (
    filtro.origenesOcultos.size > 0 ||
    ORIGENES_CON_REPETICION.some((origen) => filtro.repeticionesOcultas[origen].size > 0)
  );
}

/**
 * El orden en que se muestran los eventos: por día; en un mismo día primero lo de todo el día y
 * después por hora; con la misma hora, por origen (Finanzas, Contactos, Tareas y los manuales) y
 * por último por título.
 */
export function compararEventos(a: EventoDeCalendario, b: EventoDeCalendario): number {
  return (
    a.dia.localeCompare(b.dia) ||
    (a.hora ?? "").localeCompare(b.hora ?? "") ||
    ORDEN_DE_ORIGEN[a.origen] - ORDEN_DE_ORIGEN[b.origen] ||
    a.titulo.localeCompare(b.titulo, "es")
  );
}

const ORDEN_DE_ORIGEN: Record<OrigenDeEvento, number> = {
  finanzas: 0,
  contactos: 1,
  tareas: 2,
  manual: 3,
};
