// Auditoria de acciones de admin (quien, que, a quien, cuando).
//
// No tiene FK obligatoria a proposito: `adminId` y `objetivoId` se ponen en
// null si la cuenta correspondiente se borra (`onDelete: "set null"`), para que
// el historial sobreviva a una baja en vez de desaparecer con ella
// (docs/guias/seguridad-y-datos.md, Borrado y control de los datos).

import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usuarios } from "./auth.ts";

export const auditoria = pgTable(
  "auditoria",
  {
    id: uuid().primaryKey().defaultRandom(),
    adminId: text().references(() => usuarios.id, { onDelete: "set null" }),
    /** Ver ACCIONES_AUDITORIA en @gestoria/shared. */
    accion: text().notNull(),
    objetivoId: text().references(() => usuarios.id, { onDelete: "set null" }),
    /** Contexto opcional (por ejemplo, el motivo de un bloqueo). Nunca un secreto. */
    detalle: text(),
    creadoEn: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabla) => [
    // El panel lista lo mas reciente primero.
    index("auditoria_creado_en_idx").on(tabla.creadoEn),
    // El perfil de una cuenta filtra su historial por objetivoId.
    index("auditoria_objetivo_idx").on(tabla.objetivoId),
  ],
);
