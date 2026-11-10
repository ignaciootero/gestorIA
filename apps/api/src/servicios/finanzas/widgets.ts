// Datos de los widgets de Finanzas: cifras sueltas, curiosidades y avisos en un
// solo pedido, para mostrarlos en un carrusel chico (pantalla de inicio y
// columna lateral de Finanzas).
//
// Devuelve datos y no frases: qué texto o ícono lleva cada widget es cosa de la
// pantalla. Lo que sí se decide acá es cuándo hay algo que avisar (un
// presupuesto por agotarse, una cuenta en rojo), para que el criterio sea el
// mismo en web, móvil y la futura entrada por lenguaje natural. Única excepción:
// a partir de cuántos días sin cargar nada se recuerda, que es cosa de la pantalla
// (acá solo se informa cuántos días van).
//
// El período que se mira lo elige el servidor (el abierto o, si no hay, el más
// reciente): un widget no tiene selector de período. Todo está en la moneda base
// de la persona y toda consulta filtra por `userId`, que sale de la sesión.

import type { ClienteDb } from "@gestoria/db";
import { estadisticasComparativas } from "./comparaciones.ts";
import type { OpcionesDeCotizacion } from "./cotizaciones.ts";
import { listarCuentasFinancieras } from "./cuentas-financieras.ts";
import { type ResumenDeDeudas, resumenDeDeudas } from "./deudas.ts";
import { evolucionPorPeriodo, gastosPorCategoria } from "./estadisticas.ts";
import { obtenerMonedaBase } from "./moneda-base.ts";
import { listarMovimientos } from "./movimientos.ts";
import { obtenerPeriodoAnterior, obtenerUltimoPeriodo, type Periodo } from "./periodos.ts";
import { listarPresupuestos } from "./presupuestos.ts";
import { disponibleEnMonedaBase, totalesDelPeriodo } from "./resumen.ts";

const MS_POR_DIA = 24 * 60 * 60 * 1000;
/** Desde qué porcentaje gastado de un presupuesto se avisa que está por agotarse. */
const UMBRAL_POR_AGOTARSE = 80;
/** Cuántos presupuestos como máximo se listan en cada aviso: es un widget chico. */
const MAXIMO_DE_PRESUPUESTOS_AVISADOS = 3;
/** Cuántos de los últimos días se devuelven para el gráfico de gasto diario. */
const DIAS_DEL_GASTO_DIARIO = 7;
/** Cuántas categorías se devuelven para el ranking: es un widget chico. */
const CATEGORIAS_DEL_RANKING = 3;

export type PresupuestoAvisado = {
  nombre: string;
  /** Cuánto se pasó (positivo) o cuánto queda (positivo), según la lista en la que esté. */
  diferenciaCentavos: number;
  /** Lo gastado como % del límite, redondeado (85 es 85 %). */
  usadoPorcentaje: number;
};

export type WidgetsDelPeriodo = {
  nombre: string;
  abierto: boolean;
  /** Días (bloques de 24 h) que lleva el período; ver comparaciones.ts. */
  diasTranscurridos: number;
  ingresosCentavos: number;
  gastosCentavos: number;
  balanceCentavos: number;
  /** El período anterior, para comparar. Null si es el primero. */
  anterior: {
    nombre: string;
    balanceCentavos: number;
    /** Lo que se llevaba gastado en él a esta misma altura. */
    gastosAlMismoDiaCentavos: number;
  } | null;
  /** En lo que más se gastó. Null si el período no tiene gastos. */
  categoriaPrincipal: {
    nombre: string;
    color: string;
    totalCentavos: number;
    /** Qué % de los gastos del período es, redondeado. */
    porcentajeDelGasto: number;
  } | null;
  promedioPorDiaCentavos: number;
  cantidadDeMovimientos: number;
  /** Null si el período no tiene gastos. */
  gastoMasGrande: {
    importeCentavos: number;
    descripcion: string;
    categoria: string;
    fecha: Date;
  } | null;
  /** Las categorías con más gasto, de mayor a menor. */
  categoriasPrincipales: { nombre: string; color: string; totalCentavos: number }[];
  /** Ingresos y gastos de los últimos períodos (hasta 6), del más viejo al actual. */
  evolucion: { nombre: string; ingresosCentavos: number; gastosCentavos: number }[];
  /**
   * El gasto acumulado día a día en este período y en el anterior (el día 1 en el primer
   * lugar), para comparar el ritmo. Null si es el primer período. Un día sin dato (porque
   * todavía no llegó, o porque el período anterior ya había terminado) es null.
   */
  ritmo: { actualCentavos: (number | null)[]; anteriorCentavos: (number | null)[] } | null;
  /** Lo gastado en cada uno de los últimos días del período (hasta 7), del más viejo al más nuevo. */
  gastoDiarioCentavos: number[];
  presupuestos: {
    /** Los que ya se pasaron del límite, de los más pasados a los menos. */
    superados: PresupuestoAvisado[];
    /** Los que van por el 80 % o más sin pasarse, de los más cerca a los menos. */
    porAgotarse: PresupuestoAvisado[];
    /** Lo presupuestado y lo gastado en total (solo las categorías con límite). Null si no hay ninguno. */
    total: { presupuestadoCentavos: number; gastadoCentavos: number } | null;
    /** Todos los que tienen límite, del más usado al menos (hasta seis): la página de inicio los lista. */
    lista: {
      nombre: string;
      presupuestadoCentavos: number;
      gastadoCentavos: number;
      usadoPorcentaje: number;
    }[];
  };
  /** Días enteros desde el último movimiento cargado en el período. Null si no tiene ninguno. */
  diasDesdeElUltimoMovimiento: number | null;
};

