// Tablas del módulo de ingresos y gastos.
//
// Better Auth ya usa el nombre "cuentas" para las cuentas de proveedor
// (esquema/auth.ts), así que los medios de pago del usuario (efectivo, banco,
// tarjeta...) viven en "cuentas_financieras": mismo concepto cotidiano, nombre
// de tabla distinto para no chocar ni confundirse con la de auth.
//
// Monedas: cada cuenta financiera tiene su moneda, y los importes de sus
// movimientos están en esa moneda. La moneda base de la persona es
// `usuarios.monedaPorDefecto` (pesos uruguayos por defecto): todo total, balance
// y estadística se expresa en ella. Por eso cada movimiento guarda además el tipo
// de cambio con que se convirtió y el importe ya convertido: el histórico no
// cambia cuando se mueve el dólar (docs/decisiones.md, 2026-10-03).
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
// `deudas` y `pagos_de_deudas` son un registro aparte de la plata que le deben a la persona o
// que ella debe a un contacto (módulo de contactos). NO mueven los saldos de las cuentas ni
// entran en los totales y estadísticas de los movimientos: si no, lo prestado contaría como un
// gasto y lo devuelto como un ingreso. Cuánto falta por pagar se calcula al leer (monto menos
// pagos), no se guarda.
//
// `periodos` son los tramos de tiempo que abre y cierra la persona (no tienen
// por qué coincidir con un mes). Nunca se borran: cada movimiento pertenece a
// uno. Ver el comentario de la tabla para las reglas que garantiza la base.

import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { usuarios } from "./auth.ts";
import { contactos } from "./contactos.ts";

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
     * Código ISO 4217 de la moneda de la cuenta ("UYU", "USD"...). No cambia una
     * vez que la cuenta tiene movimientos: sus importes están en esta moneda.
     */
    moneda: text().notNull(),
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
  (tabla) => [
    index("cuentas_financieras_usuario_idx").on(tabla.userId),
    check("cuentas_financieras_moneda_valida", sql`${tabla.moneda} ~ '^[A-Z]{3}$'`),
  ],
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
    /**
     * En la moneda de la cuenta (la de origen, en una transferencia). Siempre
     * positivo: el signo lo da `tipo` (y, en una transferencia, la cuenta).
     */
    importeCentavos: bigint({ mode: "number" }).notNull(),
    /**
     * Cuántas unidades de la moneda a la que se convierte vale 1 unidad de la de
     * la cuenta. En un ingreso o gasto, esa moneda es la base de la persona; en
     * una transferencia, la de la cuenta de destino. 1 si ambas son la misma.
     */
    tipoDeCambio: numeric({ precision: 20, scale: 8, mode: "number" }).notNull(),
    /**
     * `importeCentavos` ya convertido (ver `tipoDeCambio`): en un ingreso o gasto,
     * lo que se suma en los totales, presupuestos y estadísticas; en una
     * transferencia, lo que llega a la cuenta de destino. Se guarda, no se
     * recalcula, para que los totales históricos no cambien con el mercado.
     */
    importeConvertidoCentavos: bigint({ mode: "number" }).notNull(),
    /** La persona fijó la cotización (o el importe recibido) en vez de usar la de la fuente. */
    cambioManual: boolean().notNull().default(false),
    descripcion: text().notNull(),
    /**
     * Con quién fue (a quién se le pagó, de quién se cobró). Opcional y solo en ingresos y
     * gastos: una transferencia entre cuentas propias no tiene contraparte. Si el contacto se
     * borra en definitivo, el movimiento se queda sin esta referencia.
     */
    contactoId: uuid().references(() => contactos.id, { onDelete: "set null" }),
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
    // "Los movimientos con este contacto", en su ficha.
    index("movimientos_usuario_contacto_idx")
      .on(tabla.userId, tabla.contactoId)
      .where(sql`${tabla.contactoId} is not null`),
    index("movimientos_destino_idx").on(tabla.userId, tabla.cuentaDestinoId),
    // Una transferencia entre cuentas propias no tiene contacto.
    check(
      "movimientos_contacto_no_en_transferencias",
      sql`${tabla.contactoId} is null or ${tabla.tipo} <> 'neutro'`,
    ),
    check("movimientos_tipo_valido", sql`${tabla.tipo} in ('ingreso', 'gasto', 'neutro')`),
    check("movimientos_importe_positivo", sql`${tabla.importeCentavos} > 0`),
    check("movimientos_convertido_positivo", sql`${tabla.importeConvertidoCentavos} > 0`),
    check("movimientos_tipo_de_cambio_positivo", sql`${tabla.tipoDeCambio} > 0`),
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

/**
 * Cotizaciones de las monedas, traídas de la fuente pública y guardadas como
 * caché: cuántas unidades de cada moneda vale un dólar, para un día. Son datos de
 * mercado, iguales para todos: no llevan `userId`. El día "de hoy" se vuelve a
 * traer cuando se vence (ver servicios/finanzas/cotizaciones.ts); los pasados no
 * cambian.
 */
