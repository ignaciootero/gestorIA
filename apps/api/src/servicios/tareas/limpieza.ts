// Limpieza periódica del módulo de tareas. La corre el mismo job de pg-boss que la de contactos
// (apps/api/src/tareas/programador.ts), pero vive acá como función común para que se pueda probar
// sin el programador.
//
// Hace dos cosas:
// 1. Borra en definitivo lo eliminado hace más de DIAS_ANTES_DE_BORRAR días (tareas y
//    repetitivas), como pide docs/guias/seguridad-y-datos.md.
// 2. Borra el historial más viejo que DIAS_DE_HISTORIAL_DE_TAREAS: las tareas hechas y las
//    repetitivas que quedaron sin hacer. Una tarea suelta que sigue pendiente no se borra nunca por
//    antigua: la persona todavía la tiene que hacer.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import { DIAS_DE_HISTORIAL_DE_TAREAS } from "@gestoria/shared";
import { and, isNotNull, lt, or } from "drizzle-orm";
import { DIAS_ANTES_DE_BORRAR } from "../contactos/limpieza.ts";

const MS_POR_DIA = 86_400_000;

export type ResultadoDeLimpiezaDeTareas = {
  tareasBorradas: number;
  repetitivasBorradas: number;
  historialBorrado: number;
};

export async function limpiarTareas(
  cliente: ClienteDb,
  ahora: Date = new Date(),
): Promise<ResultadoDeLimpiezaDeTareas> {
  const limite = new Date(ahora.getTime() - DIAS_ANTES_DE_BORRAR * MS_POR_DIA);
  // La fecha de corte del historial se compara como día de calendario (UTC): un día de más o de
  // menos en un historial de un año no importa.
  const corteDelHistorial = new Date(ahora.getTime() - DIAS_DE_HISTORIAL_DE_TAREAS * MS_POR_DIA)
    .toISOString()
    .slice(0, 10);

  const eliminadas = await cliente.db
    .delete(esquema.tareas)
    .where(and(isNotNull(esquema.tareas.eliminadoEn), lt(esquema.tareas.eliminadoEn, limite)))
    .returning({ id: esquema.tareas.id });

  const historial = await cliente.db
    .delete(esquema.tareas)
    .where(
      and(
        lt(esquema.tareas.dia, corteDelHistorial),
        or(
          isNotNull(esquema.tareas.completadaEn),
          isNotNull(esquema.tareas.falladaEn),
          isNotNull(esquema.tareas.repetitivaId),
        ),
      ),
    )
    .returning({ id: esquema.tareas.id });

  const repetitivas = await cliente.db
    .delete(esquema.tareasRepetitivas)
    .where(
      and(
        isNotNull(esquema.tareasRepetitivas.eliminadoEn),
        lt(esquema.tareasRepetitivas.eliminadoEn, limite),
      ),
    )
    .returning({ id: esquema.tareasRepetitivas.id });

  return {
    tareasBorradas: eliminadas.length,
    repetitivasBorradas: repetitivas.length,
    historialBorrado: historial.length,
  };
}
