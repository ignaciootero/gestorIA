// Cliente de las rutas de deudas y préstamos (apps/api/src/rutas/deudas.ts).
//
// Mismo patrón que lib/api-finanzas.ts. Los importes viajan en la unidad normal (pesos) al
// pedir y vuelven en centésimos, como el resto de Finanzas.

import {
  type DatosDeDeuda,
  type DatosDePagoDeDeuda,
  type DatosEditarDeuda,
  formatearMonto,
  nombreCompletoDeContacto,
  type SentidoDeDeuda,
  type TipoDeContacto,
} from "@gestoria/shared";
import { URL_API } from "./entorno";

export type { DatosDeDeuda, DatosDePagoDeDeuda, DatosEditarDeuda, SentidoDeDeuda };

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

export type PagoDeDeuda = {
  id: string;
  montoCentavos: number;
  fecha: string;
  /** El ingreso o gasto que generó este pago, si lo hay y sigue vigente. */
  movimiento: { id: string; tipo: "ingreso" | "gasto"; cuenta: string } | null;
};

export type Deuda = {
  id: string;
  /** Con quién, si es un contacto. Null si la deuda es con alguien que no está en los contactos. */
  contacto: {
    id: string;
    tipo: TipoDeContacto;
    nombre: string;
    apellido: string | null;
    /** El contacto está en la papelera. */
    eliminado: boolean;
  } | null;
  /** Con quién, si no es un contacto: el nombre que se escribió. */
  nombreLibre: string | null;
  sentido: SentidoDeDeuda;
  concepto: string;
  /** El total original, en centésimos de `moneda`. */
  montoCentavos: number;
  moneda: string;
  /** El día en que se originó. "AAAA-MM-DD". */
  fecha: string;
  /** Hasta qué día debería saldarse. "AAAA-MM-DD", o null si no se puso. */
  fechaLimite: string | null;
  pagadoCentavos: number;
  /** Lo que falta. 0 es saldada. */
  pendienteCentavos: number;
  saldada: boolean;
  creadoEn: string;
};

export type DeudaConPagos = Deuda & { pagos: PagoDeDeuda[] };

/** Con quién es la deuda, para mostrar: el nombre del contacto o el que se escribió. */
export function nombreDeLaDeuda(deuda: Pick<Deuda, "contacto" | "nombreLibre">): string {
  return deuda.contacto ? nombreCompletoDeContacto(deuda.contacto) : (deuda.nombreLibre ?? "");
}

export type TotalPorMoneda = { moneda: string; centavos: number; deudas: number };

export type ResumenDeDeudas = {
  meDeben: TotalPorMoneda[];
  debo: TotalPorMoneda[];
  /** Cuántos contactos distintos tienen una deuda pendiente. */
  contactos: number;
};

/** Cuánto es, escrito para todas las monedas sin mezclarlas: "$ 5.000,00 · US$ 100,00". */
export function totalesEnPalabras(totales: TotalPorMoneda[]): string {
  return totales.map((total) => formatearMonto(total.centavos, total.moneda)).join(" · ");
}

export type EstadoDeDeuda = "pendientes" | "saldadas" | "todas";

export type FiltrosDeDeudas = {
  contactoId?: string | undefined;
  sentido?: SentidoDeDeuda | undefined;
  estado?: EstadoDeDeuda | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
};

function consulta(filtros: Record<string, string | number | undefined>): string {
  const parametros = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== "") parametros.set(clave, String(valor));
  }
  const texto = parametros.toString();
  return texto === "" ? "" : `?${texto}`;
}

export function obtenerDeudas(
  filtros: FiltrosDeDeudas = {},
): Promise<{ deudas: Deuda[]; total: number }> {
  return pedir(`/api/finanzas/deudas${consulta({ ...filtros })}`);
}

export function obtenerResumenDeDeudas(): Promise<ResumenDeDeudas> {
  return pedir("/api/finanzas/deudas/resumen");
}

export function obtenerDeuda(id: string): Promise<DeudaConPagos> {
  return pedir(`/api/finanzas/deudas/${id}`);
}

export function crearDeuda(datos: DatosDeDeuda): Promise<DeudaConPagos> {
  return pedir("/api/finanzas/deudas", { method: "POST", body: JSON.stringify(datos) });
}

export function editarDeuda(id: string, datos: DatosEditarDeuda): Promise<DeudaConPagos> {
  return pedir(`/api/finanzas/deudas/${id}`, { method: "PUT", body: JSON.stringify(datos) });
}

export function eliminarDeuda(id: string): Promise<{ ok: true }> {
  return pedir(`/api/finanzas/deudas/${id}`, { method: "DELETE" });
}

export function registrarPago(id: string, datos: DatosDePagoDeDeuda): Promise<DeudaConPagos> {
  return pedir(`/api/finanzas/deudas/${id}/pagos`, {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function eliminarPago(id: string, pagoId: string): Promise<DeudaConPagos> {
  return pedir(`/api/finanzas/deudas/${id}/pagos/${pagoId}`, { method: "DELETE" });
}
