// Tablas del módulo de contactos.
//
// Un contacto es una persona o una empresa/servicio (`tipo`). Las dos viven en la
// misma tabla porque comparten casi todo (nombre, teléfonos, correos, dirección,
// notas, etiquetas y recordatorios) y se listan, buscan y filtran juntas; los
// campos propios de cada tipo son columnas que el otro tipo deja en nulo, y la base
// lo garantiza con `check` (una empresa no puede tener fecha de nacimiento ni una
// persona, rubro).
//
// Teléfonos y correos son varios por contacto, así que van en tablas aparte (con su
// `orden`, para mostrarlos como la persona los cargó). No llevan `userId`: solo se
// leen a través de su contacto, que sí lo lleva y se filtra siempre.
//
// `contactos` y `recordatorios_de_contactos` se borran lógicamente (`eliminadoEn`,
// docs/guias/seguridad-y-datos.md) y un job los borra en definitivo pasado un plazo
// (apps/api/src/tareas/). Las etiquetas son configuración vigente: se borran en duro
// y se llevan consigo su vínculo con los contactos.
//
// Las fechas sin hora (nacimiento, fecha de un recordatorio) son `date` y viajan
// como "AAAA-MM-DD": "el 12 de mayo" es el mismo día en cualquier zona horaria, así
// que no se guardan como instante UTC (a diferencia de los movimientos).

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { usuarios } from "./auth.ts";

const creadoEn = timestamp({ withTimezone: true }).notNull().defaultNow();

export const contactos = pgTable(
  "contactos",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    /** "persona" | "empresa". Ver TIPOS_DE_CONTACTO en @gestoria/shared. No cambia una vez creado. */
    tipo: text().notNull(),
    /** El nombre de la persona o el de la empresa/servicio. */
    nombre: text().notNull(),
    // --- Solo personas ---
    apellido: text(),
    fechaNacimiento: date({ mode: "string" }),
    // --- Solo empresas y servicios ---
    /** Qué hace: "electricista", "banco", "veterinaria"... */
    rubro: text(),
    sitioWeb: text(),
    /** Texto libre: "Lunes a viernes de 9 a 18". */
    horario: text(),
    /** RUT u otro documento de identificación fiscal. */
    documento: text(),
    /** Con quién se habla en la empresa. */
    personaDeContacto: text(),
    // --- De los dos ---
    direccion: text(),
    notas: text(),
    favorito: boolean().notNull().default(false),
    eliminadoEn: timestamp({ withTimezone: true }),
    creadoEn,
    actualizadoEn: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabla) => [
    // El listado filtra por usuario y no eliminados; favoritos primero y después por nombre.
    index("contactos_usuario_idx").on(tabla.userId, tabla.eliminadoEn),
    // El borrado definitivo busca los eliminados hace más de X días.
    index("contactos_eliminados_idx")
      .on(tabla.eliminadoEn)
      .where(sql`${tabla.eliminadoEn} is not null`),
    check("contactos_tipo_valido", sql`${tabla.tipo} in ('persona', 'empresa')`),
    check(
      "contactos_campos_de_persona",
      sql`${tabla.tipo} = 'persona' or (${tabla.apellido} is null and ${tabla.fechaNacimiento} is null)`,
    ),
    check(
      "contactos_campos_de_empresa",
      sql`${tabla.tipo} = 'empresa' or (${tabla.rubro} is null and ${tabla.sitioWeb} is null and ${tabla.horario} is null and ${tabla.documento} is null and ${tabla.personaDeContacto} is null)`,
    ),
  ],
);

export const telefonosDeContactos = pgTable(
  "telefonos_de_contactos",
  {
    id: uuid().primaryKey().defaultRandom(),
    contactoId: uuid()
      .notNull()
      .references(() => contactos.id, { onDelete: "cascade" }),
    /** Como lo escribió la persona ("099 123 456", "+598 2 900 0000"). */
    numero: text().notNull(),
    /** "celular" | "fijo". */
    tipo: text().notNull(),
    orden: smallint().notNull().default(0),
  },
  (tabla) => [
    index("telefonos_de_contactos_contacto_idx").on(tabla.contactoId),
    check("telefonos_de_contactos_tipo_valido", sql`${tabla.tipo} in ('celular', 'fijo')`),
  ],
);

