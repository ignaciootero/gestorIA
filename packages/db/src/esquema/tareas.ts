// Tablas del módulo de tareas (la lista de to-do).
//
// Hay dos tablas con dos papeles distintos:
//
// - `tareas_repetitivas`: la regla ("todos los lunes", "el día 15 de cada mes"). No es algo que se
//   tilda: es de donde salen las tareas de cada día.
// - `tareas`: lo que de verdad aparece en la lista y se tilda. Son las tareas sueltas de uso único
//   (`repetitiva_id` en nulo) y las que genera cada tarea repetitiva para cada día que le toca.
//   Cada una lleva su día, su título y si se completó: así el historial de días pasados es
//   simplemente "las tareas de ese día", y sigue siendo fiel aunque después se cambie o se elimine
//   la regla que las originó (por eso se copia el título en vez de leerlo de la regla).
//
// Las repetitivas guardan cuándo caen (día de la semana, del mes...) y no la próxima fecha, igual
// que los recordatorios de contactos. `desde` es el primer día en que pueden aparecer (el día en
// que se crearon, para que una tarea nueva no invente un pasado) y `generada_hasta` el último día
// para el que ya se armaron sus tareas, así armar los días que faltan es barato.
//
// Las dos pueden tener una categoría (`categorias_de_tareas`, opcional): la repetitiva la guarda y la
// copia a cada tarea que arma, igual que el título. Las categorías son configuración vigente: se
// borran en duro, y las tareas que ya estaban hechas pasan a "sin categoría" (`on delete set null`);
// el servicio no deja borrar una que todavía tenga tareas pendientes o repetitivas.
//
// Las dos se borran lógicamente (`eliminado_en`, docs/guias/seguridad-y-datos.md) y un job las borra
// en definitivo pasado un plazo. Las fechas sin hora son `date` ("AAAA-MM-DD"); la hora, opcional,
// es de reloj de la persona (sin zona).

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { usuarios } from "./auth.ts";

const creadoEn = timestamp({ withTimezone: true }).notNull().defaultNow();

export const categoriasDeTareas = pgTable(
  "categorias_de_tareas",
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
    uniqueIndex("categorias_de_tareas_usuario_nombre_unico").on(
      tabla.userId,
      sql`lower(${tabla.nombre})`,
    ),
    check("categorias_de_tareas_color_valido", sql`${tabla.color} ~ '^#[0-9a-fA-F]{6}$'`),
  ],
);

export const tareasRepetitivas = pgTable(
  "tareas_repetitivas",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    titulo: text().notNull(),
    notas: text(),
    /** La categoría, si tiene. Las tareas que arma la copian. */
    categoriaId: integer().references(() => categoriasDeTareas.id, { onDelete: "set null" }),
    /** "diaria" | "intervalo" | "semanal" | "mensual" | "anual". Ver REPETICIONES_DE_TAREA en @gestoria/shared. */
    repeticion: text().notNull(),
    // Cada repetición usa solo lo suyo (los `check` de abajo lo garantizan; lo demás queda en nulo):
    //   diaria   → nada
    //   intervalo → cadaDias y fechaInicio
    //   semanal  → diasSemana (uno o varios días)
    //   mensual  → diaDelMes
    //   anual    → diaDelMes y mes
    /** Los días de la semana en que cae, de 1 (lunes) a 7 (domingo), ISO. Uno o varios, sin repetir. */
    diasSemana: smallint().array(),
    /** 1 a 31. Si el mes no tiene ese día, cae el último día del mes. */
    diaDelMes: smallint(),
    /** 1 a 12. */
    mes: smallint(),
    /** Solo "intervalo": cada cuántos días (2 es día por medio). */
    cadaDias: smallint(),
    /** Solo "intervalo": el día en que arranca el ciclo; de ahí se cuenta de `cada_dias` en `cada_dias`. */
    fechaInicio: date({ mode: "string" }),
    /** "HH:MM:SS" (la base lo devuelve con segundos). En nulo es "todo el día". */
    hora: time(),
    /** El primer día en que puede aparecer: el día en que se creó. "AAAA-MM-DD". */
    desde: date({ mode: "string" }).notNull(),
    /**
     * Si las tareas que arma se dan por fallidas solas cuando pasa su día sin completarse (en vez de
     * quedar como atrasadas). Cada tarea armada copia este valor.
     */
    fallaSola: boolean().notNull().default(false),
    /** Lleva un distintivo; no cambia el orden de las listas. */
    importante: boolean().notNull().default(false),
    /**
     * Si es progresiva, la meta de cada tarea que arma, en centésimos (2 litros → 200); en nulo, sus tareas
     * se tildan. Ver tareas/progreso.ts en @gestoria/shared.
     */
    metaCentesimos: integer(),
    /** La unidad de la meta ("litros"); solo si hay meta, y opcional. */
    unidad: text(),
    /** El último día para el que ya se armaron sus tareas; en nulo, ninguno todavía. */
    generadaHasta: date({ mode: "string" }),
    eliminadoEn: timestamp({ withTimezone: true }),
    creadoEn,
  },
  (tabla) => [
    // "Mis tareas repetitivas activas", y las que faltan armar.
    index("tareas_repetitivas_usuario_idx").on(tabla.userId, tabla.eliminadoEn),
    index("tareas_repetitivas_categoria_idx").on(tabla.categoriaId),
    check(
      "tareas_repetitivas_repeticion_valida",
      sql`${tabla.repeticion} in ('diaria', 'intervalo', 'semanal', 'mensual', 'anual')`,
    ),
    // Cada repetición lleva exactamente los campos que le corresponden.
    check(
      "tareas_repetitivas_campos_segun_repeticion",
      sql`(${tabla.repeticion} = 'diaria' and ${tabla.diasSemana} is null and ${tabla.diaDelMes} is null and ${tabla.mes} is null and ${tabla.cadaDias} is null and ${tabla.fechaInicio} is null)
        or (${tabla.repeticion} = 'intervalo' and ${tabla.cadaDias} between 2 and 365 and ${tabla.fechaInicio} is not null and ${tabla.diasSemana} is null and ${tabla.diaDelMes} is null and ${tabla.mes} is null)
        or (${tabla.repeticion} = 'semanal' and cardinality(${tabla.diasSemana}) between 1 and 7 and ${tabla.diaDelMes} is null and ${tabla.mes} is null and ${tabla.cadaDias} is null and ${tabla.fechaInicio} is null)
        or (${tabla.repeticion} = 'mensual' and ${tabla.diaDelMes} is not null and ${tabla.diasSemana} is null and ${tabla.mes} is null and ${tabla.cadaDias} is null and ${tabla.fechaInicio} is null)
        or (${tabla.repeticion} = 'anual' and ${tabla.diaDelMes} is not null and ${tabla.mes} is not null and ${tabla.diasSemana} is null and ${tabla.cadaDias} is null and ${tabla.fechaInicio} is null)`,
    ),
    check(
      "tareas_repetitivas_meta_valida",
      sql`(${tabla.metaCentesimos} is null and ${tabla.unidad} is null) or ${tabla.metaCentesimos} between 1 and 100000000`,
    ),
    check(
      "tareas_repetitivas_rangos",
      sql`(${tabla.diasSemana} is null or ${tabla.diasSemana} <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[])
        and (${tabla.diaDelMes} is null or ${tabla.diaDelMes} between 1 and 31)
        and (${tabla.mes} is null or ${tabla.mes} between 1 and 12)`,
    ),
  ],
);

