// Limpieza periódica del módulo de calendario: borra en definitivo los eventos manuales que se
// eliminaron hace más de DIAS_ANTES_DE_BORRAR días (docs/guias/seguridad-y-datos.md). La corre el
// mismo job de pg-boss que las de contactos y tareas (apps/api/src/tareas/programador.ts); vive acá
// como función común para poder probarla sin el programador.
//
// Los eventos que ya pasaron NO se borran: son parte del registro de la persona.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import { and, isNotNull, lt } from "drizzle-orm";
import { DIAS_ANTES_DE_BORRAR } from "../contactos/limpieza.ts";

const MS_POR_DIA = 86_400_000;

export type ResultadoDeLimpiezaDelCalendario = { eventosBorrados: number };

export async function limpiarCalendario(
  cliente: ClienteDb,
  ahora: Date = new Date(),
): Promise<ResultadoDeLimpiezaDelCalendario> {
  const limite = new Date(ahora.getTime() - DIAS_ANTES_DE_BORRAR * MS_POR_DIA);
  const borrados = await cliente.db
    .delete(esquema.eventosDeCalendario)
    .where(
      and(
        isNotNull(esquema.eventosDeCalendario.eliminadoEn),
        lt(esquema.eventosDeCalendario.eliminadoEn, limite),
      ),
    )
    .returning({ id: esquema.eventosDeCalendario.id });
  return { eventosBorrados: borrados.length };
}
