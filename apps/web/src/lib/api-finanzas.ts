// Cliente de las rutas del módulo de ingresos y gastos (apps/api/src/rutas/finanzas.ts).
//
// Mismo patrón que lib/api-admin.ts: un `pedir` genérico y una función por
// endpoint, con los tipos tal como los devuelve la API (fechas como string,
// que es lo que trae el JSON).

import type { DatosMovimiento } from "@gestoria/shared";
import type { ResumenDeDeudas } from "./api-deudas";
import { URL_API } from "./entorno";

export type { DatosMovimiento };

async function pedir<T>(ruta: string, opciones?: RequestInit): Promise<T> {
  const respuesta = await fetch(`${URL_API}${ruta}`, {
    credentials: "include",
    ...opciones,
    headers: { "content-type": "application/json", ...opciones?.headers },
  });

  if (!respuesta.ok) {
    throw await respuesta.json();
  }

  return respuesta.json() as Promise<T>;
}

// --- Categorías ---

export type Categoria = {
  /** Número que identifica a la categoría (nunca se le muestra a la persona). */
  id: number;
  nombre: string;
  color: string;
  /** "transferencia" en la categoría especial de las transferencias entre cuentas; null en las comunes. */
  sistema: "transferencia" | null;
  /** Cuántos movimientos la usan. Con alguno no se puede eliminar, solo reemplazar. */
  movimientos: number;
  creadoEn: string;
};

export function obtenerCategorias(): Promise<{ categorias: Categoria[] }> {
  return pedir("/api/finanzas/categorias");
}

/** Sin `color`, el servidor elige el más distinto de los que ya tiene la persona. */
export function crearCategoria(nombre: string, color?: string): Promise<Categoria> {
  return pedir("/api/finanzas/categorias", {
    method: "POST",
    body: JSON.stringify({ nombre, ...(color === undefined ? {} : { color }) }),
  });
}

export function renombrarCategoria(id: number, nombre: string, color: string): Promise<Categoria> {
  return pedir(`/api/finanzas/categorias/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ nombre, color }),
  });
}

/** Solo si no tiene movimientos: con alguno la API responde 409 (hay que reemplazarla). */
export function eliminarCategoria(id: number): Promise<{ ok: true }> {
  return pedir(`/api/finanzas/categorias/${id}`, { method: "DELETE" });
}

/** Todos sus movimientos pasan a una categoría existente o a una nueva, y la original se elimina. */
export function reemplazarCategoria(
  id: number,
  reemplazo: { porCategoriaId: number } | { nueva: { nombre: string; color?: string } },
): Promise<{ destino: Categoria; movimientosMovidos: number }> {
  return pedir(`/api/finanzas/categorias/${id}/reemplazar`, {
    method: "POST",
    body: JSON.stringify(reemplazo),
  });
}

// --- Cuentas ---

export type CuentaFinanciera = {
  id: string;
  nombre: string;
  /** Código ISO de la moneda de la cuenta ("UYU", "USD"...). Su saldo e importes están en ella. */
  moneda: string;
  saldoInicialCentavos: number;
  /** Saldo inicial + ingresos − gastos + ajustes manuales, en la moneda de la cuenta. */
  saldoCentavos: number;
  /** Oculta: no se ofrece al cargar movimientos nuevos, pero conserva saldo e historial. */
  oculta: boolean;
  /** Tiene movimientos (o le llegaron transferencias): no se puede eliminar, solo ocultar. */
  tieneMovimientos: boolean;
  creadoEn: string;
};

export function obtenerCuentas(): Promise<{ cuentas: CuentaFinanciera[] }> {
  return pedir("/api/finanzas/cuentas");
}

/** Sin `moneda` la cuenta nace en la moneda base de la persona. */
export function crearCuenta(
  nombre: string,
  saldoInicial: number,
  moneda?: string,
): Promise<CuentaFinanciera> {
  return pedir("/api/finanzas/cuentas", {
    method: "POST",
    body: JSON.stringify({ nombre, saldoInicial, ...(moneda === undefined ? {} : { moneda }) }),
  });
}

export function renombrarCuenta(id: string, nombre: string): Promise<{ id: string }> {
  return pedir(`/api/finanzas/cuentas/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ nombre }),
  });
}

