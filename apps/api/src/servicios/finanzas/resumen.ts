// Resumen del período: lo primero que se ve al entrar al módulo.
//
// El período lo elige quien llama (la ruta lo busca y verifica que sea de la
// persona): el servidor nunca calcula "el período actual" por su cuenta, la
// persona decide cuál mira (por defecto, el abierto).

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { listarCuentasFinancieras } from "./cuentas-financieras.ts";
import { listarMovimientos, type Movimiento } from "./movimientos.ts";
import { obtenerPeriodoAnterior, type Periodo } from "./periodos.ts";

export type TotalesDelPeriodo = { ingresosCentavos: number; gastosCentavos: number };

async function totalesDelPeriodo(
  cliente: ClienteDb,
  userId: string,
  periodoId: number,
): Promise<TotalesDelPeriodo> {
  const filas = await cliente.db
    .select({
      tipo: esquema.movimientos.tipo,
      total: sql<number>`coalesce(sum(${esquema.movimientos.importeCentavos}), 0)::bigint`.mapWith(
        Number,
      ),
    })
    .from(esquema.movimientos)
    .where(
      and(
        eq(esquema.movimientos.userId, userId),
        eq(esquema.movimientos.periodoId, periodoId),
        isNull(esquema.movimientos.eliminadoEn),
      ),
    )
    .groupBy(esquema.movimientos.tipo);

  return {
    ingresosCentavos: filas.find((fila) => fila.tipo === "ingreso")?.total ?? 0,
    gastosCentavos: filas.find((fila) => fila.tipo === "gasto")?.total ?? 0,
  };
}

const CANTIDAD_ULTIMOS_MOVIMIENTOS = 5;

export type Resumen = TotalesDelPeriodo & {
  periodo: Periodo;
  balanceCentavos: number;
  /** Suma del saldo de todas las cuentas activas: lo que hay, no lo que entró o salió en el período. */
  disponibleCentavos: number;
  /** El período inmediatamente anterior, para comparar. Nulo si es el primero. */
  periodoAnterior: ({ nombre: string } & TotalesDelPeriodo) | null;
  /** Los últimos movimientos del período que se está mirando (no de otros). */
  ultimosMovimientos: Movimiento[];
};

export async function obtenerResumen(
  cliente: ClienteDb,
  userId: string,
  periodo: Periodo,
): Promise<Resumen> {
  const [actual, anterior, cuentas, { movimientos: ultimosMovimientos }] = await Promise.all([
    totalesDelPeriodo(cliente, userId, periodo.id),
    obtenerPeriodoAnterior(cliente, userId, periodo).then(async (previo) =>
      previo
        ? { nombre: previo.nombre, ...(await totalesDelPeriodo(cliente, userId, previo.id)) }
        : null,
    ),
    listarCuentasFinancieras(cliente, userId),
    listarMovimientos(cliente, userId, {
      periodoId: periodo.id,
      limit: CANTIDAD_ULTIMOS_MOVIMIENTOS,
    }),
  ]);

  return {
    ...actual,
    periodo,
    balanceCentavos: actual.ingresosCentavos - actual.gastosCentavos,
    disponibleCentavos: cuentas.reduce((acumulado, cuenta) => acumulado + cuenta.saldoCentavos, 0),
    periodoAnterior: anterior,
    ultimosMovimientos,
  };
}
