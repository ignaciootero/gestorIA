// Preferencias del calendario que solo le importan a este navegador: qué orígenes de eventos se
// ocultan y, para Tareas y Contactos, qué repeticiones (diarias, semanales…). No es un dato que valga la
// pena guardar en el servidor, así que vive en `localStorage` (mismo criterio que preferencias-finanzas.ts).
//
// Además se guarda qué estados se ocultan de cada origen: de las tareas (pendiente, atrasada, finalizada;
// por defecto, las finalizadas), de los recordatorios (próximo, pasado; por defecto, los pasados), de las
// deudas de Finanzas (pendiente, atrasada, pagada; por defecto, las pagadas) y de los eventos propios
// (futuro, pasado; por defecto, los pasados). Un origen que no está guardado (por ejemplo, porque se
// guardó antes de que tuviera estados) toma los de por defecto.
//
// Se guardan los **ocultos** y no los visibles: si algún día se suma un origen o una repetición nuevos,
// aparecen visibles para todos sin tener que migrar nada.

import {
  ESTADOS_DE_EVENTO,
  type EstadoParaFiltrar,
  estadosDeOrigen,
  type FiltroDeEventos,
  filtroSinRestricciones,
  ORIGENES_CON_REPETICION,
  ORIGENES_DE_EVENTO,
  REPETICIONES_DE_EVENTO,
} from "@gestoria/shared";

const CLAVE_DE_ORIGENES = "gestoria:calendario:origenes-ocultos";
const CLAVE_DE_REPETICIONES = "gestoria:calendario:repeticiones-ocultas";
const CLAVE_DE_ESTADOS = "gestoria:calendario:estados-ocultos";

function leerJson(clave: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(clave) ?? "null");
  } catch {
    // Modo privado, almacenamiento bloqueado o valor dañado: se ve todo, como la primera vez.
    return null;
  }
}

/** Solo los valores que existen: lo que no sirve (otra versión, un valor dañado) se ignora. */
function soloLosValidos<T extends string>(valor: unknown, validos: readonly T[]): Set<T> {
  if (!Array.isArray(valor)) return new Set();
  return new Set(validos.filter((candidato) => valor.includes(candidato)));
}

/** Un objeto con una entrada por clave, o uno vacío si lo guardado no lo es. */
function comoObjeto(valor: unknown): Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

/**
 * Los estados ocultos guardados con el formato anterior: una sola lista para todo, de antes de que cada
 * origen tuviera los suyos. Valía para las tareas; los recordatorios pasados contaban como finalizados, así
 * que se ocultan si estaba oculto "finalizada". Y antes de eso "finalizada" eran dos estados, "completada" y
 * "fallida": si estaba oculto alguno, cuenta como "finalizada".
 */
function estadosDeLaListaAnterior(
  guardados: unknown[],
  porDefecto: FiltroDeEventos["estadosOcultos"],
): FiltroDeEventos["estadosOcultos"] {
  const tareas = soloLosValidos<EstadoParaFiltrar>(guardados, ESTADOS_DE_EVENTO);
  if (guardados.includes("completada") || guardados.includes("fallida")) tareas.add("finalizada");
  return {
    ...porDefecto,
    tareas,
    contactos: new Set<EstadoParaFiltrar>(tareas.has("finalizada") ? ["pasado"] : []),
  };
}

/**
 * Los estados ocultos guardados de cada origen. Una lista (aunque esté vacía) es una elección; un origen
 * que falta o cualquier otra cosa, los estados por defecto.
 */
function estadosGuardados(
  guardados: unknown,
  porDefecto: FiltroDeEventos["estadosOcultos"],
): FiltroDeEventos["estadosOcultos"] {
  if (Array.isArray(guardados)) return estadosDeLaListaAnterior(guardados, porDefecto);
  const porOrigen = comoObjeto(guardados);
  return Object.fromEntries(
    ORIGENES_DE_EVENTO.map((origen) => [
      origen,
      Array.isArray(porOrigen[origen])
        ? soloLosValidos(porOrigen[origen], estadosDeOrigen(origen))
        : porDefecto[origen],
    ]),
  ) as FiltroDeEventos["estadosOcultos"];
}

/** El filtro guardado en este navegador; sin restricciones si no hay nada o lo guardado no sirve. */
export function leerFiltroDeEventos(): FiltroDeEventos {
  const filtro = filtroSinRestricciones();
  const guardadas = comoObjeto(leerJson(CLAVE_DE_REPETICIONES));
  return {
    estadosOcultos: estadosGuardados(leerJson(CLAVE_DE_ESTADOS), filtro.estadosOcultos),
    origenesOcultos: soloLosValidos(leerJson(CLAVE_DE_ORIGENES), ORIGENES_DE_EVENTO),
    repeticionesOcultas: {
      ...filtro.repeticionesOcultas,
      ...Object.fromEntries(
        ORIGENES_CON_REPETICION.map((origen) => [
          origen,
          soloLosValidos(guardadas[origen], REPETICIONES_DE_EVENTO),
        ]),
      ),
    },
  };
}

/** Un objeto con la lista de cada origen: `{ tareas: [...], contactos: [...] }`. */
function porOrigen<O extends string>(
  origenes: readonly O[],
  conjuntos: Readonly<Record<O, ReadonlySet<string>>>,
): string {
  return JSON.stringify(
    Object.fromEntries(origenes.map((origen) => [origen, [...conjuntos[origen]]])),
  );
}

export function guardarFiltroDeEventos(filtro: FiltroDeEventos): void {
  try {
    localStorage.setItem(CLAVE_DE_ESTADOS, porOrigen(ORIGENES_DE_EVENTO, filtro.estadosOcultos));
    localStorage.setItem(CLAVE_DE_ORIGENES, JSON.stringify([...filtro.origenesOcultos]));
    localStorage.setItem(
      CLAVE_DE_REPETICIONES,
      porOrigen(ORIGENES_CON_REPETICION, filtro.repeticionesOcultas),
    );
  } catch {
    // No hay nada que recuperar: el filtro es una comodidad, no un dato.
  }
}
