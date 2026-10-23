// Estadísticas que comparan el período que se mira con el anterior, más unos datos
// rápidos del período: qué categorías subieron o bajaron, el ritmo de gasto día a día
// y números sueltos (promedio por día, gasto más grande).
//
// "Día" acá es un bloque de 24 horas contado desde la apertura del período (día 1 son
// las primeras 24 horas), no un día de calendario: así no depende de la zona horaria y
// los períodos, que no son meses calendario, se comparan entre sí por igual.
//
// Solo cuentan los gastos y los ingresos activos: ni las transferencias ni los
// movimientos eliminados. Toda consulta filtra por `userId`, que sale de la sesión.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { obtenerPeriodoAnterior, type Periodo } from "./periodos.ts";

const MS_POR_DIA = 24 * 60 * 60 * 1000;
/** Cuántas categorías se muestran en la comparación: las que más cambiaron. */
const CANTIDAD_CATEGORIAS_COMPARADAS = 8;

export type VariacionDeCategoria = {
  categoriaId: number;
  nombre: string;
  color: string;
  actualCentavos: number;
  anteriorCentavos: number;
  /** Actual menos anterior: positivo si se gastó más, negativo si se gastó menos. */
  diferenciaCentavos: number;
  /**
   * La diferencia como porcentaje de lo gastado en el período anterior, con un decimal
   * (25,5 es 25,5 %). Es null si antes no se gastó nada en la categoría: dividir por cero
   * no da un porcentaje, y es una categoría nueva.
   */
  porcentaje: number | null;
};

export type VariacionPorCategoria = {
  periodoAnterior: string;
  /** De la que más cambió a la que menos (en valor absoluto); no incluye las que quedaron igual. */
  categorias: VariacionDeCategoria[];
};

export type PuntoDeRitmo = {
  /** Número de día del período, desde 1. */
  dia: number;
  /** Lo gastado hasta el final de ese día; null después del último día transcurrido. */
  actualCentavos: number | null;
  /** Lo mismo en el período anterior; null después de su último día. */
  anteriorCentavos: number | null;
};

export type RitmoDeGasto = {
  /** Días transcurridos del período que se mira (hasta hoy si está abierto; todos si está cerrado). */
  diasTranscurridos: number;
  /** Lo gastado en el período hasta hoy. */
  acumuladoCentavos: number;
  /** Null si es el primer período, y entonces no hay con qué comparar. */
  anterior: {
    nombre: string;
    /** Lo que se llevaba gastado en el período anterior a esta misma altura (mismo número de día). */
    acumuladoAlMismoDiaCentavos: number;
  } | null;
  puntos: PuntoDeRitmo[];
};

export type GastoMasGrande = {
  importeCentavos: number;
  descripcion: string;
  categoria: string;
  fecha: Date;
};

export type DatosRapidos = {
  /** Gasto total del período dividido en los días transcurridos, redondeado al centavo. */
  promedioPorDiaCentavos: number;
  /** Ingresos y gastos del período (las transferencias no cuentan). */
  cantidadDeMovimientos: number;
  /** Null si el período no tiene gastos. */
  gastoMasGrande: GastoMasGrande | null;
};

export type EstadisticasComparativas = {
  /** Null si es el primer período. */
  variacionPorCategoria: VariacionPorCategoria | null;
  ritmoDeGasto: RitmoDeGasto;
  datosRapidos: DatosRapidos;
};

const total =
  sql<number>`coalesce(sum(${esquema.movimientos.importeConvertidoCentavos}), 0)::bigint`.mapWith(
    Number,
  );

/** Cuántos días (bloques de 24 h, mínimo 1) hay entre dos instantes. */
function diasEntre(desde: Date, hasta: Date): number {
  return Math.max(1, Math.ceil((hasta.getTime() - desde.getTime()) / MS_POR_DIA));
}

