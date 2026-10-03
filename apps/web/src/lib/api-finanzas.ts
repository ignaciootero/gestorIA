// Cliente de las rutas del módulo de ingresos y gastos (apps/api/src/rutas/finanzas.ts).
//
// Mismo patrón que lib/api-admin.ts: un `pedir` genérico y una función por
// endpoint, con los tipos tal como los devuelve la API (fechas como string,
// que es lo que trae el JSON).

import type { DatosMovimiento } from "@gestoria/shared";
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
  saldoInicialCentavos: number;
  /** Saldo inicial + ingresos − gastos + ajustes manuales. */
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

export function crearCuenta(nombre: string, saldoInicial: number): Promise<CuentaFinanciera> {
  return pedir("/api/finanzas/cuentas", {
    method: "POST",
    body: JSON.stringify({ nombre, saldoInicial }),
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

// --- Movimientos ---

/** "neutro" es una transferencia entre dos cuentas: ni ingreso ni gasto. */
export type TipoMovimiento = "ingreso" | "gasto" | "neutro";

export type Movimiento = {
  id: string;
  tipo: TipoMovimiento;
  importeCentavos: number;
  descripcion: string;
  /** Instante ISO 8601 (UTC): fecha y hora del movimiento. */
  fecha: string;
  periodoId: number;
  creadoEn: string;
  categoria: { id: number; nombre: string; color: string };
  /** La cuenta del movimiento; en una transferencia, la de origen. */
  cuentaFinanciera: { id: string; nombre: string };
  /** Solo en una transferencia: la cuenta a la que llega la plata. */
  cuentaDestino: { id: string; nombre: string } | null;
};

export type FiltrosMovimientos = {
  periodoId?: number | undefined;
  categoriaId?: number | undefined;
  cuentaFinancieraId?: string | undefined;
  tipo?: TipoMovimiento | undefined;
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
  ingresosCentavos: number;
  gastosCentavos: number;
  balanceCentavos: number;
  disponibleCentavos: number;
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
};

export function obtenerEstadisticas(periodoId: number): Promise<{
  gastosPorCategoria: GastoPorCategoria[];
  evolucionPorPeriodo: PeriodoDeEvolucion[];
}> {
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

/** Qué se mira de una categoría: lo gastado o lo ingresado (una misma categoría puede tener las dos cosas). */
export type TipoDeEvolucion = "gasto" | "ingreso";

export type EvolucionDeCategoria = {
  tipo: TipoDeEvolucion;
  /** Del período más viejo al más nuevo, terminando en el elegido. */
  periodos: PuntoDeCategoria[];
  /** El límite de la categoría, o null si no tiene presupuesto (o si se miran ingresos). */
  presupuestoCentavos: number | null;
};

/** Lo gastado o ingresado en una categoría en los últimos períodos hasta el elegido (hasta 12). */
export function obtenerEvolucionDeCategoria(
  periodoId: number,
  categoriaId: number,
  tipo: TipoDeEvolucion,
): Promise<EvolucionDeCategoria> {
  return pedir(
    `/api/finanzas/estadisticas/categoria?periodoId=${periodoId}&categoriaId=${categoriaId}&tipo=${tipo}`,
  );
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
