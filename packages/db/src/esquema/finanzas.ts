// Tablas del módulo de ingresos y gastos.
//
// Better Auth ya usa el nombre "cuentas" para las cuentas de proveedor
// (esquema/auth.ts), así que los medios de pago del usuario (efectivo, banco,
// tarjeta...) viven en "cuentas_financieras": mismo concepto cotidiano, nombre
// de tabla distinto para no chocar ni confundirse con la de auth.
//
// Una sola moneda por usuario (la de `usuarios.monedaPorDefecto`): ningún
// monto de acá guarda su propia moneda ni hay conversión (decisión registrada
// en docs/decisiones.md, que resuelve la nota de docs/guias/convenciones.md).
// Los montos se guardan en centésimos, enteros, nunca en punto flotante. Son
// `bigint` (modo "number": se leen como número de JavaScript, exacto hasta 2^53):
// un `integer` de 32 bits solo llega a unos 21 millones, y los topes de un importe
// (IMPORTE_MAXIMO en packages/shared) son mayores.
//
// `categorias` y `cuentas_financieras` se borran lógicamente (`eliminadoEn`):
// así un movimiento viejo nunca pierde la categoría o la cuenta con la que se
// cargó, aunque la persona ya la haya "eliminado" (solo se oculta de los
// selectores). `movimientos` también, porque son datos de usuario
// (docs/guias/seguridad-y-datos.md, Borrado y control de los datos).
// `presupuestos` se borra en duro: es una configuración vigente, no un
// historial que deshacer.
//
// `periodos` son los tramos de tiempo que abre y cierra la persona (no tienen
// por qué coincidir con un mes). Nunca se borran: cada movimiento pertenece a
// uno. Ver el comentario de la tabla para las reglas que garantiza la base.

import { relations, sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { usuarios } from "./auth.ts";

const creadoEn = timestamp({ withTimezone: true }).notNull().defaultNow();

export const periodos = pgTable(
  "periodos",
  {
    /**
     * Número interno, autogenerado y nunca mostrado: lo que referencian los
     * movimientos. El nombre es lo que ve y elige la persona, y puede cambiar
     * sin tocar ningún movimiento.
     */
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: text()
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    nombre: text().notNull(),
    /** Instante de apertura, incluido en el período. */
    aperturaEn: timestamp({ withTimezone: true }).notNull(),
    /**
     * Instante de cierre, no incluido en el período: el siguiente puede abrir
     * justo ahí sin solaparse. Nulo mientras el período está abierto.
     */
    cierreEn: timestamp({ withTimezone: true }),
    creadoEn,
  },
  (tabla) => [
    // Listar "mis períodos" del más nuevo al más viejo, y buscar el que
    // contiene un instante.
    index("periodos_usuario_apertura_idx").on(tabla.userId, tabla.aperturaEn),
    // El nombre es único por usuario, sin distinguir mayúsculas.
    uniqueIndex("periodos_usuario_nombre_unico").on(tabla.userId, sql`lower(${tabla.nombre})`),
    // Un solo período abierto por usuario a la vez.
    uniqueIndex("periodos_un_abierto_por_usuario")
      .on(tabla.userId)
      .where(sql`${tabla.cierreEn} is null`),
    check(
      "periodos_cierre_posterior_a_apertura",
      sql`${tabla.cierreEn} is null or ${tabla.cierreEn} > ${tabla.aperturaEn}`,
    ),
    // Que dos períodos del mismo usuario no se solapen NO lo garantiza la base:
    // lo valida el servicio (apps/api/src/servicios/finanzas/periodos.ts).
    // Una restricción de exclusión lo haría, pero exige la extensión
    // btree_gist; no vale sumarle esa dependencia a la base por esto.
  ],
);

export const categorias = pgTable(
  "categorias",
  {
    /** Número autogenerado que identifica a la categoría. El nombre es único por usuario, pero puede cambiar. */
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: text()
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    nombre: text().notNull(),
    /** "#rrggbb". Se usa para distinguir la categoría en movimientos y estadísticas. */
    color: text().notNull().default("#64748b"),
    /**
     * Categoría especial del sistema, identificada por este código y no por su
     * nombre (que la persona puede cambiar). Hoy solo existe "transferencia":
     * la que usan las transferencias entre cuentas. No se puede eliminar.
     */
    sistema: text(),
    eliminadoEn: timestamp({ withTimezone: true }),
    creadoEn,
  },
  (tabla) => [
    // Todas las pantallas del módulo listan "mis categorías activas".
    index("categorias_usuario_idx").on(tabla.userId),
    // El nombre es único por usuario (sin distinguir mayúsculas) entre las activas.
    uniqueIndex("categorias_usuario_nombre_unico")
      .on(tabla.userId, sql`lower(${tabla.nombre})`)
      .where(sql`${tabla.eliminadoEn} is null`),
    // Una sola categoría especial de cada tipo por usuario.
    uniqueIndex("categorias_usuario_sistema_unico")
      .on(tabla.userId, tabla.sistema)
      .where(sql`${tabla.sistema} is not null`),
    check(
      "categorias_sistema_valido",
      sql`${tabla.sistema} is null or ${tabla.sistema} in ('transferencia')`,
    ),
    check("categorias_color_valido", sql`${tabla.color} ~ '^#[0-9a-fA-F]{6}$'`),
  ],
);

export const cuentasFinancieras = pgTable(
  "cuentas_financieras",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    nombre: text().notNull(),
    /**
     * Punto de partida del saldo, fijado al crear la cuenta. El saldo mostrado
     * es este valor más la suma de ingresos, menos la de gastos, más los ajustes
     * manuales de la cuenta (calculado al leer, no cacheado, para que nunca se
     * desincronice de los movimientos reales). Después de crearla ya no se
     * edita: para decir "hoy tengo esto" se carga un ajuste, que queda en el
     * historial de la cuenta.
     */
    saldoInicialCentavos: bigint({ mode: "number" }).notNull().default(0),
    /**
     * Cuenta oculta: sigue existiendo (con su saldo e historial) pero no se
     * ofrece al cargar un movimiento nuevo. Es lo que se puede hacer con una
     * cuenta que ya tiene movimientos; eliminarla solo se permite sin ellos.
     */
    ocultaEn: timestamp({ withTimezone: true }),
    eliminadoEn: timestamp({ withTimezone: true }),
    creadoEn,
  },
  (tabla) => [index("cuentas_financieras_usuario_idx").on(tabla.userId)],
);