export const correosDeContactos = pgTable(
  "correos_de_contactos",
  {
    id: uuid().primaryKey().defaultRandom(),
    contactoId: uuid()
      .notNull()
      .references(() => contactos.id, { onDelete: "cascade" }),
    direccion: text().notNull(),
    orden: smallint().notNull().default(0),
  },
  (tabla) => [index("correos_de_contactos_contacto_idx").on(tabla.contactoId)],
);

export const etiquetasDeContactos = pgTable(
  "etiquetas_de_contactos",
  {
    /** Número interno autogenerado; el nombre es lo que ve la persona y puede cambiar. */
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: text()
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    nombre: text().notNull(),
    /** "#rrggbb". */
    color: text().notNull().default("#64748b"),
    creadoEn,
  },
  (tabla) => [
    // El nombre es único por usuario, sin distinguir mayúsculas.
    uniqueIndex("etiquetas_de_contactos_usuario_nombre_unico").on(
      tabla.userId,
      sql`lower(${tabla.nombre})`,
    ),
    check("etiquetas_de_contactos_color_valido", sql`${tabla.color} ~ '^#[0-9a-fA-F]{6}$'`),
  ],
);

/** Qué etiquetas tiene cada contacto (muchos a muchos). */
export const etiquetasPorContacto = pgTable(
  "etiquetas_por_contacto",
  {
    contactoId: uuid()
      .notNull()
      .references(() => contactos.id, { onDelete: "cascade" }),
    etiquetaId: integer()
      .notNull()
      .references(() => etiquetasDeContactos.id, { onDelete: "cascade" }),
  },
  (tabla) => [
    primaryKey({ columns: [tabla.contactoId, tabla.etiquetaId] }),
    // "Los contactos con esta etiqueta".
    index("etiquetas_por_contacto_etiqueta_idx").on(tabla.etiquetaId),
  ],
);