export type WidgetsDeFinanzas = {
  monedaBase: string;
  disponible: {
    centavos: number;
    esEstimado: boolean;
    /** Monedas de cuentas sin cotización: esas cuentas no suman al disponible. */
    monedasSinCotizacion: string[];
  };
  /** Cuentas visibles con saldo negativo, en su propia moneda. */
  cuentasEnNegativo: { nombre: string; moneda: string; saldoCentavos: number }[];
  /** Null si la persona todavía no abrió ningún período. */
  periodo: WidgetsDelPeriodo | null;
  /** Lo que le deben y lo que debe, por moneda (módulo de contactos). */
  deudas: ResumenDeDeudas;
};

function avisarPresupuestos(
  presupuestos: Awaited<ReturnType<typeof listarPresupuestos>>,
): Omit<WidgetsDelPeriodo["presupuestos"], "total" | "lista"> {
  const superados: PresupuestoAvisado[] = [];
  const porAgotarse: PresupuestoAvisado[] = [];

  for (const presupuesto of presupuestos) {
    if (presupuesto.presupuestadoCentavos <= 0) continue;
    const usadoPorcentaje = Math.round(
      (presupuesto.gastadoCentavos / presupuesto.presupuestadoCentavos) * 100,
    );

    if (presupuesto.restanteCentavos < 0) {
      superados.push({
        nombre: presupuesto.nombre,
        diferenciaCentavos: -presupuesto.restanteCentavos,
        usadoPorcentaje,
      });
    } else if (usadoPorcentaje >= UMBRAL_POR_AGOTARSE) {
      porAgotarse.push({
        nombre: presupuesto.nombre,
        diferenciaCentavos: presupuesto.restanteCentavos,
        usadoPorcentaje,
      });
    }
  }

  return {
    superados: superados
      .sort((a, b) => b.usadoPorcentaje - a.usadoPorcentaje)
      .slice(0, MAXIMO_DE_PRESUPUESTOS_AVISADOS),
    porAgotarse: porAgotarse
      .sort((a, b) => b.usadoPorcentaje - a.usadoPorcentaje)
      .slice(0, MAXIMO_DE_PRESUPUESTOS_AVISADOS),
  };
}

/** Cuántos presupuestos van en la lista completa (los de inicio): el resto se ve en el módulo. */
const PRESUPUESTOS_EN_LA_LISTA = 6;

