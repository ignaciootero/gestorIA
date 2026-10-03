// Cliente de las rutas propias del panel de admin (apps/api/src/rutas/admin.ts).
//
// Bloquear, desbloquear y listar sesiones NO están acá: esas son de Better
// Auth y el panel las llama directo con `authCliente.admin.*`
// (apps/web/src/lib/auth-cliente.ts).

import type { AccionAuditoria, EstadoCuenta } from "@gestoria/shared";
import { URL_API } from "./entorno";

async function pedir<T>(ruta: string, opciones?: RequestInit): Promise<T> {
  const respuesta = await fetch(`${URL_API}${ruta}`, { credentials: "include", ...opciones });

  if (!respuesta.ok) {
    throw await respuesta.json();
  }

  return respuesta.json() as Promise<T>;
}

export type CuentaResumen = {
  id: string;
  usuario: string | null;
  email: string;
  nombre: string;
  apellido: string;
  estado: EstadoCuenta;
  rol: string;
  emailVerificado: boolean;
  creadaEn: string;
};

export type CuentaAdmin = CuentaResumen & {
  bloqueada: boolean;
  motivoBloqueo: string | null;
  bloqueadaHasta: string | null;
  /** Fecha de la solicitud, la aprobación o el rechazo, según `estado`. */
  estadoActualizadoEn: string;
};

export function obtenerPendientes(): Promise<{ cuentas: CuentaResumen[] }> {
  return pedir("/api/admin/pendientes");
}

export function obtenerCuentas(opciones: {
  busqueda?: string;
  estado?: EstadoCuenta | "";
  limit?: number;
  offset?: number;
}): Promise<{ cuentas: CuentaAdmin[]; total: number }> {
  const parametros = new URLSearchParams();
  if (opciones.busqueda) parametros.set("busqueda", opciones.busqueda);
  if (opciones.estado) parametros.set("estado", opciones.estado);
  if (opciones.limit) parametros.set("limit", String(opciones.limit));
  if (opciones.offset) parametros.set("offset", String(opciones.offset));

  return pedir(`/api/admin/cuentas?${parametros.toString()}`);
}

export type PerfilDeCuenta = CuentaAdmin & {
  zonaHoraria: string;
  monedaPorDefecto: string;
  debeCambiarPassword: boolean;
  /** null si nunca inició sesión. */
  ultimaConexion: string | null;
};

export function obtenerPerfilDeCuenta(id: string): Promise<PerfilDeCuenta> {
  return pedir(`/api/admin/cuentas/${id}`);
}

export function aprobarCuenta(id: string): Promise<unknown> {
  return pedir(`/api/admin/cuentas/${id}/aprobar`, { method: "POST" });
}

export function rechazarCuenta(id: string): Promise<unknown> {
  return pedir(`/api/admin/cuentas/${id}/rechazar`, { method: "POST" });
}

export function resetearPassword(id: string): Promise<{ passwordTemporal: string }> {
  return pedir(`/api/admin/cuentas/${id}/resetear-password`, { method: "POST" });
}

export type PersonaEnAuditoria = { id: string; usuario: string | null; email: string };

export type EntradaAuditoria = {
  id: string;
  accion: AccionAuditoria;
  detalle: string | null;
  creadoEn: string;
  admin: PersonaEnAuditoria | null;
  objetivo: PersonaEnAuditoria | null;
};

export function obtenerAuditoria(opciones: {
  limit?: number;
  offset?: number;
  accion?: AccionAuditoria | "";
  /** "AAAA-MM-DD", tal como lo da un <input type="date">. */
  desde?: string;
  hasta?: string;
}): Promise<{ entradas: EntradaAuditoria[]; total: number }> {
  const parametros = new URLSearchParams();
  if (opciones.limit) parametros.set("limit", String(opciones.limit));
  if (opciones.offset) parametros.set("offset", String(opciones.offset));
  if (opciones.accion) parametros.set("accion", opciones.accion);
  if (opciones.desde) parametros.set("desde", opciones.desde);
  if (opciones.hasta) parametros.set("hasta", opciones.hasta);

  return pedir(`/api/admin/auditoria?${parametros.toString()}`);
}

export function obtenerAuditoriaDeCuenta(
  id: string,
  opciones: { limit?: number; offset?: number },
): Promise<{ entradas: EntradaAuditoria[]; total: number }> {
  const parametros = new URLSearchParams();
  if (opciones.limit) parametros.set("limit", String(opciones.limit));
  if (opciones.offset) parametros.set("offset", String(opciones.offset));

  return pedir(`/api/admin/cuentas/${id}/auditoria?${parametros.toString()}`);
}