/** El gasto de cada categoría en un período. */
async function gastoPorCategoria(
  cliente: ClienteDb,
  userId: string,
  periodoId: number,
): Promise<Map<number, { nombre: string; color: string; totalCentavos: number }>> {
  const filas = await cliente.db
    .select({
      categoriaId: esquema.categorias.id,
      nombre: esquema.categorias.nombre,
      color: esquema.categorias.color,
      totalCentavos: total,
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
    .groupBy(esquema.categorias.id, esquema.categorias.nombre, esquema.categorias.color);

  return new Map(filas.map((fila) => [fila.categoriaId, fila]));
}

function compararCategorias(
  actual: Map<number, { nombre: string; color: string; totalCentavos: number }>,
  anterior: Map<number, { nombre: string; color: string; totalCentavos: number }>,
): VariacionDeCategoria[] {
  const variaciones: VariacionDeCategoria[] = [];
  for (const categoriaId of new Set([...actual.keys(), ...anterior.keys()])) {
    const ahora = actual.get(categoriaId);
    const antes = anterior.get(categoriaId);
    const actualCentavos = ahora?.totalCentavos ?? 0;
    const anteriorCentavos = antes?.totalCentavos ?? 0;
    const diferenciaCentavos = actualCentavos - anteriorCentavos;
    if (diferenciaCentavos === 0) continue;

    // Al menos una de las dos existe, porque el id salió de alguna.
    const categoria = ahora ?? antes;
    variaciones.push({
      categoriaId,
      nombre: categoria?.nombre ?? "",
      color: categoria?.color ?? "",
      actualCentavos,
      anteriorCentavos,
      diferenciaCentavos,
      porcentaje:
        anteriorCentavos > 0
          ? Math.round((diferenciaCentavos / anteriorCentavos) * 1000) / 10
          : null,
    });
  }

  return variaciones
    .sort(
      (a, b) =>
        Math.abs(b.diferenciaCentavos) - Math.abs(a.diferenciaCentavos) ||
        a.nombre.localeCompare(b.nombre, "es"),
    )
    .slice(0, CANTIDAD_CATEGORIAS_COMPARADAS);
}

/** Lo gastado en cada día del período (día 0 = primeras 24 h), solo los días con gastos. */
async function gastoPorDia(
  cliente: ClienteDb,
  userId: string,
  periodo: Periodo,
): Promise<Map<number, number>> {
  const dia = sql<number>`floor(extract(epoch from (${esquema.movimientos.fecha} - ${periodo.aperturaEn.toISOString()}::timestamptz)) / 86400)::int`;
  const filas = await cliente.db
    .select({ dia: dia.mapWith(Number), totalCentavos: total })
    .from(esquema.movimientos)
    .where(
      and(
        eq(esquema.movimientos.userId, userId),
        eq(esquema.movimientos.periodoId, periodo.id),
        eq(esquema.movimientos.tipo, "gasto"),
        isNull(esquema.movimientos.eliminadoEn),
      ),
    )
    // Por posición (la columna 1, el día): agrupar por la expresión con su parámetro
    // haría que Postgres no la reconozca como la misma que se selecciona.
    .groupBy(sql`1`);

  return new Map(filas.map((fila) => [fila.dia, fila.totalCentavos]));
}

/** El gasto acumulado al final de cada uno de los `cantidadDeDias` días. */
function acumularPorDia(porDia: Map<number, number>, cantidadDeDias: number): number[] {
  const acumulado: number[] = [];
  let corriente = 0;
  for (let dia = 0; dia < cantidadDeDias; dia++) {
    corriente += porDia.get(dia) ?? 0;
    acumulado.push(corriente);
  }
  return acumulado;
}

/** Los días que cubren los gastos: el último día con gasto, contado desde 1. */
function ultimoDiaConGasto(porDia: Map<number, number>): number {
  return porDia.size === 0 ? 0 : Math.max(...porDia.keys()) + 1;
}

async function datosSueltos(
  cliente: ClienteDb,
  userId: string,
  periodoId: number,
): Promise<{ cantidadDeMovimientos: number; gastoMasGrande: GastoMasGrande | null }> {
  const activos = and(
    eq(esquema.movimientos.userId, userId),
    eq(esquema.movimientos.periodoId, periodoId),
    isNull(esquema.movimientos.eliminadoEn),
  );

  const [[cantidad], [mayor]] = await Promise.all([
    cliente.db
      .select({ cantidad: sql<number>`count(*)::int`.mapWith(Number) })
      .from(esquema.movimientos)
      .where(and(activos, inArray(esquema.movimientos.tipo, ["ingreso", "gasto"]))),
    cliente.db
      .select({
        importeCentavos: esquema.movimientos.importeConvertidoCentavos,
        descripcion: esquema.movimientos.descripcion,
        categoria: esquema.categorias.nombre,
        fecha: esquema.movimientos.fecha,
      })
      .from(esquema.movimientos)
      .innerJoin(esquema.categorias, eq(esquema.categorias.id, esquema.movimientos.categoriaId))
      .where(and(activos, eq(esquema.movimientos.tipo, "gasto")))
      // A igual importe, el más reciente: es el que la persona más probablemente recuerda.
      .orderBy(desc(esquema.movimientos.importeConvertidoCentavos), desc(esquema.movimientos.fecha))
      .limit(1),
  ]);

  return { cantidadDeMovimientos: cantidad?.cantidad ?? 0, gastoMasGrande: mayor ?? null };
}

/**
 * Las estadísticas que comparan el período con el anterior y los datos rápidos de
 * este. `ahora` es el instante de referencia para un período abierto (cuántos días
 * van); se inyecta para poder probarlo, y un período cerrado no lo usa.
 */
export async function estadisticasComparativas(
  cliente: ClienteDb,
  userId: string,
  periodo: Periodo,
  ahora: Date = new Date(),
): Promise<EstadisticasComparativas> {
  const anterior = await obtenerPeriodoAnterior(cliente, userId, periodo);

  const [gastoActual, gastoAnterior, diarioActual, diarioAnterior, sueltos] = await Promise.all([
    gastoPorCategoria(cliente, userId, periodo.id),
    anterior ? gastoPorCategoria(cliente, userId, anterior.id) : null,
    gastoPorDia(cliente, userId, periodo),
    anterior ? gastoPorDia(cliente, userId, anterior) : null,
    datosSueltos(cliente, userId, periodo.id),
  ]);

  // Los días del período que se mira. Un movimiento con fecha posterior a "ahora" (se
  // puede cargar por adelantado dentro de un período abierto) también cuenta en los
  // totales, así que el período se extiende hasta su día para no perderlo.
  const diasTranscurridos = Math.max(
    diasEntre(periodo.aperturaEn, periodo.cierreEn ?? ahora),
    ultimoDiaConGasto(diarioActual),
  );
  const acumuladoActual = acumularPorDia(diarioActual, diasTranscurridos);

  let ritmoAnterior: { nombre: string; acumulado: number[] } | null = null;
  if (anterior && diarioAnterior) {
    // Un período anterior siempre está cerrado (hay uno solo abierto).
    const duracion = Math.max(
      diasEntre(anterior.aperturaEn, anterior.cierreEn ?? periodo.aperturaEn),
      ultimoDiaConGasto(diarioAnterior),
    );
    ritmoAnterior = {
      nombre: anterior.nombre,
      acumulado: acumularPorDia(diarioAnterior, duracion),
    };
  }

  const cantidadDePuntos = Math.max(diasTranscurridos, ritmoAnterior?.acumulado.length ?? 0);
  const puntos: PuntoDeRitmo[] = Array.from({ length: cantidadDePuntos }, (_, indice) => ({
    dia: indice + 1,
    actualCentavos: acumuladoActual[indice] ?? null,
    anteriorCentavos: ritmoAnterior?.acumulado[indice] ?? null,
  }));

  const acumuladoCentavos = acumuladoActual.at(-1) ?? 0;

  return {
    variacionPorCategoria:
      anterior && gastoAnterior
        ? {
            periodoAnterior: anterior.nombre,
            categorias: compararCategorias(gastoActual, gastoAnterior),
          }
        : null,
    ritmoDeGasto: {
      diasTranscurridos,
      acumuladoCentavos,
      anterior: ritmoAnterior
        ? {
            nombre: ritmoAnterior.nombre,
            // Si el anterior duró menos días que los transcurridos, ya había gastado todo.
            acumuladoAlMismoDiaCentavos:
              ritmoAnterior.acumulado[
                Math.min(diasTranscurridos, ritmoAnterior.acumulado.length) - 1
              ] ?? 0,
          }
        : null,
      puntos,
    },
    datosRapidos: {
      promedioPorDiaCentavos: Math.round(acumuladoCentavos / diasTranscurridos),
      ...sueltos,
    },
  };
}
