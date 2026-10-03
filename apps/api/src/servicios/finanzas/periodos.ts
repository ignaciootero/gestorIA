// Lógica de negocio de los períodos del módulo de ingresos y gastos.
//
// Un período es un tramo de tiempo que abre y cierra la persona, no un mes
// calendario. Cubre el intervalo [apertura, cierre): incluye el instante de
// apertura y no el de cierre, así el siguiente puede abrir justo cuando cierra
// el anterior sin solaparse. Reglas que se garantizan acá (y algunas también
// en la base, ver packages/db/src/esquema/finanzas.ts):
//
// - Un solo período abierto a la vez (`cierreEn` nulo).
// - Dos períodos no se solapan; sí pueden quedar huecos entre ellos.
// - Todo movimiento cae dentro del período al que pertenece: cerrar un período
//   no puede dejar movimientos por fuera.
// - Un período cerrado se puede reabrir si no hay otro abierto ni uno posterior
//   (reabrirlo le quitaría el cierre y pisaría al que sigue). Un período se
//   puede eliminar siempre: se llevan con él todos sus movimientos.
// - El nombre es único (sin distinguir mayúsculas). La identidad es el `id`
//   numérico, que la persona nunca ve, así que renombrar no afecta a nada.
//
// Como siempre, toda consulta filtra por `userId`, que sale de la sesión.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import { sugerirNombreDePeriodo } from "@gestoria/shared";
import { and, count, eq, gt, gte, isNull, lte, max, ne, or, sql } from "drizzle-orm";

export type Periodo = {
  id: number;
  nombre: string;
  aperturaEn: Date;
  /** Nulo mientras el período está abierto. */
  cierreEn: Date | null;
  abierto: boolean;
};

const COLUMNAS_PERIODO = { id: true, nombre: true, aperturaEn: true, cierreEn: true } as const;

/** Columnas de un período para `.returning()`, igual que COLUMNAS_PERIODO pero para el query builder. */
const COLUMNAS_A_DEVOLVER = {
  id: esquema.periodos.id,
  nombre: esquema.periodos.nombre,
  aperturaEn: esquema.periodos.aperturaEn,
  cierreEn: esquema.periodos.cierreEn,
};

function aPeriodo(fila: {
  id: number;
  nombre: string;
  aperturaEn: Date;
  cierreEn: Date | null;
}): Periodo {
  return { ...fila, abierto: fila.cierreEn === null };
}

export type PeriodoListado = Periodo & {
  /** Movimientos activos del período: lo que se perdería al eliminarlo. */
  cantidadMovimientos: number;
};

/** El más nuevo primero: es el orden en que se los quiere ver y elegir. */
export async function listarPeriodos(
  cliente: ClienteDb,
  userId: string,
): Promise<PeriodoListado[]> {
  const filas = await cliente.db.query.periodos.findMany({
    where: (tabla, { eq: eqCol }) => eqCol(tabla.userId, userId),
    columns: COLUMNAS_PERIODO,
    orderBy: (tabla, { desc: descCol }) => descCol(tabla.aperturaEn),
  });

  // Una sola consulta agrupada para todos los períodos (no una por período).
  const cantidades = await cliente.db
    .select({ periodoId: esquema.movimientos.periodoId, cantidad: count() })
    .from(esquema.movimientos)
    .where(and(eq(esquema.movimientos.userId, userId), isNull(esquema.movimientos.eliminadoEn)))
    .groupBy(esquema.movimientos.periodoId);
  const porPeriodo = new Map(cantidades.map((fila) => [fila.periodoId, fila.cantidad]));

  return filas.map((fila) => ({
    ...aPeriodo(fila),
    cantidadMovimientos: porPeriodo.get(fila.id) ?? 0,
  }));
}

export async function obtenerPeriodo(
  cliente: ClienteDb,
  userId: string,
  id: number,
): Promise<Periodo | null> {
  const fila = await cliente.db.query.periodos.findFirst({
    where: (tabla, { eq: eqCol, and: andCol }) =>
      andCol(eqCol(tabla.id, id), eqCol(tabla.userId, userId)),
    columns: COLUMNAS_PERIODO,
  });
  return fila ? aPeriodo(fila) : null;
}

