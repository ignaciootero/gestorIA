// Estadísticas del módulo: gastos por categoría y evolución por período.
// Datos ya agregados para gráficos simples (docs/guias/estetica.md, "limpio
// pero con vida", nada sobrecargado).

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import { and, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import type { Periodo } from "./periodos.ts";

export type GastoPorCategoria = {
  categoriaId: number;
  nombre: string;
  color: string;
  totalCentavos: number;
};

/** De mayor a menor gasto: es como conviene mirar "en qué se fue la plata". */
export async function gastosPorCategoria(
  cliente: ClienteDb,
  userId: string,
  periodoId: number,
): Promise<GastoPorCategoria[]> {
  return cliente.db
    .select({
      categoriaId: esquema.categorias.id,
      nombre: esquema.categorias.nombre,
      color: esquema.categorias.color,
      totalCentavos:
        sql<number>`coalesce(sum(${esquema.movimientos.importeConvertidoCentavos}), 0)::bigint`.mapWith(
          Number,
        ),
    })
    .from(esquema.movimientos)
    .innerJoin(esquema.categorias, eq(esquema.categorias.id, esquema.movimientos.categoriaId))
    .where(
      and(
        eq(esquema.movimientos.userId, userId),
        eq(esquema.movimientos.periodoId, periodoId),
        eq(esquema.movimientos.tipo, "gasto"),
        isNull(esquema.movimientos.eliminadoEn),
      ),
    )
    .groupBy(esquema.categorias.id, esquema.categorias.nombre, esquema.categorias.color)
    .orderBy(sql`4 desc`);
}

export type PeriodoDeEvolucion = {
  periodoId: number;
  nombre: string;
  ingresosCentavos: number;
  gastosCentavos: number;
  /** Ingresos menos gastos del período: positivo si sobró, negativo si se gastó de más. */
  balanceCentavos: number;
};

const CANTIDAD_PERIODOS_EVOLUCION = 6;
/** La evolución de una categoría mira más atrás: una sola serie se lee bien con más puntos. */
const CANTIDAD_PERIODOS_EVOLUCION_DE_CATEGORIA = 12;

/** Los últimos `cantidad` períodos hasta el indicado (inclusive), del más nuevo al más viejo. */
async function ultimosPeriodos(
  cliente: ClienteDb,
  userId: string,
  periodo: Periodo,
  cantidad: number,
): Promise<{ id: number; nombre: string }[]> {
  return cliente.db
    .select({ id: esquema.periodos.id, nombre: esquema.periodos.nombre })
    .from(esquema.periodos)
    .where(
      and(
        eq(esquema.periodos.userId, userId),
        lte(esquema.periodos.aperturaEn, periodo.aperturaEn),
      ),
    )
    .orderBy(desc(esquema.periodos.aperturaEn))
    .limit(cantidad);
}

/**
 * Ingresos y gastos de los últimos períodos hasta el indicado (inclusive), del
 * más viejo al más nuevo, para ver la tendencia. Los períodos pueden durar
 * distinto, así que las barras no son del todo comparables entre sí.
 */
export async function evolucionPorPeriodo(
  cliente: ClienteDb,
  userId: string,
  periodo: Periodo,
): Promise<PeriodoDeEvolucion[]> {
  const recientes = await ultimosPeriodos(cliente, userId, periodo, CANTIDAD_PERIODOS_EVOLUCION);

  if (recientes.length === 0) return [];

  const totales = await cliente.db
    .select({
      periodoId: esquema.movimientos.periodoId,
      tipo: esquema.movimientos.tipo,
      total:
        sql<number>`coalesce(sum(${esquema.movimientos.importeConvertidoCentavos}), 0)::bigint`.mapWith(
          Number,
        ),
    })
    .from(esquema.movimientos)
    .where(
      and(
        eq(esquema.movimientos.userId, userId),
        inArray(
          esquema.movimientos.periodoId,
          recientes.map((reciente) => reciente.id),
        ),
        isNull(esquema.movimientos.eliminadoEn),
      ),
    )
    .groupBy(esquema.movimientos.periodoId, esquema.movimientos.tipo);

  return recientes.reverse().map(({ id, nombre }) => {
    const ingresosCentavos =
      totales.find((fila) => fila.periodoId === id && fila.tipo === "ingreso")?.total ?? 0;
    const gastosCentavos =
      totales.find((fila) => fila.periodoId === id && fila.tipo === "gasto")?.total ?? 0;
    return {
      periodoId: id,
      nombre,
      ingresosCentavos,
      gastosCentavos,
      balanceCentavos: ingresosCentavos - gastosCentavos,
    };
  });
}

/** Qué se mira de una categoría: lo gastado o lo ingresado. Una misma categoría puede tener las dos cosas. */
export type TipoDeEvolucion = "gasto" | "ingreso";

export type PuntoDeCategoria = {
  periodoId: number;
  nombre: string;
  /** Lo gastado (o ingresado, según el tipo) en la categoría en ese período; 0 si no hubo. */
  totalCentavos: number;
  /** Los ingresos de todo el período (de todas las categorías). */
  ingresosCentavos: number;
  /**
   * El total de la categoría como porcentaje de los ingresos del período, con un
   * decimal (12,5 es 12,5 %). Con gastos es "cuánto de lo que entró se fue en esta
   * categoría"; con ingresos, "qué parte de lo que entró vino de esta categoría".
   * Es null si el período no tuvo ingresos: dividir por cero no da un porcentaje, y
   * un 0 % o un 100 % inventado sería engañoso.
   */
  porcentajeDeIngresos: number | null;
};

export type EvolucionDeCategoria = {
  tipo: TipoDeEvolucion;
  /** Del período más viejo al más nuevo, terminando en el indicado. */
  periodos: PuntoDeCategoria[];
  /** El límite fijado para la categoría, o null si no tiene (o si se miran ingresos: un presupuesto es un tope de gasto). */
  presupuestoCentavos: number | null;
};

/**
 * Cuánto se gastó (o se ingresó) en una categoría en cada uno de los últimos
 * períodos hasta el indicado (inclusive), en valor bruto y como porcentaje de los
 * ingresos de cada período. Una categoría puede tener gastos e ingresos en el mismo
 * período (y más de uno que de otro según el mes), por eso se elige cuál mirar.
 *
 * Todos los períodos aparecen, con 0 si no hubo movimientos, para que el gráfico no
 * "salte" períodos. Cuenta solo el tipo pedido: ni las transferencias ni los
 * movimientos eliminados. Los períodos pueden durar distinto, así que los puntos no
 * son del todo comparables entre sí.
 *
 * El llamador verifica que la categoría sea de la persona.
 */
export async function evolucionDeCategoria(
  cliente: ClienteDb,
  userId: string,
  periodo: Periodo,
  categoriaId: number,
  tipo: TipoDeEvolucion = "gasto",
): Promise<EvolucionDeCategoria> {
  const recientes = await ultimosPeriodos(
    cliente,
    userId,
    periodo,
    CANTIDAD_PERIODOS_EVOLUCION_DE_CATEGORIA,
  );
  const idsDePeriodos = recientes.map((reciente) => reciente.id);

  const total =
    sql<number>`coalesce(sum(${esquema.movimientos.importeConvertidoCentavos}), 0)::bigint`.mapWith(
      Number,
    );

  const [totales, ingresos, presupuesto] = await Promise.all([
    recientes.length === 0
      ? []
      : cliente.db
          .select({ periodoId: esquema.movimientos.periodoId, total })
          .from(esquema.movimientos)
          .where(
            and(
              eq(esquema.movimientos.userId, userId),
              eq(esquema.movimientos.categoriaId, categoriaId),
              eq(esquema.movimientos.tipo, tipo),
              inArray(esquema.movimientos.periodoId, idsDePeriodos),
              isNull(esquema.movimientos.eliminadoEn),
            ),
          )
          .groupBy(esquema.movimientos.periodoId),
    // Los ingresos del período, de todas las categorías (no las transferencias).
    recientes.length === 0
      ? []
      : cliente.db
          .select({ periodoId: esquema.movimientos.periodoId, total })
          .from(esquema.movimientos)
          .where(
            and(
              eq(esquema.movimientos.userId, userId),
              eq(esquema.movimientos.tipo, "ingreso"),
              inArray(esquema.movimientos.periodoId, idsDePeriodos),
              isNull(esquema.movimientos.eliminadoEn),
            ),
          )
          .groupBy(esquema.movimientos.periodoId),
    tipo === "gasto"
      ? cliente.db.query.presupuestos.findFirst({
          where: (tabla, { eq: eqCol, and: andCol }) =>
            andCol(eqCol(tabla.userId, userId), eqCol(tabla.categoriaId, categoriaId)),
          columns: { montoCentavos: true },
        })
      : undefined,
  ]);

  return {
    tipo,
    periodos: recientes.reverse().map(({ id, nombre }) => {
      const totalCentavos = totales.find((fila) => fila.periodoId === id)?.total ?? 0;
      const ingresosCentavos = ingresos.find((fila) => fila.periodoId === id)?.total ?? 0;
      return {
        periodoId: id,
        nombre,
        totalCentavos,
        ingresosCentavos,
        porcentajeDeIngresos:
          ingresosCentavos > 0 ? Math.round((totalCentavos / ingresosCentavos) * 1000) / 10 : null,
      };
    }),
    presupuestoCentavos: presupuesto?.montoCentavos ?? null,
  };
}
