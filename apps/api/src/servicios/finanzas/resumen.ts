// Resumen del período: lo primero que se ve al entrar al módulo.
//
// El período lo elige quien llama (la ruta lo busca y verifica que sea de la
// persona): el servidor nunca calcula "el período actual" por su cuenta, la
// persona decide cuál mira (por defecto, el abierto).
//
// Todo está en la moneda base de la persona: los totales suman el importe ya convertido
// de cada movimiento (con el cambio con que se cargó); el disponible convierte el saldo
// de cada cuenta en otra moneda con la cotización de hoy, así que es una estimación.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import { convertirCentavos } from "@gestoria/shared";
import { and, eq, isNull, sql } from "drizzle-orm";
import { type OpcionesDeCotizacion, obtenerTasa } from "./cotizaciones.ts";
import { type CuentaFinanciera, listarCuentasFinancieras } from "./cuentas-financieras.ts";
import { obtenerMonedaBase } from "./moneda-base.ts";
import { listarMovimientos, type Movimiento } from "./movimientos.ts";
import { obtenerPeriodoAnterior, type Periodo } from "./periodos.ts";

export type TotalesDelPeriodo = { ingresosCentavos: number; gastosCentavos: number };

export async function totalesDelPeriodo(
  cliente: ClienteDb,
  userId: string,
  periodoId: number,
): Promise<TotalesDelPeriodo> {
  const filas = await cliente.db
    .select({
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
  /** La moneda en la que está todo el resumen. */
  monedaBase: string;
  balanceCentavos: number;
  /** Suma del saldo de todas las cuentas activas: lo que hay, no lo que entró o salió en el período. */
  disponibleCentavos: number;
  /** Alguna cuenta está en otra moneda: su parte del disponible sale de la cotización de hoy. */
  disponibleEsEstimado: boolean;
  /** Monedas de cuentas que no se pudieron convertir (sin cotización): no suman al disponible. */
  monedasSinCotizacion: string[];
  /** El período inmediatamente anterior, para comparar. Nulo si es el primero. */
  periodoAnterior: ({ nombre: string } & TotalesDelPeriodo) | null;
  /** Los últimos movimientos del período que se está mirando (no de otros). */
  ultimosMovimientos: Movimiento[];
};

/**
 * Suma los saldos de las cuentas en la moneda base. Los de otras monedas se convierten con la
 * cotización de hoy; si de alguna moneda no hay cotización, esas cuentas no suman y se avisa.
 */
export async function disponibleEnMonedaBase(
  cliente: ClienteDb,
  cuentas: CuentaFinanciera[],
  monedaBase: string,
  opciones: OpcionesDeCotizacion,
): Promise<Pick<Resumen, "disponibleCentavos" | "disponibleEsEstimado" | "monedasSinCotizacion">> {
  const monedas = [...new Set(cuentas.map((cuenta) => cuenta.moneda))].filter(
    (moneda) => moneda !== monedaBase,
  );
  const hoy = opciones.ahora ?? new Date();
  const tasas = new Map(
    await Promise.all(
      monedas.map(
        async (moneda) =>
          [moneda, (await obtenerTasa(cliente, moneda, monedaBase, hoy, opciones))?.tasa] as const,
      ),
    ),
  );

  let disponibleCentavos = 0;
  const monedasSinCotizacion = new Set<string>();
  for (const cuenta of cuentas) {
    if (cuenta.moneda === monedaBase) {
      disponibleCentavos += cuenta.saldoCentavos;
      continue;
    }
    const tasa = tasas.get(cuenta.moneda);
    if (tasa === undefined) monedasSinCotizacion.add(cuenta.moneda);
    else disponibleCentavos += convertirCentavos(cuenta.saldoCentavos, tasa);
  }

  return {
    disponibleCentavos,
    disponibleEsEstimado: cuentas.some((cuenta) => cuenta.moneda !== monedaBase),
    monedasSinCotizacion: [...monedasSinCotizacion],
  };
}

export async function obtenerResumen(
  cliente: ClienteDb,
  userId: string,
  periodo: Periodo,
  opciones: OpcionesDeCotizacion = {},
): Promise<Resumen> {
  const [actual, anterior, cuentas, monedaBase, { movimientos: ultimosMovimientos }] =
    await Promise.all([
      totalesDelPeriodo(cliente, userId, periodo.id),
      obtenerPeriodoAnterior(cliente, userId, periodo).then(async (previo) =>
        previo
          ? { nombre: previo.nombre, ...(await totalesDelPeriodo(cliente, userId, previo.id)) }
          : null,
      ),
      listarCuentasFinancieras(cliente, userId),
      obtenerMonedaBase(cliente, userId),
      listarMovimientos(cliente, userId, {
        periodoId: periodo.id,
        limit: CANTIDAD_ULTIMOS_MOVIMIENTOS,
      }),
    ]);

  return {
    ...actual,
    periodo,
    monedaBase,
    balanceCentavos: actual.ingresosCentavos - actual.gastosCentavos,
    ...(await disponibleEnMonedaBase(cliente, cuentas, monedaBase, opciones)),
    periodoAnterior: anterior,
    ultimosMovimientos,
  };
}