export async function obtenerPeriodoAbierto(
  cliente: ClienteDb,
  userId: string,
): Promise<Periodo | null> {
  const fila = await cliente.db.query.periodos.findFirst({
    where: (tabla, { eq: eqCol, and: andCol, isNull: isNullCol }) =>
      andCol(eqCol(tabla.userId, userId), isNullCol(tabla.cierreEn)),
    columns: COLUMNAS_PERIODO,
  });
  return fila ? aPeriodo(fila) : null;
}

/** El período que contiene un instante, o null si cae en un hueco o antes del primero. */
export async function obtenerPeriodoQueContiene(
  cliente: ClienteDb,
  userId: string,
  instante: Date,
): Promise<Periodo | null> {
  const fila = await cliente.db.query.periodos.findFirst({
    where: () =>
      and(
        eq(esquema.periodos.userId, userId),
        lte(esquema.periodos.aperturaEn, instante),
        or(isNull(esquema.periodos.cierreEn), gt(esquema.periodos.cierreEn, instante)),
      ),
    columns: COLUMNAS_PERIODO,
  });
  return fila ? aPeriodo(fila) : null;
}

/** El período inmediatamente anterior (por apertura), para comparar contra él. */
export async function obtenerPeriodoAnterior(
  cliente: ClienteDb,
  userId: string,
  periodo: Periodo,
): Promise<Periodo | null> {
  const fila = await cliente.db.query.periodos.findFirst({
    where: (tabla, { eq: eqCol, and: andCol, lt: ltCol }) =>
      andCol(eqCol(tabla.userId, userId), ltCol(tabla.aperturaEn, periodo.aperturaEn)),
    columns: COLUMNAS_PERIODO,
    orderBy: (tabla, { desc: descCol }) => descCol(tabla.aperturaEn),
  });
  return fila ? aPeriodo(fila) : null;
}

/** Zona horaria de la persona: decide en qué mes cae una apertura al sugerir el nombre. */
export async function obtenerZonaHoraria(cliente: ClienteDb, userId: string): Promise<string> {
  const fila = await cliente.db.query.usuarios.findFirst({
    where: (tabla, { eq: eqCol }) => eqCol(tabla.id, userId),
    columns: { zonaHoraria: true },
  });
  if (!fila) throw new Error(`Usuario ${userId} no encontrado al leer su zona horaria.`);
  return fila.zonaHoraria;
}

export class YaHayPeriodoAbierto extends Error {
  readonly nombre: string;

  constructor(nombre: string) {
    super(nombre);
    this.nombre = nombre;
  }
}

export class AperturaEnElFuturo extends Error {}

/** La apertura caería adentro de otro período (o antes de que termine). */
export class AperturaSolapada extends Error {
  readonly nombre: string;
  readonly cierreEn: Date;

  constructor(nombre: string, cierreEn: Date) {
    super(nombre);
    this.nombre = nombre;
    this.cierreEn = cierreEn;
  }
}

export class NombreDePeriodoEnUso extends Error {}

export class PeriodoYaCerrado extends Error {}

export class CierreEnElFuturo extends Error {}

export class CierreNoPosteriorALaApertura extends Error {}

/** Se quiso reabrir un período que ya está abierto. */
export class PeriodoNoCerrado extends Error {}

/** Reabrirlo lo solaparía con un período posterior: solo se reabre el último. */
export class ReaperturaSolapada extends Error {
  readonly nombre: string;

  constructor(nombre: string) {
    super(nombre);
    this.nombre = nombre;
  }
}

/** Se cargó un movimiento en el período justo mientras se lo eliminaba. */
export class MovimientoNuevoAlEliminar extends Error {}

/** Hay movimientos en el período que quedarían fuera del rango al cerrar en esa fecha. */
export class CierreDejaMovimientosFuera extends Error {
  readonly cantidad: number;
  readonly ultimoEn: Date;

