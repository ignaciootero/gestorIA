// El filtro del calendario que versiones anteriores guardaban en este navegador (`localStorage`). Ahora
// el filtro se guarda en la cuenta (tabla `filtros_del_calendario`, ver usar-filtro-de-eventos.ts); esto
// queda solo para **traer lo que ya estaba elegido** la primera vez, sin que la persona tenga que volver
// a armarlo. Después de pasarlo a la cuenta, se borra de acá.
//
// Se guardaban los **ocultos**: qué orígenes, qué repeticiones de Tareas y Contactos y qué estados de cada
// origen. Un origen que falta (por ejemplo, porque se guardó antes de que tuviera estados) toma los de
// por defecto, y también se entienden los formatos más viejos (ver estadosDeLaListaAnterior).

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

/** Las claves que se usaban, para saber si hay algo que traer y para borrarlas después. */
const CLAVES = [CLAVE_DE_ORIGENES, CLAVE_DE_REPETICIONES, CLAVE_DE_ESTADOS];

function hayAlgoGuardado(): boolean {
  try {
    return CLAVES.some((clave) => localStorage.getItem(clave) !== null);
  } catch {
    return false;
  }
}

/**
 * El filtro que quedó guardado en este navegador, o null si no hay ninguno. Lo que no sirve (otra
 * versión, un valor dañado) se reemplaza por lo de por defecto.
 */
export function leerFiltroDelNavegador(): FiltroDeEventos | null {
  if (!hayAlgoGuardado()) return null;
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

/** Borra lo que quedó en este navegador, una vez que ya está en la cuenta. */
export function borrarFiltroDelNavegador(): void {
  try {
    for (const clave of CLAVES) localStorage.removeItem(clave);
  } catch {
    // Si no se puede borrar, la próxima vez la cuenta ya tiene su filtro y esto no se vuelve a leer.
  }
}
