// Logica de negocio de las cuentas de usuario.
//
// Vive en servicios y no en las rutas ni en los scripts, para que el panel de
// admin (paso 5), los scripts de linea de comandos y la futura entrada por
// lenguaje natural usen exactamente las mismas reglas
// (CLAUDE.md, Principios de arquitectura).

import { randomBytes } from "node:crypto";
import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import { ESTADOS_CUENTA, type EstadoCuenta, ROLES } from "@gestoria/shared";
import { and, asc, count, desc, eq, ilike, max, or } from "drizzle-orm";

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

export type CuentaAdmin = ResumenCuenta & {
  bloqueada: boolean;
  motivoBloqueo: string | null;
  bloqueadaHasta: Date | null;
  /** Fecha de la solicitud, la aprobación o el rechazo, según `estado`. */
  estadoActualizadoEn: Date;
};

const LIMITE_MAXIMO_LISTADO = 100;

/**
 * Listado general de cuentas para el panel de admin: todos los estados,
 * buscable y paginado.
 *
 * A diferencia de `buscarCuenta` y `listarCuentasPendientes`, incluye el
 * bloqueo: es lo que el panel necesita mostrar y `/inicio` no.
 */
export async function listarCuentas(
  cliente: ClienteDb,
  opciones: {
    busqueda?: string | undefined;
    estado?: EstadoCuenta | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  } = {},
): Promise<{ cuentas: CuentaAdmin[]; total: number }> {
  const limit = Math.min(opciones.limit ?? 20, LIMITE_MAXIMO_LISTADO);
  const offset = opciones.offset ?? 0;
  const busqueda = opciones.busqueda?.trim();

  const condiciones = [
    opciones.estado ? eq(esquema.usuarios.estado, opciones.estado) : undefined,
    busqueda
      ? or(
          ilike(esquema.usuarios.username, `%${busqueda}%`),
          ilike(esquema.usuarios.email, `%${busqueda}%`),
          ilike(esquema.usuarios.nombre, `%${busqueda}%`),
          ilike(esquema.usuarios.apellido, `%${busqueda}%`),
        )
      : undefined,
  ].filter((condicion) => condicion !== undefined);

  const donde = condiciones.length > 0 ? and(...condiciones) : undefined;

  const [filas, [totalFila]] = await Promise.all([
    cliente.db.query.usuarios.findMany({
      where: () => donde,
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
        estadoActualizadoEn: true,
        banned: true,
        banReason: true,
        banExpires: true,
      },
      // Un solo campo alcanza para pendiente/aprobada/rechazada: mientras la
      // cuenta sigue pendiente coincide con la fecha de la solicitud, y en
      // cuanto se resuelve pasa a ser la fecha de esa resolución (ver el
      // comentario de la columna en packages/db/src/esquema/auth.ts).
      //
      // Descendente, a diferencia de Solicitudes (que va de la más vieja a la
      // más nueva, como una cola a procesar en orden): acá es un feed de
      // actividad, así que lo que se resolvió recién aparece primero.
      orderBy: (tabla) => desc(tabla.estadoActualizadoEn),
      limit,
      offset,
    }),
    cliente.db.select({ total: count() }).from(esquema.usuarios).where(donde),
  ]);

  return {
    cuentas: filas.map((fila) => ({
      id: fila.id,
      usuario: fila.username,
      email: fila.email,
      nombre: fila.nombre,
      apellido: fila.apellido,
      estado: fila.estado as EstadoCuenta,
      rol: fila.role,
      emailVerificado: fila.emailVerified,
      creadaEn: fila.createdAt,
      bloqueada: fila.banned,
      motivoBloqueo: fila.banReason,
      bloqueadaHasta: fila.banExpires,
      estadoActualizadoEn: fila.estadoActualizadoEn,
    })),
    total: totalFila?.total ?? 0,
  };
}

export type ResultadoCambioEstado = {
  cuenta: ResumenCuenta;
  estadoAnterior: EstadoCuenta;
  sesionesCerradas: number;
};

