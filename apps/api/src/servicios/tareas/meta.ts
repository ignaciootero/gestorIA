// La meta de una tarea progresiva (y su unidad), como se guarda en `tareas` y en `tareas_repetitivas`.
// Ver tareas/progreso.ts en @gestoria/shared.

import { aCentesimos } from "@gestoria/shared";

/**
 * La meta y la unidad para guardar. Sin `meta` (`undefined`, al editar) devuelve null: no se tocan. Con
 * `meta: null` la vuelve una tarea común. La unidad en blanco es sin unidad, y sin meta no hay unidad.
 */
export function columnasDeMeta(datos: {
  meta?: number | null | undefined;
  unidad?: string | undefined;
}): { metaCentesimos: number | null; unidad: string | null } | null {
  if (datos.meta === undefined) return null;
  if (datos.meta === null) return { metaCentesimos: null, unidad: null };
  const unidad = datos.unidad?.trim() ?? "";
  return { metaCentesimos: aCentesimos(datos.meta), unidad: unidad === "" ? null : unidad };
}
