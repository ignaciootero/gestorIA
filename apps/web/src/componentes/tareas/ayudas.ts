// Ayudas del módulo de tareas: cómo cambia la lista de hoy al tildar una tarea (para actualizarla
// al instante, sin esperar al servidor) y cómo se escriben los días.

import {
  describirDiaCompleto,
  describirRepeticionDeTarea,
  diaDeHoy,
  diasEntre,
  formatearDiaDeCalendario,
  type ProgresoDeTarea,
  type RepeticionDeTarea,
} from "@gestoria/shared";
import type { ListaDeHoy, Tarea, TareaRepetitiva } from "@/lib/api-tareas";
import { zonaDelDispositivo } from "@/lib/preferencias-finanzas";

/** Primero lo de todo el día, después por hora; el mismo criterio que usa la API. */
function porDiaYHora(a: Tarea, b: Tarea): number {
  return a.dia.localeCompare(b.dia) || (a.hora ?? "").localeCompare(b.hora ?? "");
}

/**
 * La lista de hoy después de tildar (o destildar) una tarea. Es lo mismo que haría el servidor:
 * una tarea hecha pasa a "hechas hoy" (y deja de ser fallida, si lo era) y una destildada vuelve a
 * donde le corresponde por su día: las de días anteriores, a las atrasadas.
 */
export function conTareaCompletada(
  lista: ListaDeHoy,
  id: string,
  completada: boolean,
  ahora: Date,
): ListaDeHoy {
  const tarea = buscar(lista, id);
  if (!tarea) return lista;

  const actualizada: Tarea = {
    ...tarea,
    completada,
    completadaEn: completada ? ahora.toISOString() : null,
    fallida: false,
    falladaEn: null,
  };
  const resultado = sinLaTarea(lista, id);

  if (completada) {
    resultado.hechasHoy = [actualizada, ...resultado.hechasHoy];
  } else {
    return pendiente(resultado, actualizada);
  }
  return resultado;
}

/**
 * La lista de hoy después de marcar una atrasada como fallida (pasa a "fallidas hoy") o de volver a
 * dejarla pendiente (vuelve a las atrasadas).
 */
export function conTareaFallida(
  lista: ListaDeHoy,
  id: string,
  fallida: boolean,
  ahora: Date,
): ListaDeHoy {
  const tarea = buscar(lista, id);
  if (!tarea) return lista;

  const resultado = sinLaTarea(lista, id);
  if (!fallida) {
    return pendiente(resultado, { ...tarea, fallida: false, falladaEn: null });
  }
  const actualizada: Tarea = {
    ...tarea,
    completada: false,
    completadaEn: null,
    fallida: true,
    falladaEn: ahora.toISOString(),
  };
  resultado.falladasHoy = [actualizada, ...resultado.falladasHoy];
  return resultado;
}

/**
 * La lista de hoy después de anotar progreso en una tarea progresiva. Lo mismo que el servidor: el
 * progreso cambia y, si llega a la meta, pasa a "hechas hoy"; si se corrige por debajo, vuelve a pendiente.
 */
export function conProgreso(
  lista: ListaDeHoy,
  id: string,
  cambio: ProgresoDeTarea,
  ahora: Date,
): ListaDeHoy {
  const tarea = buscar(lista, id);
  if (!tarea || tarea.meta === null) return lista;
  // En centésimos, como el servidor, para que 0,1 + 0,2 dé 0,3.
  const centesimos =
    "sumar" in cambio
      ? Math.round(tarea.progreso * 100) + Math.round(cambio.sumar * 100)
      : Math.round(cambio.total * 100);
  const actualizada: Tarea = { ...tarea, progreso: centesimos / 100 };
  const conElProgreso = reemplazar(lista, actualizada);
  const llega = centesimos >= Math.round(tarea.meta * 100);
  if (llega === tarea.completada) return conElProgreso;
  return conTareaCompletada(conElProgreso, id, llega, ahora);
}

/** La lista con la tarea cambiada en su lugar. */
function reemplazar(lista: ListaDeHoy, tarea: Tarea): ListaDeHoy {
  const cambiar = (tareas: Tarea[]) =>
    tareas.map((otra) => (otra.id === tarea.id ? tarea : otra));
  return {
    ...lista,
    atrasadas: cambiar(lista.atrasadas),
    deHoy: cambiar(lista.deHoy),
    hechasHoy: cambiar(lista.hechasHoy),
    falladasHoy: cambiar(lista.falladasHoy),
    masAdelante: cambiar(lista.masAdelante),
  };
}

function buscar(lista: ListaDeHoy, id: string): Tarea | undefined {
  return [
    ...lista.atrasadas,
    ...lista.deHoy,
    ...lista.hechasHoy,
    ...lista.falladasHoy,
    ...lista.masAdelante,
  ].find((candidata) => candidata.id === id);
}