async function widgetsDelPeriodo(
  cliente: ClienteDb,
  userId: string,
  periodo: Periodo,
  ahora: Date,
): Promise<WidgetsDelPeriodo> {
  const [totales, anterior, comparativas, porCategoria, presupuestos, { movimientos }, evolucion] =
    await Promise.all([
      totalesDelPeriodo(cliente, userId, periodo.id),
      obtenerPeriodoAnterior(cliente, userId, periodo).then(async (previo) =>
        previo
          ? { nombre: previo.nombre, ...(await totalesDelPeriodo(cliente, userId, previo.id)) }
          : null,
      ),
      estadisticasComparativas(cliente, userId, periodo, ahora),
      gastosPorCategoria(cliente, userId, periodo.id),
      listarPresupuestos(cliente, userId, periodo.id),
      listarMovimientos(cliente, userId, { periodoId: periodo.id, limit: 1 }),
      evolucionPorPeriodo(cliente, userId, periodo),
    ]);

  const { ritmoDeGasto, datosRapidos } = comparativas;
  const mayorCategoria = porCategoria[0];
  const ultimoMovimiento = movimientos[0];
  const conLimite = presupuestos.filter((presupuesto) => presupuesto.presupuestadoCentavos > 0);

  // Lo gastado en cada día, a partir del acumulado: es lo que dibuja el gráfico de barras.
  const acumulado = ritmoDeGasto.puntos
    .slice(0, ritmoDeGasto.diasTranscurridos)
    .map((punto) => punto.actualCentavos ?? 0);
  const gastoDiarioCentavos = acumulado
    .map((total, dia) => total - (acumulado[dia - 1] ?? 0))
    .slice(-DIAS_DEL_GASTO_DIARIO);

  return {
    nombre: periodo.nombre,
    abierto: periodo.abierto,
    diasTranscurridos: ritmoDeGasto.diasTranscurridos,
    ...totales,
    balanceCentavos: totales.ingresosCentavos - totales.gastosCentavos,
    anterior:
      anterior && ritmoDeGasto.anterior
        ? {
            nombre: anterior.nombre,
            balanceCentavos: anterior.ingresosCentavos - anterior.gastosCentavos,
            gastosAlMismoDiaCentavos: ritmoDeGasto.anterior.acumuladoAlMismoDiaCentavos,
          }
        : null,
    categoriaPrincipal:
      mayorCategoria && totales.gastosCentavos > 0
        ? {
            nombre: mayorCategoria.nombre,
            color: mayorCategoria.color,
            totalCentavos: mayorCategoria.totalCentavos,
            porcentajeDelGasto: Math.round(
              (mayorCategoria.totalCentavos / totales.gastosCentavos) * 100,
            ),
          }
        : null,
    promedioPorDiaCentavos: datosRapidos.promedioPorDiaCentavos,
    cantidadDeMovimientos: datosRapidos.cantidadDeMovimientos,
    gastoMasGrande: datosRapidos.gastoMasGrande,
    categoriasPrincipales: porCategoria
      .slice(0, CATEGORIAS_DEL_RANKING)
      .map(({ nombre, color, totalCentavos }) => ({ nombre, color, totalCentavos })),
    evolucion: evolucion.map(({ nombre, ingresosCentavos, gastosCentavos }) => ({
      nombre,
      ingresosCentavos,
      gastosCentavos,
    })),
    ritmo: ritmoDeGasto.anterior
      ? {
          actualCentavos: ritmoDeGasto.puntos.map((punto) => punto.actualCentavos),
          anteriorCentavos: ritmoDeGasto.puntos.map((punto) => punto.anteriorCentavos),
        }
      : null,
    gastoDiarioCentavos,
    presupuestos: {
      ...avisarPresupuestos(presupuestos),
      total:
        conLimite.length === 0
          ? null
          : {
              presupuestadoCentavos: conLimite.reduce(
                (suma, p) => suma + p.presupuestadoCentavos,
                0,
              ),
              gastadoCentavos: conLimite.reduce((suma, p) => suma + p.gastadoCentavos, 0),
            },
      lista: conLimite
        .map((presupuesto) => ({
          nombre: presupuesto.nombre,
          presupuestadoCentavos: presupuesto.presupuestadoCentavos,
          gastadoCentavos: presupuesto.gastadoCentavos,
          usadoPorcentaje: Math.round(
            (presupuesto.gastadoCentavos / presupuesto.presupuestadoCentavos) * 100,
          ),
        }))
        .sort((a, b) => b.usadoPorcentaje - a.usadoPorcentaje || a.nombre.localeCompare(b.nombre))
        .slice(0, PRESUPUESTOS_EN_LA_LISTA),
    },
    diasDesdeElUltimoMovimiento: ultimoMovimiento
      ? Math.max(
          0,
          Math.floor((ahora.getTime() - new Date(ultimoMovimiento.fecha).getTime()) / MS_POR_DIA),
        )
      : null,
  };
}

/**
 * Los datos de los widgets de Finanzas. `opciones.ahora` es el instante de
 * referencia (cuántos días van, hace cuánto fue el último movimiento, la
 * cotización de hoy); se inyecta para poder probarlo.
 */
export async function obtenerWidgetsDeFinanzas(
  cliente: ClienteDb,
  userId: string,
  opciones: OpcionesDeCotizacion = {},
): Promise<WidgetsDeFinanzas> {
  const ahora = opciones.ahora ?? new Date();
  const [cuentas, monedaBase, periodo, deudas] = await Promise.all([
    listarCuentasFinancieras(cliente, userId),
    obtenerMonedaBase(cliente, userId),
    obtenerUltimoPeriodo(cliente, userId),
    resumenDeDeudas(cliente, userId),
  ]);

  // El disponible suma todas las cuentas, ocultas incluidas, igual que el resumen:
  // ocultar una cuenta no hace desaparecer su plata. En cambio no se avisa de una
  // cuenta oculta en rojo: la persona la sacó de su vista a propósito.
  const [disponible, delPeriodo] = await Promise.all([
    disponibleEnMonedaBase(cliente, cuentas, monedaBase, opciones),
    periodo ? widgetsDelPeriodo(cliente, userId, periodo, ahora) : null,
  ]);

  return {
    monedaBase,
    disponible: {
      centavos: disponible.disponibleCentavos,
      esEstimado: disponible.disponibleEsEstimado,
      monedasSinCotizacion: disponible.monedasSinCotizacion,
    },
    cuentasEnNegativo: cuentas
      .filter((cuenta) => !cuenta.oculta && cuenta.saldoCentavos < 0)
      .map(({ nombre, moneda, saldoCentavos }) => ({ nombre, moneda, saldoCentavos })),
    periodo: delPeriodo,
    deudas,
  };
}