/**
 * Carga manual del saldo de una cuenta ("hoy tengo $X"). NO es un movimiento:
 * no pertenece a ningún período ni cuenta como ingreso o gasto. Guarda lo que la
 * persona indicó y la diferencia que eso significó respecto del saldo que la
 * cuenta tenía en ese momento; es parte del historial de la cuenta y nunca se
 * modifica ni se borra (es un registro de lo que pasó).
 */
export const ajustesDeSaldo = pgTable(
  "ajustes_de_saldo",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    cuentaFinancieraId: uuid()
      .notNull()
      .references(() => cuentasFinancieras.id),
    /** Cuándo se cargó (UTC). */
    fecha: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** El saldo que la persona dijo que tenía. Puede ser negativo (una deuda). */
    saldoIndicadoCentavos: bigint({ mode: "number" }).notNull(),
    /** Cuánto cambió el saldo por este ajuste (con signo). Lo que suma al saldo de la cuenta. */
    diferenciaCentavos: bigint({ mode: "number" }).notNull(),
  },
  (tabla) => [
    // El historial de una cuenta lista sus ajustes del más nuevo al más viejo.
    index("ajustes_de_saldo_cuenta_idx").on(tabla.userId, tabla.cuentaFinancieraId, tabla.fecha),
    // Un ajuste sin cambio no dice nada: el servicio lo rechaza antes.
    check("ajustes_de_saldo_con_diferencia", sql`${tabla.diferenciaCentavos} <> 0`),
  ],
);

