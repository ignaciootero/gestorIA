// Logica de negocio de las cuentas de usuario.
//
// Vive en servicios y no en las rutas ni en los scripts, para que el panel de
// admin (paso 5), los scripts de linea de comandos y la futura entrada por
// lenguaje natural usen exactamente las mismas reglas
// (CLAUDE.md, Principios de arquitectura).

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import { ESTADOS_CUENTA, type EstadoCuenta, ROLES } from "@gestoria/shared";
import { asc, eq, or } from "drizzle-orm";

export type ResumenCuenta = {
  id: string;
  usuario: string | null;
  email: string;
  nombre: string;
  apellido: string;
  estado: EstadoCuenta;
  rol: string;
  /** Si confirmó su correo. Hace falta, además de la aprobación, para entrar. */
  emailVerificado: boolean;
  creadaEn: Date;
};

/**
 * Busca una cuenta por usuario o por correo, indistintamente.
 *
 * Normaliza a minusculas porque asi se guardan: quien escribe "IOtero" o
 * "Nacho.Ote@Gmail.com" tiene que encontrar su cuenta igual.
 */
export async function buscarCuenta(
  cliente: ClienteDb,
  identificador: string,
): Promise<ResumenCuenta | null> {
  const normalizado = identificador.trim().toLowerCase();

  const fila = await cliente.db.query.usuarios.findFirst({
    where: (tabla) => or(eq(tabla.username, normalizado), eq(tabla.email, normalizado)),
    columns: {
      id: true,
      username: true,
      email: true,
      nombre: true,
      apellido: true,
      estado: true,
      role: true,
      emailVerified: true,
      createdAt: true,
    },
  });

  if (!fila) return null;

  return {
    id: fila.id,
    usuario: fila.username,
    email: fila.email,
    nombre: fila.nombre,
    apellido: fila.apellido,
    estado: fila.estado as EstadoCuenta,
    rol: fila.role,
    emailVerificado: fila.emailVerified,
    creadaEn: fila.createdAt,
  };
}

/** Solicitudes de registro sin resolver, de la mas vieja a la mas nueva. */
export async function listarCuentasPendientes(cliente: ClienteDb): Promise<ResumenCuenta[]> {
  const filas = await cliente.db.query.usuarios.findMany({
    where: (tabla) => eq(tabla.estado, ESTADOS_CUENTA.pendiente),
    columns: {
      id: true,
      username: true,
      email: true,
      nombre: true,
      apellido: true,
      estado: true,
      role: true,
      emailVerified: true,
      createdAt: true,
    },
    orderBy: (tabla) => asc(tabla.createdAt),
  });

  return filas.map((fila) => ({
    id: fila.id,
    usuario: fila.username,
    email: fila.email,
    nombre: fila.nombre,
    apellido: fila.apellido,
    estado: fila.estado as EstadoCuenta,
    rol: fila.role,
    emailVerificado: fila.emailVerified,
    creadaEn: fila.createdAt,
  }));
}

export type ResultadoCambioEstado = {
  cuenta: ResumenCuenta;
  estadoAnterior: EstadoCuenta;
  sesionesCerradas: number;
};

/**
 * Cambia el estado de aprobacion de una cuenta.
 *
 * Al dejar de estar aprobada, se cierran todas sus sesiones abiertas: si no, la
 * persona seguiria navegando con la cookie que ya tenia hasta que expirara.
 */
export async function cambiarEstadoDeCuenta(
  cliente: ClienteDb,
  identificador: string,
  nuevoEstado: EstadoCuenta,
): Promise<ResultadoCambioEstado> {
  const cuenta = await buscarCuenta(cliente, identificador);

  if (!cuenta) {
    throw new Error(`No hay ninguna cuenta con usuario o correo "${identificador}".`);
  }

  const estadoAnterior = cuenta.estado;

  if (estadoAnterior === nuevoEstado) {
    return { cuenta, estadoAnterior, sesionesCerradas: 0 };
  }

  await cliente.db
    .update(esquema.usuarios)
    .set({ estado: nuevoEstado, updatedAt: new Date() })
    .where(eq(esquema.usuarios.id, cuenta.id));

  const sesionesCerradas =
    nuevoEstado === ESTADOS_CUENTA.aprobado ? [] : await cerrarSesionesDe(cliente, cuenta.id);

  return {
    cuenta: { ...cuenta, estado: nuevoEstado },
    estadoAnterior,
    sesionesCerradas: sesionesCerradas.length,
  };
}

/** Cierra todas las sesiones abiertas de una cuenta. Devuelve las que cerro. */
export async function cerrarSesionesDe(
  cliente: ClienteDb,
  usuarioId: string,
): Promise<{ id: string }[]> {
  return cliente.db
    .delete(esquema.sesiones)
    .where(eq(esquema.sesiones.userId, usuarioId))
    .returning({ id: esquema.sesiones.id });
}

/**
 * Asciende una cuenta existente a admin aprobado y con el correo confirmado.
 *
 * Nunca se expone como endpoint: es lo que impide que alguien se vuelva admin
 * desde afuera (CLAUDE.md). Solo la llama el script de alta del primer admin.
 *
 * Se da el correo por confirmado porque la cuenta la crea, desde el servidor,
 * quien ya tiene acceso al `.env` y a la base. No hay nada que verificar: el
 * paso de verificación existe para probar que una dirección le pertenece a
 * quien se registró desde afuera. Sin esto, el primer admin quedaría sin poder
 * entrar y sin nadie que lo aprobara.
 */
export async function ascenderAAdmin(cliente: ClienteDb, usuarioId: string): Promise<void> {
  await cliente.db
    .update(esquema.usuarios)
    .set({
      role: ROLES.admin,
      estado: ESTADOS_CUENTA.aprobado,
      emailVerified: true,
      banned: false,
      updatedAt: new Date(),
    })
    .where(eq(esquema.usuarios.id, usuarioId));
}