export type AjusteDeSaldo = {
  id: string;
  fecha: string;
  saldoIndicadoCentavos: number;
  diferenciaCentavos: number;
};

/** "Hoy tengo $X": no es un movimiento, queda en el historial de la cuenta. */
export function ajustarSaldoDeCuenta(id: string, saldo: number): Promise<AjusteDeSaldo> {
  return pedir(`/api/finanzas/cuentas/${id}/ajustar-saldo`, {
    method: "POST",
    body: JSON.stringify({ saldo }),
  });
}

export function ocultarCuenta(id: string): Promise<CuentaFinanciera> {
  return pedir(`/api/finanzas/cuentas/${id}/ocultar`, { method: "POST" });
}

export function mostrarCuenta(id: string): Promise<CuentaFinanciera> {
  return pedir(`/api/finanzas/cuentas/${id}/mostrar`, { method: "POST" });
}

/** Un renglón del historial de una cuenta; `montoCentavos` es el efecto sobre el saldo, con signo. */
export type ItemDeHistorial =
  | {
      origen: "movimiento";
      id: string;
      fecha: string;
      montoCentavos: number;
      tipo: TipoMovimiento;
      descripcion: string;
      categoria: { nombre: string; color: string };
      /** El período al que pertenece el movimiento. */
      periodo: { nombre: string };
      /** Solo en una transferencia: de qué cuenta a cuál. */
      transferencia: { desde: string; hacia: string } | null;
      /** La conversión del movimiento: con qué tasa y a cuánto quedó. */
      cambio: {
        tipoDeCambio: number;
        manual: boolean;
        /** Ingreso o gasto: lo que vale en la moneda base. Transferencia: lo que llegó a la cuenta de destino. */
        convertidoCentavos: number;
        monedaDeOrigen: string;
        /** Solo en una transferencia: la moneda de la cuenta de destino. */
        monedaDeDestino: string | null;
      };
    }
  | {
      origen: "ajuste";
      id: string;
      fecha: string;
      montoCentavos: number;
      saldoIndicadoCentavos: number;
    }
  | {
      /** "Carga inicial": el saldo con el que se creó la cuenta. */
      origen: "saldo_inicial";
      id: string;
      fecha: string;
      montoCentavos: number;
    };

export function obtenerHistorialDeCuenta(
  id: string,
  paginacion: { limit: number; offset: number },
): Promise<{ items: ItemDeHistorial[]; total: number }> {
  return pedir(
    `/api/finanzas/cuentas/${id}/historial?limit=${paginacion.limit}&offset=${paginacion.offset}`,
  );
}

export function eliminarCuenta(id: string): Promise<{ ok: true }> {
  return pedir(`/api/finanzas/cuentas/${id}`, { method: "DELETE" });
}

// --- Períodos ---

export type Periodo = {
  /** Número interno: sirve para pedir y referenciar, nunca se le muestra a la persona. */
  id: number;
  nombre: string;
  /** Instante ISO 8601 (UTC). */
  aperturaEn: string;
  /** Instante ISO 8601 (UTC); nulo si el período está abierto. */
  cierreEn: string | null;
  abierto: boolean;
};

/** Un período tal como lo lista la API: además dice cuántos movimientos perdería al eliminarlo. */
export type PeriodoListado = Periodo & { cantidadMovimientos: number };

/** Del más nuevo al más viejo. */
export function obtenerPeriodos(): Promise<{ periodos: PeriodoListado[] }> {
  return pedir("/api/finanzas/periodos");
}

/** Sin `nombre` el servidor propone el del mes; sin `aperturaEn` abre ahora. */
export function abrirPeriodo(datos: { nombre?: string; aperturaEn?: string }): Promise<Periodo> {
  return pedir("/api/finanzas/periodos", { method: "POST", body: JSON.stringify(datos) });
}

/** Sin `cierreEn` cierra ahora (con la hora del servidor). */
export function cerrarPeriodo(id: number, cierreEn?: string): Promise<Periodo> {
  return pedir(`/api/finanzas/periodos/${id}/cerrar`, {
    method: "POST",
    body: JSON.stringify(cierreEn === undefined ? {} : { cierreEn }),
  });
}

