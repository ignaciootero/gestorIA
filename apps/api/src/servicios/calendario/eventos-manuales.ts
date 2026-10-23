// Lógica de negocio de los eventos que la persona anota a mano en el calendario.
//
// Un evento es de un solo día, con hora opcional y notas. Se puede agregar a cualquier día del
// calendario, también a uno pasado (el calendario es además un registro de lo que pasó). Toda
// consulta filtra por `userId`, que sale siempre de la sesión: un evento de otra persona se trata
// como inexistente. Se borran lógicamente (`eliminadoEn`) y un job los borra en definitivo pasado
// un plazo (ver limpieza.ts).

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import {
  type DatosDeEventoDeCalendario,
  type EventoDeCalendario,
  MAXIMO_DE_EVENTOS_DE_CALENDARIO,
  type RangoDeEventos,
  recortarHora,
} from "@gestoria/shared";
import { and, count, eq, gte, isNull, lte } from "drizzle-orm";

/** La persona ya tiene el máximo de eventos. */
export class LimiteDeEventos extends Error {}

type FilaDeEvento = typeof esquema.eventosDeCalendario.$inferSelect;

const { eventosDeCalendario: eventos } = esquema;

export function aEventoManual(fila: FilaDeEvento): EventoDeCalendario {
  return {
    id: fila.id,
    origen: "manual",
    titulo: fila.titulo,
    // En los manuales, el detalle son las notas que escribió la persona.
    detalle: fila.notas,
    dia: fila.dia,
    hora: recortarHora(fila.hora),
    repeticion: null,
    completado: false,
    fallido: false,
  };
}

/** Los eventos manuales de la persona entre `desde` y `hasta`, ambos inclusive. */
export async function eventosManuales(
  cliente: ClienteDb,
  userId: string,
  rango: RangoDeEventos,
): Promise<EventoDeCalendario[]> {
  const filas = await cliente.db
    .select()
    .from(eventos)
    .where(
      and(
        eq(eventos.userId, userId),
        isNull(eventos.eliminadoEn),
        gte(eventos.dia, rango.desde),
        lte(eventos.dia, rango.hasta),
      ),
    );
  return filas.map(aEventoManual);
}

/** Agrega un evento. Lanza `LimiteDeEventos` si la persona ya tiene el máximo. */
export async function crearEventoManual(
  cliente: ClienteDb,
  userId: string,
  datos: DatosDeEventoDeCalendario,
): Promise<EventoDeCalendario> {
  const [existentes] = await cliente.db
    .select({ total: count() })
    .from(eventos)
    .where(and(eq(eventos.userId, userId), isNull(eventos.eliminadoEn)));
  if ((existentes?.total ?? 0) >= MAXIMO_DE_EVENTOS_DE_CALENDARIO) throw new LimiteDeEventos();

  const [fila] = await cliente.db
    .insert(eventos)
    .values({
      userId,
      titulo: datos.titulo,
      notas: datos.notas === "" ? null : datos.notas,
      dia: datos.fecha,
      hora: datos.hora === "" ? null : datos.hora,
    })
    .returning();
  if (!fila) throw new Error("No se pudo crear el evento.");
  return aEventoManual(fila);
}

/** Cambia un evento. Devuelve null si no existe, es de otra persona o está eliminado. */
export async function editarEventoManual(
  cliente: ClienteDb,
  userId: string,
  id: string,
  datos: DatosDeEventoDeCalendario,
): Promise<EventoDeCalendario | null> {
  const [fila] = await cliente.db
    .update(eventos)
    .set({
      titulo: datos.titulo,
      notas: datos.notas === "" ? null : datos.notas,
      dia: datos.fecha,
      hora: datos.hora === "" ? null : datos.hora,
    })
    .where(and(eq(eventos.id, id), eq(eventos.userId, userId), isNull(eventos.eliminadoEn)))
    .returning();
  return fila ? aEventoManual(fila) : null;
}

/** Borrado lógico. Devuelve false si no existe, es de otra persona o ya estaba eliminado. */
export async function eliminarEventoManual(
  cliente: ClienteDb,
  userId: string,
  id: string,
  ahora: Date = new Date(),
): Promise<boolean> {
  const filas = await cliente.db
    .update(eventos)
    .set({ eliminadoEn: ahora })
    .where(and(eq(eventos.id, id), eq(eventos.userId, userId), isNull(eventos.eliminadoEn)))
    .returning({ id: eventos.id });
  return filas.length > 0;
}