  constructor(cantidad: number, ultimoEn: Date) {
    super(String(cantidad));
    this.cantidad = cantidad;
    this.ultimoEn = ultimoEn;
  }
}

/**
 * true si el error es la violación de una restricción única concreta. Es la red
 * de seguridad para dos pedidos simultáneos que pasen a la vez la validación
 * previa: la base tiene la última palabra. Drizzle envuelve el error de `pg`
 * (el código y la restricción están en `cause`).
 */
function violaRestriccion(error: unknown, restriccion: string): boolean {
  const origen = (error as { cause?: unknown } | null)?.cause ?? error;
  return (
    typeof origen === "object" &&
    origen !== null &&
    (origen as { code?: unknown }).code === "23505" &&
    (origen as { constraint?: unknown }).constraint === restriccion
  );
}

function mismoNombre(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase("es") === b.trim().toLocaleLowerCase("es");
}

export type DatosAbrirPeriodo = {
  /** Sin nombre se usa el sugerido: el del mes de la apertura (con número si ya existe). */
  nombre?: string | undefined;
  /** Sin apertura se abre "ahora". */
  aperturaEn?: Date | undefined;
};

/**
 * Abre un período. No puede haber otro abierto, la apertura no puede ser
 * futura (los movimientos de hoy quedarían sin período) ni caer antes de que
 * termine un período anterior: el abierto no tiene cierre, así que un período
 * que empezara antes del cierre de otro lo pisaría.
 *
 * `ahora` se puede inyectar para probar el límite de "no futura".
 */
export async function abrirPeriodo(
  cliente: ClienteDb,
  userId: string,
  datos: DatosAbrirPeriodo,
  ahora: Date = new Date(),
): Promise<Periodo> {
  const aperturaEn = datos.aperturaEn ?? ahora;
  if (aperturaEn > ahora) throw new AperturaEnElFuturo();

  const existentes = await cliente.db.query.periodos.findMany({
    where: (tabla, { eq: eqCol }) => eqCol(tabla.userId, userId),
    columns: COLUMNAS_PERIODO,
  });

  const abierto = existentes.find((periodo) => periodo.cierreEn === null);
  if (abierto) throw new YaHayPeriodoAbierto(abierto.nombre);

  // Con todos cerrados, el nuevo (sin cierre) se solapa con cualquiera que
  // termine después de su apertura. Se avisa del que termina más tarde.
  const solapado = existentes
    .filter(
      (periodo): periodo is typeof periodo & { cierreEn: Date } =>
        periodo.cierreEn !== null && periodo.cierreEn > aperturaEn,
    )
    .sort((a, b) => b.cierreEn.getTime() - a.cierreEn.getTime())[0];
  if (solapado) throw new AperturaSolapada(solapado.nombre, solapado.cierreEn);

  const nombresExistentes = existentes.map((periodo) => periodo.nombre);
  let nombre: string;
  if (datos.nombre === undefined) {
    const zona = await obtenerZonaHoraria(cliente, userId);
    nombre = sugerirNombreDePeriodo(aperturaEn, zona, nombresExistentes);
  } else {
    nombre = datos.nombre;
    if (nombresExistentes.some((existente) => mismoNombre(existente, nombre))) {
      throw new NombreDePeriodoEnUso(nombre);
    }
  }

  try {
    const [fila] = await cliente.db
      .insert(esquema.periodos)
      .values({ userId, nombre, aperturaEn })
      .returning(COLUMNAS_A_DEVOLVER);
    if (!fila) throw new Error("No se pudo abrir el período.");
    return aPeriodo(fila);
  } catch (error) {
    if (violaRestriccion(error, "periodos_un_abierto_por_usuario")) {
      throw new YaHayPeriodoAbierto("");
    }
    if (violaRestriccion(error, "periodos_usuario_nombre_unico")) {
      throw new NombreDePeriodoEnUso(nombre);
    }
    throw error;
  }
}

export type DatosCerrarPeriodo = {
  /** Sin cierre se cierra "ahora". */
  cierreEn?: Date | undefined;
};

