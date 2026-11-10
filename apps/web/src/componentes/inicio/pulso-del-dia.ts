// El "pulso del día": una frase debajo del saludo que junta lo más urgente de varios módulos, para
// saber de un vistazo cómo viene el día sin pasar por cada resumen. Por ejemplo:
// "Hoy tenés 2 tareas pendientes y 1 cosa en el calendario. Mañana cumple Ana."
//
// Es una función pura (sin React) para que sea fácil de leer y de cambiar: recibe solo números y
// nombres ya calculados por la pantalla de inicio.

import { plural } from "./piezas-de-resumen";

export type DatosDelPulso = {
  /** Las tareas de hoy que todavía no se hicieron. */
  tareasDeHoy: number;
  /** Lo pendiente de hoy en el calendario que no es una tarea (para no contarlas dos veces). */
  calendarioDeHoy: number;
  /** Los próximos cumpleaños: solo cuentan los de hoy y mañana. */
  cumpleanos: readonly { nombre: string; dias: number }[];
};

/** "Ana", "Ana y Juan", "Ana, Juan y Sofi". */
function enumerar(nombres: readonly string[]): string {
  if (nombres.length <= 1) return nombres.join("");
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

function cumpleanosDe(dias: number, datos: DatosDelPulso): string | null {
  const nombres = datos.cumpleanos.filter((uno) => uno.dias === dias).map((uno) => uno.nombre);
  if (nombres.length === 0) return null;
  const cuando = dias === 0 ? "Hoy" : "Mañana";
  return `${cuando} ${plural(nombres.length, "cumple", "cumplen")} ${enumerar(nombres)}.`;
}

export function armarPulso(datos: DatosDelPulso): string {
  const { tareasDeHoy: tareas, calendarioDeHoy: calendario } = datos;
  const partes = [
    tareas > 0 ? `${tareas} ${plural(tareas, "tarea pendiente", "tareas pendientes")}` : null,
    calendario > 0 ? `${calendario} ${plural(calendario, "cosa", "cosas")} en el calendario` : null,
  ].filter((parte) => parte !== null);

  const delDia =
    partes.length === 0
      ? "Hoy no tenés nada pendiente."
      : `Hoy tenés ${enumerar(partes)}.`;
  // Un cumpleaños hoy importa más que uno mañana: si hay de hoy, solo esos.
  const cumpleanos = cumpleanosDe(0, datos) ?? cumpleanosDe(1, datos);
  return cumpleanos ? `${delDia} ${cumpleanos}` : delDia;
}
