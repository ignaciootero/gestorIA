// Preferencias del calendario que solo le importan a este navegador: qué orígenes de eventos se
// ocultan y, para Tareas y Contactos, qué repeticiones (diarias, semanales…). No es un dato que valga la
// pena guardar en el servidor, así que vive en `localStorage` (mismo criterio que preferencias-finanzas.ts).
//
// Además se guarda qué estados se ocultan (pendiente, atrasada, finalizada); por defecto, los finalizados.
//
// Se guardan los **ocultos** y no los visibles: si algún día se suma un origen o una repetición nuevos,
// aparecen visibles para todos sin tener que migrar nada.

import {
  ESTADOS_DE_EVENTO,
  type EstadoDeEvento,
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

/**
 * Los estados ocultos guardados. Antes "finalizada" eran dos estados, "completada" y "fallida": si estaba
 * oculto alguno, se oculta "finalizada".
 */
function estadosGuardados(guardados: unknown[]): Set<EstadoDeEvento> {
  const estados = soloLosValidos(guardados, ESTADOS_DE_EVENTO);
  if (guardados.includes("completada") || guardados.includes("fallida")) estados.add("finalizada");
  return estados;
}

/** El filtro guardado en este navegador; sin restricciones si no hay nada o lo guardado no sirve. */
export function leerFiltroDeEventos(): FiltroDeEventos {
  const filtro = filtroSinRestricciones();
  const repeticiones = leerJson(CLAVE_DE_REPETICIONES);
  const estados = leerJson(CLAVE_DE_ESTADOS);
  const guardadas =
    typeof repeticiones === "object" && repeticiones !== null
      ? (repeticiones as Record<string, unknown>)
      : {};
  return {
    // Una lista (aunque esté vacía) es una elección; cualquier otra cosa, los estados por defecto.
    estadosOcultos: Array.isArray(estados) ? estadosGuardados(estados) : filtro.estadosOcultos,
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

export function guardarFiltroDeEventos(filtro: FiltroDeEventos): void {
  try {
    localStorage.setItem(CLAVE_DE_ESTADOS, JSON.stringify([...filtro.estadosOcultos]));
    localStorage.setItem(CLAVE_DE_ORIGENES, JSON.stringify([...filtro.origenesOcultos]));
    localStorage.setItem(
      CLAVE_DE_REPETICIONES,
      JSON.stringify(
        Object.fromEntries(
          ORIGENES_CON_REPETICION.map((origen) => [
            origen,
            [...filtro.repeticionesOcultas[origen]],
          ]),
        ),
      ),
    );
  } catch {
    // No hay nada que recuperar: el filtro es una comodidad, no un dato.
  }
}