/**
 * Cierra un período abierto. El cierre tiene que ser posterior a la apertura,
 * no futuro y posterior a todos los movimientos del período (si no, quedarían
 * por fuera: un movimiento fuera del rango de su período es un dato roto).
 * No hace falta revisar solapamientos con otros períodos: el abierto es
 * siempre el último, y acortarlo hacia atrás no puede pisar a ninguno.
 *
 * Devuelve null si el período no existe (o es de otra persona).
 */
export async function cerrarPeriodo(
  cliente: ClienteDb,
  userId: string,
  id: number,
  datos: DatosCerrarPeriodo,
  ahora: Date = new Date(),
): Promise<Periodo | null> {
  const periodo = await obtenerPeriodo(cliente, userId, id);
  if (!periodo) return null;
  if (!periodo.abierto) throw new PeriodoYaCerrado();

  const cierreEn = datos.cierreEn ?? ahora;
  if (cierreEn > ahora) throw new CierreEnElFuturo();
  if (cierreEn <= periodo.aperturaEn) throw new CierreNoPosteriorALaApertura();

  // El cierre no se incluye en el período: un movimiento justo en ese instante
  // quedaría afuera, por eso es `>=`.
  const [fuera] = await cliente.db
    .select({ cantidad: count(), ultimoEn: max(esquema.movimientos.fecha) })
    .from(esquema.movimientos)
    .where(
      and(
        eq(esquema.movimientos.userId, userId),
        eq(esquema.movimientos.periodoId, id),
        isNull(esquema.movimientos.eliminadoEn),
        gte(esquema.movimientos.fecha, cierreEn),
      ),
    );
  if (fuera && fuera.cantidad > 0 && fuera.ultimoEn) {
    throw new CierreDejaMovimientosFuera(fuera.cantidad, fuera.ultimoEn);
  }

  const [fila] = await cliente.db
    .update(esquema.periodos)
    .set({ cierreEn })
    .where(
      and(
        eq(esquema.periodos.id, id),
        eq(esquema.periodos.userId, userId),
        isNull(esquema.periodos.cierreEn),
      ),
    )
    .returning(COLUMNAS_A_DEVOLVER);

  // Sin fila: otro pedido lo cerró entre la lectura y la escritura.
  if (!fila) throw new PeriodoYaCerrado();
  return aPeriodo(fila);
}

/**
 * Cambia el nombre. Ningún movimiento se toca: apuntan al `id`, no al nombre.
 * Devuelve null si el período no existe (o es de otra persona).
 */
export async function renombrarPeriodo(
  cliente: ClienteDb,
  userId: string,
  id: number,
  nombre: string,
): Promise<Periodo | null> {
  const otroConEseNombre = await cliente.db.query.periodos.findFirst({
    where: () =>
      and(
        eq(esquema.periodos.userId, userId),
        ne(esquema.periodos.id, id),
        sql`lower(${esquema.periodos.nombre}) = lower(${nombre})`,
      ),
    columns: { id: true },
  });
  if (otroConEseNombre) throw new NombreDePeriodoEnUso(nombre);

  try {
    const [fila] = await cliente.db
      .update(esquema.periodos)
      .set({ nombre })
      .where(and(eq(esquema.periodos.id, id), eq(esquema.periodos.userId, userId)))
      .returning(COLUMNAS_A_DEVOLVER);
    return fila ? aPeriodo(fila) : null;
  } catch (error) {
    if (violaRestriccion(error, "periodos_usuario_nombre_unico")) {
      throw new NombreDePeriodoEnUso(nombre);
    }
    throw error;
  }
}

/**
 * Reabre un período cerrado: le quita el cierre y vuelve a ser el abierto. Hace
 * falta que no haya otro abierto (solo puede haber uno) ni uno posterior (con el
 * cierre quitado, este se extendería hacia adelante y lo pisaría). Conserva
 * nombre y apertura, y los movimientos siguen adentro: el rango solo se agranda.
 *
 * Devuelve null si el período no existe (o es de otra persona).
 */
