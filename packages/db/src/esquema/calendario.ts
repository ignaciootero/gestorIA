// Tabla del módulo de calendario: los eventos que la persona anota a mano.
//
// Lo que aparece en el calendario y viene de otros módulos (el vencimiento de una deuda, un
// recordatorio de un contacto, una tarea pendiente) NO se guarda acá: se arma al leer a partir de
// las tablas de cada módulo, así no hay copias que se desincronicen cuando cambia el original.
//
// Un evento es de un solo día, con hora opcional. El día es un `date` ("AAAA-MM-DD") y la hora es
// de reloj de la persona, sin zona (un evento "a las 15:00" es a las 15:00 de donde esté). Se borra
// lógicamente (`eliminado_en`, docs/guias/seguridad-y-datos.md) y un job lo borra en definitivo
// pasado un plazo.

import { date, index, pgTable, text, time, timestamp, uuid } from "drizzle-orm/pg-core";
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
