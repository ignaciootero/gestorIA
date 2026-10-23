// Cuentas de calendario: qué días se dibujan en un mes, en qué semana del año cae un día, cómo
// se pasa de un mes a otro. Funciones puras sobre días de calendario ("AAAA-MM-DD") y meses
// ({ anio, mes }), sin zona horaria ni reloj: las usa la web para dibujar el calendario y se
// prueban sin navegador (ver contactos/fechas.ts para la aritmética de días).
//
// Las semanas empiezan el lunes (como en Uruguay) y el mes se dibuja siempre con seis semanas,
// así la grilla mide lo mismo todos los meses y no salta de alto al navegar.

import { NOMBRES_DE_MES } from "../contactos/constantes.ts";
import { armar, diaIsoDeLaSemana, diasDelMes, partesDe, sumarDias } from "../contactos/fechas.ts";

/** Un mes del calendario; `mes` va de 1 a 12. */
export type MesDeCalendario = { anio: number; mes: number };

export const SEMANAS_POR_MES = 6;
export const DIAS_POR_SEMANA = 7;

/** El mes al que pertenece un día. */
export function mesDe(dia: string): MesDeCalendario {
  const { anio, mes } = partesDe(dia);
  return { anio, mes };
}

/** El mes que está `cantidad` meses después (o antes, si es negativa). */
export function sumarMeses(mes: MesDeCalendario, cantidad: number): MesDeCalendario {
  const total = mes.anio * 12 + (mes.mes - 1) + cantidad;
  return { anio: Math.floor(total / 12), mes: (((total % 12) + 12) % 12) + 1 };
}

/** Cuántos meses hay de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function mesesEntre(desde: MesDeCalendario, hasta: MesDeCalendario): number {
  return (hasta.anio - desde.anio) * 12 + (hasta.mes - desde.mes);
}

export function esElMismoMes(a: MesDeCalendario, b: MesDeCalendario): boolean {
  return a.anio === b.anio && a.mes === b.mes;
}

/** El primer día de un mes: "2026-10-01". */
export function primerDiaDelMes(mes: MesDeCalendario): string {
  return armar(mes.anio, mes.mes, 1);
}

/**
 * Los días que se dibujan para un mes: seis semanas de lunes a domingo, con los días de los meses
 * vecinos completando la primera y la última fila.
 */
export function semanasDelMes(mes: MesDeCalendario): string[][] {
  const primero = primerDiaDelMes(mes);
  const lunes = sumarDias(primero, -(diaIsoDeLaSemana(primero) - 1));
  return Array.from({ length: SEMANAS_POR_MES }, (_, semana) =>
    Array.from({ length: DIAS_POR_SEMANA }, (_, dia) => sumarDias(lunes, semana * 7 + dia)),
  );
}

/** El mismo número de día, pero en otro mes; si ese mes no lo tiene (31 en abril), el último día. */
export function mismoDiaEnOtroMes(dia: string, mes: MesDeCalendario): string {
  const { dia: numero } = partesDe(dia);
  return armar(mes.anio, mes.mes, Math.min(numero, diasDelMes(mes.anio, mes.mes)));
}

/** El número de semana ISO (1 a 53) del día: la semana 1 es la que tiene el primer jueves del año. */
export function numeroDeSemana(dia: string): number {
  const { anio, mes, dia: numero } = partesDe(dia);
  // El jueves de la misma semana decide a qué año pertenece.
  const jueves = new Date(Date.UTC(anio, mes - 1, numero + (4 - diaIsoDeLaSemana(dia))));
  const inicioDelAnio = Date.UTC(jueves.getUTCFullYear(), 0, 1);
  return Math.floor((jueves.getTime() - inicioDelAnio) / 86_400_000 / 7) + 1;
}

/** "Octubre" (con mayúscula inicial). */
export function nombreDeMesDelCalendario(mes: number): string {
  const nombre = NOMBRES_DE_MES[mes - 1] ?? "";
  return nombre.charAt(0).toLocaleUpperCase("es") + nombre.slice(1);
}

/** "Octubre de 2026". */
export function nombreDelMesConAnio(mes: MesDeCalendario): string {
  return `${nombreDeMesDelCalendario(mes.mes)} de ${mes.anio}`;
}

/** "martes, 20 de octubre de 2026". */
export function describirDiaCompleto(dia: string): string {
  return new Intl.DateTimeFormat("es-UY", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dia}T00:00:00Z`));
}
