// Fechas de calendario ("2026-10-20", sin hora ni zona) y cuándo cae un recordatorio.
//
// Un cumpleaños o "pagar el 10" no es un instante: es un día, el mismo en cualquier
// zona horaria. Por eso estas fechas viajan y se guardan como "AAAA-MM-DD" y toda la
// aritmética es sobre días enteros, con `Date.UTC` solo como calculadora (sin horario
// de verano ni zonas de por medio). La única zona que interviene es la de la persona,
// y solo para saber qué día es "hoy" (`diaDeHoy`).
//
// Funciones puras, sin acceso a la base ni al reloj (salvo el valor por defecto de
// `ahora` en `diaDeHoy`): las usa la API para decidir qué recordatorios mostrar y la
// web para escribir "en 3 días".

import { formatearFecha } from "../formato/fecha.ts";
import { NOMBRES_DE_DIA_EN_PLURAL, NOMBRES_DE_MES, type Repeticion } from "./constantes.ts";

const MS_POR_DIA = 86_400_000;
const FORMATO = /^(\d{4})-(\d{2})-(\d{2})$/;

export type Partes = { anio: number; mes: number; dia: number };

export function partesDe(dia: string): Partes {
  const coincidencia = FORMATO.exec(dia);
  if (!coincidencia) throw new Error(`Día de calendario inválido: ${dia}`);
  return {
    anio: Number(coincidencia[1]),
    mes: Number(coincidencia[2]),
    dia: Number(coincidencia[3]),
  };
}

export function armar(anio: number, mes: number, dia: number): string {
  return `${String(anio).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Cuántos días tiene el mes (1 a 12) de ese año. */
export function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** true si es un día que existe en el calendario ("2026-02-30" no). */
export function esDiaReal(dia: string): boolean {
  if (!FORMATO.test(dia)) return false;
  const { anio, mes, dia: numero } = partesDe(dia);
  return anio >= 1 && mes >= 1 && mes <= 12 && numero >= 1 && numero <= diasDelMes(anio, mes);
}

/** El día de hoy ("AAAA-MM-DD") en la zona horaria dada. */
export function diaDeHoy(zonaHoraria: string, ahora: Date = new Date()): string {
  // "en-CA" escribe la fecha como AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zonaHoraria,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

/**
 * El instante (UTC) en que, en la zona horaria dada, es `hora`:00 del día "AAAA-MM-DD". Sirve para
 * ubicar en el tiempo algo que solo se sabe por su día (por ejemplo, el movimiento de un pago que
 * se anotó con una fecha pasada): al mediodía, el día es ese en cualquier zona razonable.
 */
export function instanteDelDia(dia: string, zonaHoraria: string, hora = 12): Date {
  const { anio, mes, dia: numero } = partesDe(dia);
  const pretendido = Date.UTC(anio, mes - 1, numero, hora);

  /** Cuánto se adelanta la zona respecto de UTC en ese instante, en milisegundos. */
  const desfase = (instante: number): number => {
    const partes = new Intl.DateTimeFormat("en-US", {
      timeZone: zonaHoraria,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    }).formatToParts(new Date(instante));
    const valor = (tipo: string) => Number(partes.find((parte) => parte.type === tipo)?.value);
    return (
      Date.UTC(
        valor("year"),
        valor("month") - 1,
        valor("day"),
        valor("hour"),
        valor("minute"),
        valor("second"),
      ) - instante
    );
  };

  // Dos pasadas: la segunda corrige el caso en que el cambio de hora cae entre el pretendido y el real.
  const primero = pretendido - desfase(pretendido);
  return new Date(pretendido - desfase(primero));
}

function numeroDeDia(dia: string): number {
  const { anio, mes, dia: numero } = partesDe(dia);
  return Date.UTC(anio, mes - 1, numero) / MS_POR_DIA;
}

/** Cuántos días hay de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function diasEntre(desde: string, hasta: string): number {
  return numeroDeDia(hasta) - numeroDeDia(desde);
}

/** El día que está `dias` días después (o antes, si es negativo). */
export function sumarDias(dia: string, dias: number): string {
  const { anio, mes, dia: numero } = partesDe(dia);
  const resultado = new Date(Date.UTC(anio, mes - 1, numero + dias));
  return armar(resultado.getUTCFullYear(), resultado.getUTCMonth() + 1, resultado.getUTCDate());
}

/** Cuándo cae un recordatorio. Cada repetición usa solo sus campos; el resto va en nulo. */
export type CuandoCae = {
  repeticion: Repeticion;
  /** Solo "unica": el día. */
  fecha: string | null;
  /** Solo "semanal": 1 es lunes y 7 es domingo. */
  diaSemana: number | null;
  /** "mensual" y "anual": 1 a 31. */
  diaDelMes: number | null;
  /** Solo "anual": 1 a 12. */
  mes: number | null;
};

/** El día de la semana de un día de calendario: 1 es lunes y 7 es domingo. */
export function diaIsoDeLaSemana(dia: string): number {
  const { anio, mes, dia: numero } = partesDe(dia);
  const diaJs = new Date(Date.UTC(anio, mes - 1, numero)).getUTCDay();
  return diaJs === 0 ? 7 : diaJs;
}

/**
 * El primer día en que cae el recordatorio, desde `desde` inclusive. Para uno de una sola
 * vez que ya pasó es null.
 *
 * - única: el día.
 * - diaria: todos los días, así que es `desde`.
 * - semanal: el próximo día de la semana pedido.
 * - mensual: el día del mes pedido; si el mes no lo tiene (el 31 en abril), el último día.
 * - anual: ese día de ese mes; un 29 de febrero cae el 28 en los años comunes.
 */
export function proximaOcurrencia(cuando: CuandoCae, desde: string): string | null {
  const { repeticion, fecha, diaSemana, diaDelMes, mes } = cuando;

  if (repeticion === "unica") return fecha !== null && fecha >= desde ? fecha : null;
  if (repeticion === "diaria") return desde;

  if (repeticion === "semanal") {
    if (diaSemana === null) return null;
    const faltan = (diaSemana - diaIsoDeLaSemana(desde) + 7) % 7;
    return sumarDias(desde, faltan);
  }

  if (diaDelMes === null) return null;
  const actual = partesDe(desde);

  if (repeticion === "mensual") {
    const candidato = armar(
      actual.anio,
      actual.mes,
      Math.min(diaDelMes, diasDelMes(actual.anio, actual.mes)),
    );
    if (candidato >= desde) return candidato;
    const siguienteMes = actual.mes === 12 ? 1 : actual.mes + 1;
    const siguienteAnio = actual.mes === 12 ? actual.anio + 1 : actual.anio;
    return armar(
      siguienteAnio,
      siguienteMes,
      Math.min(diaDelMes, diasDelMes(siguienteAnio, siguienteMes)),
    );
  }

  // anual
  if (mes === null) return null;
  const candidato = armar(actual.anio, mes, Math.min(diaDelMes, diasDelMes(actual.anio, mes)));
  if (candidato >= desde) return candidato;
  return armar(actual.anio + 1, mes, Math.min(diaDelMes, diasDelMes(actual.anio + 1, mes)));
}

/**
 * true si lo que se repite (todos los días, cada lunes, el día 15...) cae justo en ese día.
 * Es la pregunta que se hace el módulo de tareas para saber si le toca una tarea repetitiva a cada día.
 */
export function caeEnElDia(cuando: CuandoCae, dia: string): boolean {
  return proximaOcurrencia(cuando, dia) === dia;
}

/** Cuántos años cumple una persona nacida en `nacimiento` en el año de `dia`. */
export function edadQueCumple(nacimiento: string, dia: string): number {
  return partesDe(dia).anio - partesDe(nacimiento).anio;
}

/** "20/10/2026". Sin zona horaria de por medio: el día es el que es. */
export function formatearDiaDeCalendario(dia: string): string {
  return formatearFecha(`${dia}T00:00:00Z`, "UTC");
}

/** "20 de octubre" (sin año), para cumpleaños y fechas que se repiten. */
export function formatearDiaYMes(dia: string): string {
  return new Intl.DateTimeFormat("es-UY", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${dia}T00:00:00Z`));
}