export const movimientos = pgTable(
  "movimientos",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    /**
     * "ingreso" | "gasto" | "neutro". Ver TIPOS_MOVIMIENTO en @gestoria/shared.
     * "neutro" es una transferencia entre dos cuentas: ni ingreso ni gasto.
     */
    tipo: text().notNull(),
    /** Siempre positivo: el signo lo da `tipo` (y, en una transferencia, la cuenta). */
    importeCentavos: bigint({ mode: "number" }).notNull(),
    descripcion: text().notNull(),
    categoriaId: integer()
      .notNull()
      .references(() => categorias.id),
    /** La cuenta del movimiento; en una transferencia, la de origen (de donde sale la plata). */
    cuentaFinancieraId: uuid()
      .notNull()
      .references(() => cuentasFinancieras.id),
    /** Solo en una transferencia ("neutro"): la cuenta a la que llega la plata. */
    cuentaDestinoId: uuid().references(() => cuentasFinancieras.id),
    /**
     * Cuándo ocurrió el movimiento (fecha y hora, UTC como el resto del
     * sistema; `creadoEn` es cuándo se cargó, que puede ser mucho después).
     * De este instante se deduce el período: tiene que caer dentro de
     * [aperturaEn, cierreEn) del período al que pertenece.
     */
    fecha: timestamp({ withTimezone: true }).notNull(),
    /**
     * El período al que pertenece, uno solo. Lo fija el servicio a partir de
     * `fecha` al crear o editar, y lo vuelve a validar al cerrar un período
     * (no puede quedar ningún movimiento fuera de su rango).
     */
    periodoId: integer()
      .notNull()
      .references(() => periodos.id),
    eliminadoEn: timestamp({ withTimezone: true }),
    creadoEn,
  },
  (tabla) => [
    // El resumen mensual y el listado ordenan y filtran por fecha dentro del
    // usuario; es la consulta más frecuente del módulo.
    index("movimientos_usuario_fecha_idx").on(tabla.userId, tabla.fecha),
    // Resumen, presupuestos y estadísticas agregan siempre por período.
    index("movimientos_usuario_periodo_idx").on(tabla.userId, tabla.periodoId),
    index("movimientos_usuario_categoria_idx").on(tabla.userId, tabla.categoriaId),
    index("movimientos_usuario_cuenta_idx").on(tabla.userId, tabla.cuentaFinancieraId),
    index("movimientos_destino_idx").on(tabla.userId, tabla.cuentaDestinoId),
    check("movimientos_tipo_valido", sql`${tabla.tipo} in ('ingreso', 'gasto', 'neutro')`),
    check("movimientos_importe_positivo", sql`${tabla.importeCentavos} > 0`),
    // Una transferencia tiene cuenta de destino, y distinta de la de origen; el resto no.
    check(
      "movimientos_destino_solo_en_transferencias",
      sql`(${tabla.tipo} = 'neutro') = (${tabla.cuentaDestinoId} is not null)`,
    ),
    check(
      "movimientos_destino_distinto_del_origen",
      sql`${tabla.cuentaDestinoId} is null or ${tabla.cuentaDestinoId} <> ${tabla.cuentaFinancieraId}`,
    ),
  ],
);

export const presupuestos = pgTable(
  "presupuestos",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    categoriaId: integer()
      .notNull()
      .references(() => categorias.id, { onDelete: "cascade" }),
    montoCentavos: bigint({ mode: "number" }).notNull(),
    creadoEn,
    actualizadoEn: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabla) => [
    // Un presupuesto activo por categoría: fijarlo de nuevo actualiza el
    // mismo, no crea uno paralelo.
    uniqueIndex("presupuestos_usuario_categoria_unico").on(tabla.userId, tabla.categoriaId),
    check("presupuestos_monto_no_negativo", sql`${tabla.montoCentavos} >= 0`),
  ],
);

// Relaciones para `db.query.movimientos.findMany({ with: { categoria, cuentaFinanciera } })`:
// el listado de movimientos necesita el nombre de la categoría y la cuenta, y
// esto evita una consulta aparte por cada fila (docs/guias/rendimiento.md, N+1).
export const movimientosRelations = relations(movimientos, ({ one }) => ({
  categoria: one(categorias, { fields: [movimientos.categoriaId], references: [categorias.id] }),
  periodo: one(periodos, { fields: [movimientos.periodoId], references: [periodos.id] }),
  cuentaFinanciera: one(cuentasFinancieras, {
    fields: [movimientos.cuentaFinancieraId],
    references: [cuentasFinancieras.id],
    relationName: "cuentaDeOrigen",
  }),
  cuentaDestino: one(cuentasFinancieras, {
    fields: [movimientos.cuentaDestinoId],
    references: [cuentasFinancieras.id],
    relationName: "cuentaDeDestino",
  }),
}));