/** Busca una cuenta por su id, tal como lo tiene el panel tras listar. */
export async function buscarCuentaPorId(
  cliente: ClienteDb,
  id: string,
): Promise<ResumenCuenta | null> {
  const fila = await cliente.db.query.usuarios.findFirst({
    where: (tabla, { eq: eqCol }) => eqCol(tabla.id, id),
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

export type PerfilDeCuenta = CuentaAdmin & {
  zonaHoraria: string;
  monedaPorDefecto: string;
  debeCambiarPassword: boolean;
  /** Última vez que tuvo una sesión activa. null si nunca inició sesión. */
  ultimaConexion: Date | null;
};

/**
 * El perfil de una cuenta para el panel de admin: todos los datos que se
 * tienen de ella, para la pantalla a la que se llega al tocar su nombre en el
 * listado.
 *
 * `ultimaConexion` no es una columna propia: se calcula de la sesión más
 * reciente en vez de duplicar un dato que ya está ahí (y que se desactualizaría
 * si no se recordara tocarlo en cada inicio de sesión).
 */
export async function buscarPerfilDeCuenta(
  cliente: ClienteDb,
  id: string,
): Promise<PerfilDeCuenta | null> {
  const [fila, [ultimaSesion]] = await Promise.all([
    cliente.db.query.usuarios.findFirst({
      where: (tabla, { eq: eqCol }) => eqCol(tabla.id, id),
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
        estadoActualizadoEn: true,
        banned: true,
        banReason: true,
        banExpires: true,
        zonaHoraria: true,
        monedaPorDefecto: true,
        debeCambiarPassword: true,
      },
    }),
    cliente.db
      .select({ ultimaConexion: max(esquema.sesiones.updatedAt) })
      .from(esquema.sesiones)
      .where(eq(esquema.sesiones.userId, id)),
  ]);

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
    estadoActualizadoEn: fila.estadoActualizadoEn,
    bloqueada: fila.banned,
    motivoBloqueo: fila.banReason,
    bloqueadaHasta: fila.banExpires,
    zonaHoraria: fila.zonaHoraria,
    monedaPorDefecto: fila.monedaPorDefecto,
    debeCambiarPassword: fila.debeCambiarPassword,
    ultimaConexion: ultimaSesion?.ultimaConexion ?? null,
  };
}

/**
 * Cambia el estado de aprobacion de una cuenta ya resuelta.
 *
 * Al dejar de estar aprobada, se cierran todas sus sesiones abiertas: si no, la
 * persona seguiria navegando con la cookie que ya tenia hasta que expirara.
 */
async function aplicarCambioDeEstado(
  cliente: ClienteDb,
  cuenta: ResumenCuenta,
  nuevoEstado: EstadoCuenta,
): Promise<ResultadoCambioEstado> {
  const estadoAnterior = cuenta.estado;

  if (estadoAnterior === nuevoEstado) {
    return { cuenta, estadoAnterior, sesionesCerradas: 0 };
  }

  await cliente.db
    .update(esquema.usuarios)
    .set({ estado: nuevoEstado, estadoActualizadoEn: new Date(), updatedAt: new Date() })
    .where(eq(esquema.usuarios.id, cuenta.id));

  const sesionesCerradas =
    nuevoEstado === ESTADOS_CUENTA.aprobado ? [] : await cerrarSesionesDe(cliente, cuenta.id);

  return {
    cuenta: { ...cuenta, estado: nuevoEstado },
    estadoAnterior,
    sesionesCerradas: sesionesCerradas.length,
  };
}

/** La usa el script de linea de comandos: identifica la cuenta por usuario o correo. */
export async function cambiarEstadoDeCuenta(
  cliente: ClienteDb,
  identificador: string,
  nuevoEstado: EstadoCuenta,
): Promise<ResultadoCambioEstado> {
  const cuenta = await buscarCuenta(cliente, identificador);

  if (!cuenta) {
    throw new Error(`No hay ninguna cuenta con usuario o correo "${identificador}".`);
  }

  return aplicarCambioDeEstado(cliente, cuenta, nuevoEstado);
}

/** La usa el panel de admin: identifica la cuenta por id, como la tiene tras listar. */
export async function cambiarEstadoDeCuentaPorId(
  cliente: ClienteDb,
  id: string,
  nuevoEstado: EstadoCuenta,
): Promise<ResultadoCambioEstado> {
  const cuenta = await buscarCuentaPorId(cliente, id);

  if (!cuenta) {
    throw new Error(`No hay ninguna cuenta con id "${id}".`);
  }

  return aplicarCambioDeEstado(cliente, cuenta, nuevoEstado);
}

/**
 * Apaga el aviso de cambio de contraseña obligatorio, una vez que la persona ya
 * la cambio.
 *
 * La llama el hook de Better Auth en crear-auth.ts despues de un
 * `/change-password` exitoso.
 */
export async function marcarPasswordCambiada(cliente: ClienteDb, usuarioId: string): Promise<void> {
  await cliente.db
    .update(esquema.usuarios)
    .set({ debeCambiarPassword: false, updatedAt: new Date() })
    .where(eq(esquema.usuarios.id, usuarioId));
}

/** Funcion simetrica: la prende un reseteo de contraseña desde el panel de admin. */
export async function marcarPasswordPendienteDeCambio(
  cliente: ClienteDb,
  usuarioId: string,
): Promise<void> {
  await cliente.db
    .update(esquema.usuarios)
    .set({ debeCambiarPassword: true, updatedAt: new Date() })
    .where(eq(esquema.usuarios.id, usuarioId));
}

/**
 * Contraseña temporal para un reseteo de admin: al azar, no la elige nadie.
 *
 * 12 bytes de `crypto.randomBytes` (96 bits) en base64url dan 16 caracteres,
 * dentro del largo maximo de contraseña (24) y muy por encima del minimo (8).
 */
export function generarPasswordTemporal(): string {
  return randomBytes(12).toString("base64url");
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