/** "hoy", "mañana", "en 3 días". */
export function describirDiasRestantes(dias: number): string {
  if (dias === 0) return "hoy";
  if (dias === 1) return "mañana";
  return `en ${dias} días`;
}

/** "08:30" para una hora que viene con segundos ("08:30:00"); `null` si no hay hora. */
export function recortarHora(hora: string | null): string | null {
  return hora === null ? null : hora.slice(0, 5);
}

/**
 * Cuándo se repite un recordatorio, en palabras: "El 20/10/2026", "Todos los días a las
 * 08:00", "Todos los lunes", "El día 15 de cada mes", "Cada 12 de mayo". La hora, si la hay,
 * se agrega al final.
 */
export function describirProgramacion(cuando: CuandoCae, hora: string | null): string {
  const aLas = hora === null ? "" : ` a las ${hora.slice(0, 5)}`;

  switch (cuando.repeticion) {
    case "unica":
      return `El ${cuando.fecha === null ? "" : formatearDiaDeCalendario(cuando.fecha)}${aLas}`;
    case "diaria":
      return `Todos los días${aLas}`;
    case "semanal":
      return `Todos los ${NOMBRES_DE_DIA_EN_PLURAL[(cuando.diaSemana ?? 1) - 1]}${aLas}`;
    case "mensual":
      return `El día ${cuando.diaDelMes} de cada mes${aLas}`;
    case "anual":
      return `Cada ${cuando.diaDelMes} de ${NOMBRES_DE_MES[(cuando.mes ?? 1) - 1]}${aLas}`;
  }
}
