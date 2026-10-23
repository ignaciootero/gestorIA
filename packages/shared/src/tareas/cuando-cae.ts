// Cuándo cae una tarea repetitiva. Es lo mismo que los recordatorios de contactos
// (contactos/fechas.ts) con una diferencia: una semanal puede caer en varios días de la semana
// (lunes, martes y jueves), no en uno solo. Acá se resuelve eso y para el resto se reutiliza lo que
// ya existe.

import { NOMBRES_DE_DIA_EN_PLURAL } from "../contactos/constantes.ts";
import {
  type CuandoCae,
  describirProgramacion,
  diasEntre,
  proximaOcurrencia,
  sumarDias,
} from "../contactos/fechas.ts";
import type { RepeticionDeTarea } from "./constantes.ts";

export type CuandoCaeUnaTarea = {
  repeticion: RepeticionDeTarea;
  /** Solo "semanal": los días de la semana (1 es lunes y 7 es domingo), uno o varios. */
  diasSemana: readonly number[] | null;
  /** "mensual" y "anual": 1 a 31. */
  diaDelMes: number | null;
  /** Solo "anual": 1 a 12. */
  mes: number | null;
  /** Solo "intervalo": cada cuántos días (2 es día por medio). */
  cadaDias?: number | null | undefined;
  /** Solo "intervalo": el primer día; de ahí se cuenta de `cadaDias` en `cadaDias`. "AAAA-MM-DD". */
  fechaInicio?: string | null | undefined;
};

/** El mismo cuándo-cae de los recordatorios, para un solo día de la semana (no sirve para "intervalo"). */
function deUnDia(cuando: CuandoCaeUnaTarea, diaSemana: number | null): CuandoCae {
  return {
    repeticion: cuando.repeticion === "intervalo" ? "diaria" : cuando.repeticion,
    fecha: null,
    diaSemana,
    diaDelMes: cuando.diaDelMes,
    mes: cuando.mes,
  };
}

/** Los días de la semana sin repetir y de lunes a domingo. */
export function ordenarDiasDeLaSemana(dias: readonly number[]): number[] {
  return [...new Set(dias)].sort((a, b) => a - b);
}

/**
 * El primer día en que cae la tarea, desde `desde` inclusive. Una semanal de varios días es el más
 * cercano de todos. Solo es null si la regla está incompleta (una semanal sin ningún día).
 */
export function proximaOcurrenciaDeTarea(cuando: CuandoCaeUnaTarea, desde: string): string | null {
  if (cuando.repeticion === "intervalo") return proximoDelIntervalo(cuando, desde);
  if (cuando.repeticion !== "semanal") return proximaOcurrencia(deUnDia(cuando, null), desde);

  const candidatos = (cuando.diasSemana ?? []).flatMap((dia) => {
    const proxima = proximaOcurrencia(deUnDia(cuando, dia), desde);
    return proxima === null ? [] : [proxima];
  });
  return candidatos.length === 0 ? null : candidatos.reduce((a, b) => (b < a ? b : a));
}

/**
 * El primer día, desde `desde` inclusive, que cae en el ciclo de "cada N días" que arranca en
 * `fechaInicio`: antes del inicio, el propio inicio; después, el siguiente múltiplo de N días. Es null
 * si la regla está incompleta.
 */
function proximoDelIntervalo(cuando: CuandoCaeUnaTarea, desde: string): string | null {
  const { cadaDias, fechaInicio } = cuando;
  if (!cadaDias || cadaDias < 1 || !fechaInicio) return null;
  if (desde <= fechaInicio) return fechaInicio;
  const resto = diasEntre(fechaInicio, desde) % cadaDias;
  return resto === 0 ? desde : sumarDias(desde, cadaDias - resto);
}

/** true si la tarea repetitiva cae justo en ese día. */
export function caeEnElDiaDeTarea(cuando: CuandoCaeUnaTarea, dia: string): boolean {
  return proximaOcurrenciaDeTarea(cuando, dia) === dia;
}

/** "lunes", "lunes y martes", "lunes, martes y jueves". */
function enumerar(nombres: readonly string[]): string {
  if (nombres.length <= 1) return nombres.join("");
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/**
 * Cuándo se repite, en palabras: "Todos los días a las 08:00", "Todos los lunes, martes y jueves",
 * "El día 15 de cada mes", "Cada 12 de mayo", "Día por medio", "Cada 3 días". Una semanal con los siete
 * días es "Todos los días".
 */
export function describirRepeticionDeTarea(cuando: CuandoCaeUnaTarea, hora: string | null): string {
  if (cuando.repeticion === "intervalo") {
    const aLas = hora === null ? "" : ` a las ${hora.slice(0, 5)}`;
    return cuando.cadaDias === 2
      ? `Día por medio${aLas}`
      : `Cada ${cuando.cadaDias ?? "?"} días${aLas}`;
  }
  if (cuando.repeticion !== "semanal") return describirProgramacion(deUnDia(cuando, null), hora);

  const dias = ordenarDiasDeLaSemana(cuando.diasSemana ?? []);
  const aLas = hora === null ? "" : ` a las ${hora.slice(0, 5)}`;
  if (dias.length === 7) return `Todos los días${aLas}`;
  const nombres = dias.map((dia) => NOMBRES_DE_DIA_EN_PLURAL[dia - 1] ?? "");
  return `Todos los ${enumerar(nombres)}${aLas}`;
}