export const tareas = pgTable(
  "tareas",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    /** De qué tarea repetitiva salió; en nulo si es una tarea suelta de uso único. */
    repetitivaId: uuid().references(() => tareasRepetitivas.id, { onDelete: "set null" }),
    titulo: text().notNull(),
    notas: text(),
    /** La categoría, si tiene. */
    categoriaId: integer().references(() => categoriasDeTareas.id, { onDelete: "set null" }),
    /** El día en que hay que hacerla. "AAAA-MM-DD". */
    dia: date({ mode: "string" }).notNull(),
    /** "HH:MM:SS". En nulo es "todo el día". */
    hora: time(),
    /** Cuándo se tildó; en nulo si no está completada. */
    completadaEn: timestamp({ withTimezone: true }),
    /**
     * Cuándo se marcó como fallida (una tarea atrasada que ya no se va a hacer); en nulo si no lo está.
     * Una tarea está pendiente si no está completada ni fallida; nunca las dos cosas a la vez.
     */
    falladaEn: timestamp({ withTimezone: true }),
    /**
     * Cuándo la persona la devolvió a pendiente (deshizo una fallida o destildó una completada); en nulo si
     * nunca. Reinicia la cuenta de la semana de atraso: pasada una semana como atrasada, la tarea se da por
     * fallida sola, y una que se revive vuelve a tener una semana desde ese momento.
     */
    reactivadaEn: timestamp({ withTimezone: true }),
    /**
     * Se da por fallida sola cuando pasa su día sin completarse (la copia de la repetitiva de la que salió).
     * Si la persona la devuelve a pendiente, se apaga para que no vuelva a fallar.
     */
    fallaSola: boolean().notNull().default(false),
    /** Lleva un distintivo; no cambia el orden de las listas. */
    importante: boolean().notNull().default(false),
    /**
     * Si es progresiva ("tomar 2 litros de agua"), la meta en centésimos (2 → 200); en nulo, se tilda.
     * Llegar a la meta la completa; ver tareas/progreso.ts en @gestoria/shared.
     */
    metaCentesimos: integer(),
    /** La unidad de la meta ("litros"); solo si hay meta, y opcional. */
    unidad: text(),
    /** Lo que lleva anotado, en centésimos (puede pasarse de la meta). Siempre 0 si no es progresiva. */
    progresoCentesimos: integer().notNull().default(0),
    eliminadoEn: timestamp({ withTimezone: true }),
    creadoEn,
  },
  (tabla) => [
    // "Las tareas de un día" y el historial, recorridos por día.
    index("tareas_usuario_dia_idx").on(tabla.userId, tabla.dia),
    // "Las tareas de esta categoría" (saber si se puede borrar y el set null al borrarla).
    index("tareas_categoria_idx").on(tabla.categoriaId),
    // "Lo pendiente": atrasadas, de hoy y de los próximos días.
    index("tareas_pendientes_idx")
      .on(tabla.userId, tabla.dia)
      .where(
        sql`${tabla.completadaEn} is null and ${tabla.falladaEn} is null and ${tabla.eliminadoEn} is null`,
      ),
    check(
      "tareas_meta_valida",
      sql`(${tabla.metaCentesimos} is null and ${tabla.unidad} is null and ${tabla.progresoCentesimos} = 0)
        or (${tabla.metaCentesimos} between 1 and 100000000 and ${tabla.progresoCentesimos} between 0 and 100000000)`,
    ),
    check(
      "tareas_completada_o_fallada",
      sql`not (${tabla.completadaEn} is not null and ${tabla.falladaEn} is not null)`,
    ),
    // Una tarea repetitiva arma como mucho una tarea por día: armar dos veces el mismo día (dos
    // pedidos a la vez) no duplica nada.
    uniqueIndex("tareas_una_por_repetitiva_y_dia")
      .on(tabla.repetitivaId, tabla.dia)
      .where(sql`${tabla.repetitivaId} is not null`),
  ],
);
