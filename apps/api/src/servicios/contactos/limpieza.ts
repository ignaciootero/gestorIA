// Limpieza periódica del módulo de contactos. La corre un job de pg-boss (ver
// apps/api/src/tareas/), pero vive acá como función común para que se pueda probar
// sin el programador y reutilizar desde un script.
//
// Hace tres cosas:
// 1. Pasa al histórico lo que ya ocurrió de los recordatorios (ver historial-de-recordatorios.ts).
//    Un recordatorio de una sola vez que pasó se da de baja ahí mismo (borrado lógico).
// 2. Borra en definitivo lo eliminado hace más de DIAS_ANTES_DE_BORRAR días (contactos
//    y recordatorios), como pide docs/guias/seguridad-y-datos.md. Borrar un contacto se
//    lleva sus teléfonos, correos, etiquetas y recordatorios (cascada).
// 3. Lo mismo con las deudas y pagos eliminados. Un contacto que tiene alguna deuda no se borra
//    en definitivo (ver más abajo).
//
// Las entradas del histórico no se borran solas: quedan hasta que la persona las elimina.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import { and, isNotNull, lt, sql } from "drizzle-orm";
import { generarHistorialDeTodos } from "./historial-de-recordatorios.ts";

/** Cuánto tiempo se puede deshacer un borrado antes de que sea definitivo. */
export const DIAS_ANTES_DE_BORRAR = 30;

const MS_POR_DIA = 86_400_000;

export type ResultadoDeLimpieza = {
  historialAgregado: number;
  contactosBorrados: number;
  recordatoriosBorrados: number;
  deudasBorradas: number;
  pagosBorrados: number;
};

export async function limpiarContactos(
  cliente: ClienteDb,
  ahora: Date = new Date(),
): Promise<ResultadoDeLimpieza> {
  // Primero el histórico: así los recordatorios de una sola vez que pasaron quedan dados de baja.
  const historialAgregado = await generarHistorialDeTodos(cliente, ahora);

  const limite = new Date(ahora.getTime() - DIAS_ANTES_DE_BORRAR * MS_POR_DIA);

  // Primero las deudas y pagos eliminados hace tiempo: así, un contacto que solo tenía esas
  // deudas queda libre para borrarse en este mismo pasaje.
  const pagos = await cliente.db
    .delete(esquema.pagosDeDeudas)
    .where(
      and(
        isNotNull(esquema.pagosDeDeudas.eliminadoEn),
        lt(esquema.pagosDeDeudas.eliminadoEn, limite),
      ),
    )
    .returning({ id: esquema.pagosDeDeudas.id });
  const deudas = await cliente.db
    .delete(esquema.deudas)
    .where(and(isNotNull(esquema.deudas.eliminadoEn), lt(esquema.deudas.eliminadoEn, limite)))
    .returning({ id: esquema.deudas.id });

  // Un contacto con deudas (pendientes o saldadas, vigentes) nunca se borra en definitivo: la deuda
  // seguiría apuntando a él. Se queda en la papelera hasta que la deuda se elimine y pase su plazo.
  const contactos = await cliente.db
    .delete(esquema.contactos)
    .where(
      and(
        isNotNull(esquema.contactos.eliminadoEn),
        lt(esquema.contactos.eliminadoEn, limite),
        sql`not exists (select 1 from ${esquema.deudas} where ${esquema.deudas.contactoId} = ${esquema.contactos.id})`,
      ),
    )
    .returning({ id: esquema.contactos.id });

  const recordatorios = await cliente.db
    .delete(esquema.recordatoriosDeContactos)
    .where(
      and(
        isNotNull(esquema.recordatoriosDeContactos.eliminadoEn),
        lt(esquema.recordatoriosDeContactos.eliminadoEn, limite),
      ),
    )
    .returning({ id: esquema.recordatoriosDeContactos.id });

  return {
    historialAgregado,
    contactosBorrados: contactos.length,
    recordatoriosBorrados: recordatorios.length,
    deudasBorradas: deudas.length,
    pagosBorrados: pagos.length,
  };
}