export const cotizaciones = pgTable(
  "cotizaciones",
  {
    /** El día pedido (UTC). */
    fecha: date({ mode: "string" }).notNull(),
    moneda: text().notNull(),
    /** Unidades de `moneda` por 1 USD. */
    unidadesPorDolar: numeric({ precision: 24, scale: 10, mode: "number" }).notNull(),
    /** El día al que corresponde el dato que devolvió la fuente (puede ser anterior al pedido). */
    fechaDeLaFuente: date({ mode: "string" }).notNull(),
    obtenidaEn: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabla) => [
    primaryKey({ columns: [tabla.fecha, tabla.moneda] }),
    check("cotizaciones_valor_positivo", sql`${tabla.unidadesPorDolar} > 0`),
  ],
);

export const deudas = pgTable(
  "deudas",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    /**
     * Con quién, cuando es un contacto. Sin `onDelete`: un contacto con deudas no se borra en
     * definitivo (la limpieza lo saltea) y una deuda nunca desaparece de golpe por borrar a alguien.
     * Es null si la deuda es con alguien que no está en los contactos (ver `nombreLibre`).
     */
    contactoId: uuid().references(() => contactos.id),
    /** Con quién, cuando no es un contacto: el nombre que escribió la persona. Es null si hay `contactoId`. */
    nombreLibre: text(),
    /** "me_deben" (la persona prestó o espera cobrar) | "debo" (ella debe pagar). */
    sentido: text().notNull(),
    concepto: text().notNull(),
    /** El total original, en centésimos de `moneda`. Siempre positivo. */
    montoCentavos: bigint({ mode: "number" }).notNull(),
    /** Código ISO 4217. Una deuda es en una sola moneda y no se convierte. */
    moneda: text().notNull(),
    /** El día en que se originó. "AAAA-MM-DD". */
    fecha: date({ mode: "string" }).notNull(),
    /** Hasta qué día debería saldarse ("AAAA-MM-DD"). Opcional; nunca anterior a `fecha`. */
    fechaLimite: date({ mode: "string" }),
    eliminadoEn: timestamp({ withTimezone: true }),
    creadoEn,
  },
  (tabla) => [
    index("deudas_usuario_idx").on(tabla.userId, tabla.eliminadoEn),
    index("deudas_contacto_idx").on(tabla.contactoId),
    // Una deuda es con un contacto o con un nombre escrito a mano, nunca con los dos ni con ninguno.
    check("deudas_con_quien", sql`num_nonnulls(${tabla.contactoId}, ${tabla.nombreLibre}) = 1`),
    check(
      "deudas_limite_no_anterior",
      sql`${tabla.fechaLimite} is null or ${tabla.fechaLimite} >= ${tabla.fecha}`,
    ),
    check("deudas_sentido_valido", sql`${tabla.sentido} in ('me_deben', 'debo')`),
    check("deudas_monto_positivo", sql`${tabla.montoCentavos} > 0`),
    check("deudas_moneda_valida", sql`${tabla.moneda} ~ '^[A-Z]{3}$'`),
  ],
);

/** Un pago (o cobro) parcial o total de una deuda. Nunca puede dejar el saldo en negativo: lo valida el servicio. */
export const pagosDeDeudas = pgTable(
  "pagos_de_deudas",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    deudaId: uuid()
      .notNull()
      .references(() => deudas.id, { onDelete: "cascade" }),
    montoCentavos: bigint({ mode: "number" }).notNull(),
    /** El día en que se pagó. "AAAA-MM-DD". */
    fecha: date({ mode: "string" }).notNull(),
    /**
     * El ingreso o gasto que se generó junto con este pago, si la persona lo pidió. Quitar el pago
     * elimina también ese movimiento; si el movimiento se borra en definitivo, esta referencia queda
     * en null (el pago no se pierde).
     */
    movimientoId: uuid().references(() => movimientos.id, { onDelete: "set null" }),
    eliminadoEn: timestamp({ withTimezone: true }),
    creadoEn,
  },
  (tabla) => [
    index("pagos_de_deudas_deuda_idx").on(tabla.deudaId),
    check("pagos_de_deudas_monto_positivo", sql`${tabla.montoCentavos} > 0`),
  ],
);

// Relaciones para `db.query.movimientos.findMany({ with: { categoria, cuentaFinanciera } })`:
// el listado de movimientos necesita el nombre de la categoría y la cuenta, y
// esto evita una consulta aparte por cada fila (docs/guias/rendimiento.md, N+1).
export const movimientosRelations = relations(movimientos, ({ one }) => ({
  categoria: one(categorias, { fields: [movimientos.categoriaId], references: [categorias.id] }),
  contacto: one(contactos, { fields: [movimientos.contactoId], references: [contactos.id] }),
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