export const recordatoriosDeContactos = pgTable(
  "recordatorios_de_contactos",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    contactoId: uuid()
      .notNull()
      .references(() => contactos.id, { onDelete: "cascade" }),
    titulo: text().notNull(),
    /** "unica" | "diaria" | "semanal" | "mensual" | "anual". Ver REPETICIONES en @gestoria/shared. */
    repeticion: text().notNull(),
    // Cuándo ocurre depende de la repetición, y cada una usa solo lo suyo (los `check` de
    // abajo lo garantizan; lo demás queda en nulo):
    //   unica    → fecha
    //   diaria   → solo la hora (obligatoria)
    //   semanal  → diaSemana
    //   mensual  → diaDelMes
    //   anual    → diaDelMes y mes
    // La hora es opcional salvo en la diaria, y es la hora de reloj de la persona (sin zona).
    /** El día de un recordatorio de una sola vez. "AAAA-MM-DD". */
    fecha: date({ mode: "string" }),
    /** "HH:MM:SS" (la base lo devuelve con segundos). */
    hora: time(),
    /** 1 = lunes … 7 = domingo (ISO). */
    diaSemana: smallint(),
    /** 1 a 31. Si el mes no tiene ese día, el recordatorio cae el último día del mes. */
    diaDelMes: smallint(),
    /** 1 a 12. */
    mes: smallint(),
    /**
     * Hasta qué día (inclusive) ya se pasaron al histórico las veces que cayó, en uno que se repite.
     * Así nada se agrega dos veces y lo que la persona borra del histórico no vuelve.
     */
    historialHasta: date({ mode: "string" }).notNull().default(sql`(current_date - 1)`),
    /** Lleva un distintivo; no cambia el orden de las listas. */
    importante: boolean().notNull().default(false),
    eliminadoEn: timestamp({ withTimezone: true }),
    creadoEn,
  },
  (tabla) => [
    // "Mis recordatorios activos", y los de un contacto.
    index("recordatorios_de_contactos_usuario_idx").on(tabla.userId, tabla.eliminadoEn),
    index("recordatorios_de_contactos_contacto_idx").on(tabla.contactoId),
    // El job que borra los que ya pasaron y el borrado definitivo.
    index("recordatorios_de_contactos_unicos_idx")
      .on(tabla.fecha)
      .where(sql`${tabla.repeticion} = 'unica' and ${tabla.eliminadoEn} is null`),
    check(
      "recordatorios_de_contactos_repeticion_valida",
      sql`${tabla.repeticion} in ('unica', 'diaria', 'semanal', 'mensual', 'anual')`,
    ),
    // Cada repetición lleva exactamente los campos que le corresponden.
    check(
      "recordatorios_de_contactos_campos_segun_repeticion",
      sql`(${tabla.repeticion} = 'unica' and ${tabla.fecha} is not null and ${tabla.diaSemana} is null and ${tabla.diaDelMes} is null and ${tabla.mes} is null)
        or (${tabla.repeticion} = 'diaria' and ${tabla.hora} is not null and ${tabla.fecha} is null and ${tabla.diaSemana} is null and ${tabla.diaDelMes} is null and ${tabla.mes} is null)
        or (${tabla.repeticion} = 'semanal' and ${tabla.diaSemana} is not null and ${tabla.fecha} is null and ${tabla.diaDelMes} is null and ${tabla.mes} is null)
        or (${tabla.repeticion} = 'mensual' and ${tabla.diaDelMes} is not null and ${tabla.fecha} is null and ${tabla.diaSemana} is null and ${tabla.mes} is null)
        or (${tabla.repeticion} = 'anual' and ${tabla.diaDelMes} is not null and ${tabla.mes} is not null and ${tabla.fecha} is null and ${tabla.diaSemana} is null)`,
    ),
    check(
      "recordatorios_de_contactos_rangos",
      sql`(${tabla.diaSemana} is null or ${tabla.diaSemana} between 1 and 7)
        and (${tabla.diaDelMes} is null or ${tabla.diaDelMes} between 1 and 31)
        and (${tabla.mes} is null or ${tabla.mes} between 1 and 12)`,
    ),
  ],
);

/**
 * El histórico de los recordatorios: una fila por cada vez que uno cayó y su día ya pasó, también
 * en los que se repiten (el recordatorio principal sigue vivo; esto es lo que ocurrió). Guarda una
 * copia del título, la repetición y la hora, así sigue igual aunque el principal se edite o se
 * elimine. La persona puede eliminar filas sueltas o todo el histórico (borrado en duro: son datos
 * derivados, no hay nada que recuperar); no se vuelven a generar porque `historial_hasta` del
 * recordatorio ya pasó de ese día. `recordatorio_id` no es una clave foránea a propósito: el
 * histórico sobrevive a la eliminación del principal.
 */
export const historialDeRecordatorios = pgTable(
  "historial_de_recordatorios",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    contactoId: uuid()
      .notNull()
      .references(() => contactos.id, { onDelete: "cascade" }),
    recordatorioId: uuid().notNull(),
    titulo: text().notNull(),
    /** La repetición del recordatorio de origen: "unica" | "diaria" | "semanal" | "mensual" | "anual". */
    repeticion: text().notNull(),
    /** El día en que cayó. "AAAA-MM-DD". */
    dia: date({ mode: "string" }).notNull(),
    hora: time(),
    /** Si el recordatorio de origen era importante cuando cayó. */
    importante: boolean().notNull().default(false),
    creadoEn,
  },
  (tabla) => [
    // Una vez por recordatorio y día: generar dos veces no duplica.
    uniqueIndex("historial_de_recordatorios_unico_idx").on(tabla.recordatorioId, tabla.dia),
    // "Mi histórico, lo más reciente primero".
    index("historial_de_recordatorios_usuario_idx").on(tabla.userId, tabla.dia),
    index("historial_de_recordatorios_contacto_idx").on(tabla.contactoId),
    check(
      "historial_de_recordatorios_repeticion_valida",
      sql`${tabla.repeticion} in ('unica', 'diaria', 'semanal', 'mensual', 'anual')`,
    ),
  ],
);