export async function reabrirPeriodo(
  cliente: ClienteDb,
  userId: string,
  id: number,
): Promise<Periodo | null> {
  const existentes = await cliente.db.query.periodos.findMany({
    where: (tabla, { eq: eqCol }) => eqCol(tabla.userId, userId),
    columns: COLUMNAS_PERIODO,
  });
  const periodo = existentes.find((otro) => otro.id === id);
  if (!periodo) return null;
  if (periodo.cierreEn === null) throw new PeriodoNoCerrado();

  const abierto = existentes.find((otro) => otro.cierreEn === null);
  if (abierto) throw new YaHayPeriodoAbierto(abierto.nombre);

  const posterior = existentes
    .filter((otro) => otro.aperturaEn > periodo.aperturaEn)
    .sort((a, b) => a.aperturaEn.getTime() - b.aperturaEn.getTime())[0];
  if (posterior) throw new ReaperturaSolapada(posterior.nombre);

  try {
    const [fila] = await cliente.db
      .update(esquema.periodos)
      .set({ cierreEn: null })
      .where(
        and(
          eq(esquema.periodos.id, id),
          eq(esquema.periodos.userId, userId),
          sql`${esquema.periodos.cierreEn} is not null`,
        ),
      )
      .returning(COLUMNAS_A_DEVOLVER);
    if (!fila) throw new PeriodoNoCerrado();
    return aPeriodo(fila);
  } catch (error) {
    // Otro pedido abrió un período entre la lectura y la escritura.
    if (violaRestriccion(error, "periodos_un_abierto_por_usuario")) {
      throw new YaHayPeriodoAbierto("");
    }
    throw error;
  }
}

/**
 * Elimina un período **con todos sus movimientos**, en una transacción. Es una
 * baja física, también de los movimientos: el período de un movimiento es
 * obligatorio, así que no hay otro lugar donde dejarlos, y reasignarlos a otro
 * período falsearía su fecha. La interfaz avisa antes cuántos se pierden.
 *
 * Los saldos de las cuentas no se "corrigen": se calculan al leer a partir de
 * los movimientos, así que al desaparecer estos cada cuenta vuelve sola a lo que
 * tenía sin ellos (una transferencia borrada se revierte en origen y destino a la
 * vez, porque es una sola fila). Lo mismo con ingresos, gastos y presupuestos.
 *
 * Devuelve cuántos movimientos activos se eliminaron (los ya eliminados por la
 * persona, que ella no ve, se borran también pero no se cuentan), o null si el
 * período no existe (o es de otra persona).
 */
export async function eliminarPeriodo(
  cliente: ClienteDb,
  userId: string,
  id: number,
): Promise<{ movimientosEliminados: number } | null> {
  try {
    return await cliente.db.transaction(async (tx) => {
      const periodo = await tx.query.periodos.findFirst({
        where: (tabla, { eq: eqCol, and: andCol }) =>
          andCol(eqCol(tabla.id, id), eqCol(tabla.userId, userId)),
        columns: { id: true },
      });
      if (!periodo) return null;

      const borrados = await tx
        .delete(esquema.movimientos)
        .where(and(eq(esquema.movimientos.userId, userId), eq(esquema.movimientos.periodoId, id)))
        .returning({ eliminadoEn: esquema.movimientos.eliminadoEn });
      await tx
        .delete(esquema.periodos)
        .where(and(eq(esquema.periodos.id, id), eq(esquema.periodos.userId, userId)));

      return {
        movimientosEliminados: borrados.filter((fila) => fila.eliminadoEn === null).length,
      };
    });
  } catch (error) {
    // Un movimiento se cargó entre el borrado de los movimientos y el del período:
    // la clave foránea lo frena y no se pierde nada (la transacción se revierte).
    const origen = (error as { cause?: unknown } | null)?.cause ?? error;
    if ((origen as { code?: unknown } | null)?.code === "23503") {
      throw new MovimientoNuevoAlEliminar();
    }
    throw error;
  }
}