function sinLaTarea(lista: ListaDeHoy, id: string): ListaDeHoy {
  const sin = (tareas: Tarea[]) => tareas.filter((otra) => otra.id !== id);
  return {
    ...lista,
    atrasadas: sin(lista.atrasadas),
    deHoy: sin(lista.deHoy),
    hechasHoy: sin(lista.hechasHoy),
    falladasHoy: sin(lista.falladasHoy),
    masAdelante: sin(lista.masAdelante),
  };
}

/** Una tarea pendiente vuelve a donde le corresponde por su día. */
function pendiente(lista: ListaDeHoy, tarea: Tarea): ListaDeHoy {
  if (tarea.dia > lista.hoy) {
    return { ...lista, masAdelante: [...lista.masAdelante, tarea].sort(porDiaYHora) };
  }
  if (tarea.dia === lista.hoy) {
    return { ...lista, deHoy: [...lista.deHoy, tarea].sort(porDiaYHora) };
  }
  return { ...lista, atrasadas: [...lista.atrasadas, tarea].sort(porDiaYHora) };
}

/** "Hoy", "Ayer", "Mañana" o "martes, 20 de octubre" (con el año si no es el actual). */
export function nombreDeDia(dia: string, hoy = diaDeHoy(zonaDelDispositivo())): string {
  const dias = diasEntre(hoy, dia);
  if (dias === 0) return "Hoy";
  if (dias === -1) return "Ayer";
  if (dias === 1) return "Mañana";
  const completo = describirDiaCompleto(dia);
  const conMayuscula = completo.charAt(0).toLocaleUpperCase("es") + completo.slice(1);
  return dia.slice(0, 4) === hoy.slice(0, 4)
    ? conMayuscula.replace(/ de \d{4}$/, "")
    : conMayuscula;
}

/**
 * De qué día era una tarea de un día anterior, siempre con el día concreto: "el miércoles, 21 de octubre"
 * (con el año si no es el actual). Para decir "Era para el miércoles, 21 de octubre" aunque sea de ayer.
 */
export function diaDeOrigen(dia: string, hoy = diaDeHoy(zonaDelDispositivo())): string {
  const completo = describirDiaCompleto(dia);
  return `el ${dia.slice(0, 4) === hoy.slice(0, 4) ? completo.replace(/ de \d{4}$/, "") : completo}`;
}

/** "Todos los lunes a las 08:00", "El día 5 de cada mes"... para una tarea repetitiva. */
export function describirRepeticion(repetitiva: TareaRepetitiva): string {
  return describirRepeticionDeTarea(
    {
      repeticion: repetitiva.repeticion,
      diasSemana: repetitiva.diasSemana,
      diaDelMes: repetitiva.diaDelMes,
      mes: repetitiva.mes,
      cadaDias: repetitiva.cadaDias,
      fechaInicio: repetitiva.fechaInicio,
    },
    repetitiva.hora,
  );
}

/** Cómo se llama cada grupo de repetitivas y en qué orden se muestran, de lo más seguido a lo menos. */
export const GRUPOS_DE_REPETICION = [
  { valor: "diaria", titulo: "Diarias" },
  { valor: "intervalo", titulo: "Cada varios días" },
  { valor: "semanal", titulo: "Semanales" },
  { valor: "mensual", titulo: "Mensuales" },
  { valor: "anual", titulo: "Anuales" },
] as const;

export type FiltroDeRepeticion = "todas" | (typeof GRUPOS_DE_REPETICION)[number]["valor"];

/** Sin tildes ni mayúsculas, para que "pastilla" encuentre "Pastilla de la mañana". */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es");
}

/**
 * Las repetitivas que pasan el filtro y la búsqueda, ya agrupadas por periodicidad (los grupos sin
 * ninguna no se devuelven). Dentro de cada grupo, primero la que toca antes y, a igual día, por hora.
 */
export function agruparRepetitivas(
  repetitivas: TareaRepetitiva[],
  filtro: FiltroDeRepeticion,
  busqueda: string,
): { valor: RepeticionDeTarea; titulo: string; repetitivas: TareaRepetitiva[] }[] {
  const texto = normalizar(busqueda.trim());
  const visibles = repetitivas.filter(
    (repetitiva) =>
      (filtro === "todas" || repetitiva.repeticion === filtro) &&
      (texto === "" ||
        normalizar(`${repetitiva.titulo} ${repetitiva.notas ?? ""}`).includes(texto)),
  );
  return GRUPOS_DE_REPETICION.map((grupo) => ({
    ...grupo,
    repetitivas: visibles
      .filter((repetitiva) => repetitiva.repeticion === grupo.valor)
      .sort(
        (a, b) =>
          a.diasRestantes - b.diasRestantes ||
          (a.hora ?? "").localeCompare(b.hora ?? "") ||
          a.titulo.localeCompare(b.titulo, "es"),
      ),
  })).filter((grupo) => grupo.repetitivas.length > 0);
}

/** "15/10/2026". */
export function diaCorto(dia: string): string {
  return formatearDiaDeCalendario(dia);
}