/** Solo si no hay otro período abierto ni uno posterior (409 en otro caso). */
export function reabrirPeriodo(id: number): Promise<Periodo> {
  return pedir(`/api/finanzas/periodos/${id}/reabrir`, { method: "POST", body: "{}" });
}

/** Elimina el período y todos sus movimientos (las cuentas vuelven al saldo que tendrían sin ellos). */
export function eliminarPeriodo(id: number): Promise<{ ok: true; movimientosEliminados: number }> {
  return pedir(`/api/finanzas/periodos/${id}`, { method: "DELETE" });
}

export function renombrarPeriodo(id: number, nombre: string): Promise<Periodo> {
  return pedir(`/api/finanzas/periodos/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ nombre }),
  });
}

// --- Cotizaciones ---

export type Cotizacion = {
  /** Cuántas unidades de la moneda de destino vale 1 de la de origen. */
  tasa: number;
  /** El día de la cotización usada (AAAA-MM-DD). */
  fechaDeLaFuente: string;
  /** Es de un día anterior al pedido porque la fuente no respondió. */
  desactualizada: boolean;
};

/** La cotización sugerida entre dos monedas en una fecha (ISO 8601). Responde 503 si no hay ninguna. */
export function obtenerCotizacion(
  desde: string,
  hacia: string,
  fecha: string,
): Promise<Cotizacion> {
  return pedir(`/api/finanzas/cotizacion?${parametrosDe({ desde, hacia, fecha })}`);
}

// --- Movimientos ---

/** "neutro" es una transferencia entre dos cuentas: ni ingreso ni gasto. */
export type TipoMovimiento = "ingreso" | "gasto" | "neutro";

export type Movimiento = {
  id: string;
  tipo: TipoMovimiento;
  /** En la moneda de la cuenta (la de origen, en una transferencia). */
  importeCentavos: number;
  /** Cuántas unidades de la moneda a la que se convirtió vale 1 de la de la cuenta. */
  tipoDeCambio: number;
  /**
   * `importeCentavos` convertido: en un ingreso o gasto, a la moneda base (lo que suman los
   * totales); en una transferencia, lo que llega a la cuenta de destino.
   */
  importeConvertidoCentavos: number;
  /** La persona fijó la cotización (o el importe recibido) en vez de usar la del día. */
  cambioManual: boolean;
  descripcion: string;
  /** Instante ISO 8601 (UTC): fecha y hora del movimiento. */
  fecha: string;
  periodoId: number;
  creadoEn: string;
  categoria: { id: number; nombre: string; color: string };
  /** La cuenta del movimiento; en una transferencia, la de origen. */
  cuentaFinanciera: { id: string; nombre: string; moneda: string };
  /** Solo en una transferencia: la cuenta a la que llega la plata. */
  cuentaDestino: { id: string; nombre: string; moneda: string } | null;
  /** Con quién fue (a quién se le pagó, de quién se cobró). `eliminado`: el contacto está en la papelera. */
  contacto: { id: string; nombre: string; apellido: string | null; eliminado: boolean } | null;
};

export type FiltrosMovimientos = {
  periodoId?: number | undefined;
  categoriaId?: number | undefined;
  cuentaFinancieraId?: string | undefined;
  tipo?: TipoMovimiento | undefined;
  /** Los movimientos con este contacto. */
  contactoId?: string | undefined;
  busqueda?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
};

function parametrosDe(filtros: Record<string, string | number | undefined>): string {
  const parametros = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== "") parametros.set(clave, String(valor));
  }
  return parametros.toString();
}

export function obtenerMovimientos(
  filtros: FiltrosMovimientos = {},
): Promise<{ movimientos: Movimiento[]; total: number }> {
  return pedir(`/api/finanzas/movimientos?${parametrosDe(filtros)}`);
}

export function crearMovimiento(datos: DatosMovimiento): Promise<Movimiento> {
  return pedir("/api/finanzas/movimientos", { method: "POST", body: JSON.stringify(datos) });
}

export function editarMovimiento(id: string, datos: DatosMovimiento): Promise<Movimiento> {
  return pedir(`/api/finanzas/movimientos/${id}`, { method: "PATCH", body: JSON.stringify(datos) });
}

export function eliminarMovimiento(id: string): Promise<{ ok: true }> {
  return pedir(`/api/finanzas/movimientos/${id}`, { method: "DELETE" });
}

export function duplicarMovimiento(id: string): Promise<Movimiento> {
  return pedir(`/api/finanzas/movimientos/${id}/duplicar`, { method: "POST" });
}

// --- Resumen y estadísticas ---

export type Resumen = {
  periodo: Periodo;
  /** La moneda en la que está todo el resumen. */
  monedaBase: string;
  ingresosCentavos: number;
  gastosCentavos: number;
  balanceCentavos: number;
  disponibleCentavos: number;
  /** Alguna cuenta está en otra moneda: su parte del disponible sale de la cotización de hoy. */
  disponibleEsEstimado: boolean;
  /** Monedas de cuentas que no se pudieron convertir (sin cotización): no suman al disponible. */
  monedasSinCotizacion: string[];
  /** El período inmediatamente anterior, para comparar; nulo si es el primero. */
  periodoAnterior: { nombre: string; ingresosCentavos: number; gastosCentavos: number } | null;
  ultimosMovimientos: Movimiento[];
};

export function obtenerResumen(periodoId: number): Promise<Resumen> {
  return pedir(`/api/finanzas/resumen?periodoId=${periodoId}`);
}

export type GastoPorCategoria = {
  categoriaId: number;
  nombre: string;
  color: string;
  totalCentavos: number;
};
export type PeriodoDeEvolucion = {
  periodoId: number;
  nombre: string;
  ingresosCentavos: number;
  gastosCentavos: number;
  /** Ingresos menos gastos: positivo si sobró, negativo si se gastó de más. */
  balanceCentavos: number;
};

export type VariacionDeCategoria = {
  categoriaId: number;
  nombre: string;
  color: string;
  actualCentavos: number;
  anteriorCentavos: number;
  /** Actual menos anterior: positivo si se gastó más, negativo si se gastó menos. */
  diferenciaCentavos: number;
  /** La diferencia como % de lo gastado antes (25,5 es 25,5 %); null si antes no se gastó nada. */
  porcentaje: number | null;
};
export type VariacionPorCategoria = {
  periodoAnterior: string;
  /** De la que más cambió a la que menos; no incluye las que quedaron igual. */
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
  diasTranscurridos: number;
  /** Lo gastado en el período hasta hoy. */
  acumuladoCentavos: number;
  /** Null si es el primer período. */
  anterior: { nombre: string; acumuladoAlMismoDiaCentavos: number } | null;
  puntos: PuntoDeRitmo[];
};
export type DatosRapidos = {
  promedioPorDiaCentavos: number;
  /** Ingresos y gastos del período (las transferencias no cuentan). */
  cantidadDeMovimientos: number;
  /** Null si el período no tiene gastos. La fecha viaja como texto ISO. */
  gastoMasGrande: {
    importeCentavos: number;
    descripcion: string;
    categoria: string;
    fecha: string;
  } | null;
};
export type Estadisticas = {
  gastosPorCategoria: GastoPorCategoria[];
  evolucionPorPeriodo: PeriodoDeEvolucion[];
  /** Null si es el primer período. */
  variacionPorCategoria: VariacionPorCategoria | null;
  ritmoDeGasto: RitmoDeGasto;
  datosRapidos: DatosRapidos;
};

export function obtenerEstadisticas(periodoId: number): Promise<Estadisticas> {
  return pedir(`/api/finanzas/estadisticas?periodoId=${periodoId}`);
}

export type PuntoDeCategoria = {
  periodoId: number;
  nombre: string;
  /** Lo gastado (o ingresado, según el tipo) en la categoría en ese período; 0 si no hubo. */
  totalCentavos: number;
  /** Los ingresos de todo el período. */
  ingresosCentavos: number;
  /** El total de la categoría como % de los ingresos del período (12,5 es 12,5 %); null sin ingresos. */
  porcentajeDeIngresos: number | null;
};

export type EvolucionDeCategoria = {
  /** Del período más viejo al más nuevo, terminando en el elegido. */
  periodos: PuntoDeCategoria[];
  /** El límite de la categoría, o null si no tiene presupuesto. */
  presupuestoCentavos: number | null;
};

/**
 * Lo gastado en una categoría en los últimos períodos hasta el elegido (hasta 12). La API
 * también sabe dar lo ingresado (`tipo=ingreso`), pero la pantalla solo muestra gastos.
 */
export function obtenerEvolucionDeCategoria(
  periodoId: number,
  categoriaId: number,
): Promise<EvolucionDeCategoria> {
  return pedir(
    `/api/finanzas/estadisticas/categoria?periodoId=${periodoId}&categoriaId=${categoriaId}&tipo=gasto`,
  );
}

// --- Widgets ---

export type PresupuestoAvisado = {
  nombre: string;
  /** Lo que se pasó (en "superados") o lo que queda (en "por agotarse"), siempre positivo. */
  diferenciaCentavos: number;
  /** Lo gastado como % del límite, redondeado. */
  usadoPorcentaje: number;
};

export type WidgetsDelPeriodo = {
  nombre: string;
  abierto: boolean;
  diasTranscurridos: number;
  ingresosCentavos: number;
  gastosCentavos: number;
  balanceCentavos: number;
  anterior: {
    nombre: string;
    balanceCentavos: number;
    /** Lo que se llevaba gastado en el anterior a esta misma altura. */
    gastosAlMismoDiaCentavos: number;
  } | null;
  categoriaPrincipal: {
    nombre: string;
    color: string;
    totalCentavos: number;
    porcentajeDelGasto: number;
  } | null;
  promedioPorDiaCentavos: number;
  cantidadDeMovimientos: number;
  gastoMasGrande: {
    importeCentavos: number;
    descripcion: string;
    categoria: string;
    /** Instante ISO 8601 (UTC). */
    fecha: string;
  } | null;
  /** Las categorías con más gasto, de mayor a menor (hasta tres). */
  categoriasPrincipales: { nombre: string; color: string; totalCentavos: number }[];
  /** Ingresos y gastos de los últimos períodos (hasta 6), del más viejo al actual. */
  evolucion: { nombre: string; ingresosCentavos: number; gastosCentavos: number }[];
  /** Gasto acumulado día a día en este período y en el anterior; null si es el primero. */
  ritmo: { actualCentavos: (number | null)[]; anteriorCentavos: (number | null)[] } | null;
  /** Lo gastado en cada uno de los últimos días (hasta 7), del más viejo al más nuevo. */
  gastoDiarioCentavos: number[];
  presupuestos: {
    superados: PresupuestoAvisado[];
    porAgotarse: PresupuestoAvisado[];
    /** Lo presupuestado y lo gastado en esas categorías; null si no hay ningún límite fijado. */
    total: { presupuestadoCentavos: number; gastadoCentavos: number } | null;
  };
  /** Null si el período no tiene ningún movimiento. */
  diasDesdeElUltimoMovimiento: number | null;
};

export type WidgetsDeFinanzas = {
  monedaBase: string;
  disponible: { centavos: number; esEstimado: boolean; monedasSinCotizacion: string[] };
  cuentasEnNegativo: { nombre: string; moneda: string; saldoCentavos: number }[];
  /** Null si todavía no se abrió ningún período. */
  periodo: WidgetsDelPeriodo | null;
  /** Lo que le deben y lo que debe, por moneda. */
  deudas: ResumenDeDeudas;
};

/** Todo lo que muestran los widgets, en un solo pedido; el servidor elige el período. */
export function obtenerWidgets(): Promise<WidgetsDeFinanzas> {
  return pedir("/api/finanzas/widgets");
}

// --- Presupuestos ---

export type Presupuesto = {
  categoriaId: number;
  nombre: string;
  presupuestadoCentavos: number;
  gastadoCentavos: number;
  restanteCentavos: number;
};

export function obtenerPresupuestos(periodoId: number): Promise<{ presupuestos: Presupuesto[] }> {
  return pedir(`/api/finanzas/presupuestos?periodoId=${periodoId}`);
}

export function fijarPresupuesto(categoriaId: number, monto: number): Promise<{ ok: true }> {
  return pedir(`/api/finanzas/presupuestos/${categoriaId}`, {
    method: "PUT",
    body: JSON.stringify({ monto }),
  });
}

export function eliminarPresupuesto(categoriaId: number): Promise<{ ok: true }> {
  return pedir(`/api/finanzas/presupuestos/${categoriaId}`, { method: "DELETE" });
}
