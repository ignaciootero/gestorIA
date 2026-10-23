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
   * true si ya está hecho: una tarea tildada, o un recordatorio de Contactos cuyo día ya pasó (un
   * recordatorio no se tilda). Por defecto el filtro los oculta (ver `FiltroDeEventos.mostrarCompletados`);
   * Finanzas y los manuales siempre traen false.
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
 * Lo ya completado (tareas tildadas o fallidas, y recordatorios pasados) se oculta por defecto: el calendario sirve para ver lo que falta,
 * y un mes pasado lleno de tareas hechas lo taparía. `mostrarCompletados` lo vuelve a mostrar, y es lo
 * único que se guarda como "mostrar" y no como "ocultar", porque lo que se cambia es el valor por defecto.
 */
export type FiltroDeEventos = {
  origenesOcultos: ReadonlySet<OrigenDeEvento>;
  repeticionesOcultas: Readonly<Record<OrigenConRepeticion, ReadonlySet<RepeticionDeEvento>>>;
  mostrarCompletados: boolean;
};

/** Sin ninguna restricción: se ve todo. */
export function filtroSinRestricciones(): FiltroDeEventos {
  return {
    origenesOcultos: new Set(),
    repeticionesOcultas: { tareas: new Set(), contactos: new Set() },
    mostrarCompletados: false,
  };
}

/** true si el evento se muestra con ese filtro. */
export function pasaElFiltro(evento: EventoDeCalendario, filtro: FiltroDeEventos): boolean {
  if (filtro.origenesOcultos.has(evento.origen)) return false;
  if ((evento.completado || evento.fallido) && !filtro.mostrarCompletados) return false;
  if (evento.repeticion === null) return true;
  // Solo Tareas y Contactos tienen repetición; para otro origen no hay nada que filtrar.
  const ocultas = (
    filtro.repeticionesOcultas as Readonly<
      Record<string, ReadonlySet<RepeticionDeEvento> | undefined>
    >
  )[evento.origen];
  return !ocultas?.has(evento.repeticion);
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
