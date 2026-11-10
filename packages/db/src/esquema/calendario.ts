// Tablas del módulo de calendario: los eventos que la persona anota a mano y el filtro con el que
// mira el calendario.
//
// Lo que aparece en el calendario y viene de otros módulos (el vencimiento de una deuda, un
// recordatorio de un contacto, una tarea pendiente) NO se guarda acá: se arma al leer a partir de
// las tablas de cada módulo, así no hay copias que se desincronicen cuando cambia el original.
//
// Un evento es de un solo día, con hora opcional. El día es un `date` ("AAAA-MM-DD") y la hora es
// de reloj de la persona, sin zona (un evento "a las 15:00" es a las 15:00 de donde esté). Se borra
// lógicamente (`eliminado_en`, docs/guias/seguridad-y-datos.md) y un job lo borra en definitivo
// pasado un plazo.

import { date, index, jsonb, pgTable, text, time, timestamp, uuid } from "drizzle-orm/pg-core";
import { usuarios } from "./auth.ts";

export const eventosDeCalendario = pgTable(
  "eventos_de_calendario",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    titulo: text().notNull(),
    notas: text(),
    /** El día del evento. "AAAA-MM-DD". */
    dia: date({ mode: "string" }).notNull(),
    /** "HH:MM:SS" (la base lo devuelve con segundos). En nulo es "todo el día". */
    hora: time(),
    eliminadoEn: timestamp({ withTimezone: true }),
    creadoEn: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabla) => [
    // "Los eventos de estos días": el calendario pide siempre un rango de días.
    index("eventos_de_calendario_usuario_dia_idx").on(tabla.userId, tabla.dia),
    // El borrado definitivo de lo eliminado.
    index("eventos_de_calendario_eliminados_idx").on(tabla.eliminadoEn),
  ],
);

/**
 * El filtro del calendario de cada persona (qué orígenes, repeticiones y estados oculta), para que se
 * mantenga en cualquier dispositivo hasta que lo cambie. Una fila por persona; sin fila, el filtro por
 * defecto. Cada columna es una lista JSON de lo que se **oculta**, validada con `esquemaFiltroDeEventos`
 * (packages/shared) al guardar y al leer: lo que no está en la lista se ve, así un origen o un estado
 * nuevos aparecen visibles sin migrar nada.
 */
export const filtrosDelCalendario = pgTable("filtros_del_calendario", {
  userId: text()
    .primaryKey()
    .references(() => usuarios.id, { onDelete: "cascade" }),
  /** `["finanzas", …]`. */
  origenesOcultos: jsonb().notNull(),
  /** `{ "tareas": ["diaria", …], "contactos": […] }`. */
  repeticionesOcultas: jsonb().notNull(),
  /** `{ "manual": ["pasado"], "finanzas": ["pagada"], "contactos": […], "tareas": […] }`. */
  estadosOcultos: jsonb().notNull(),
  actualizadoEn: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
