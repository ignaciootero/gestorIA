// Utilidades de prueba especificas de autenticacion.
//
// Registran e inician sesion pasando por los endpoints reales de la API, no por
// inserts directos: si el flujo de registro se rompe, los tests que dependen de
// el tienen que romperse tambien.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import { ESTADOS_CUENTA, type EstadoCuenta } from "@gestoria/shared";
import { crearUsuarioDePrueba, type DatosUsuarioDePrueba } from "@gestoria/testing";
import { eq, sql } from "drizzle-orm";
import type { Hono } from "hono";
import { RUTA_BASE_AUTH } from "../auth/opciones.ts";
import type { EntornoHono } from "../tipos.ts";

type App = Hono<EntornoHono>;

/**
 * Vacia todas las tablas de autenticacion.
 *
 * Cada test arranca de un estado conocido y no depende del orden de ejecucion
 * (docs/guias/testing.md). Incluye la tabla de rate limiting: si no, el limite
 * de registros por hora haría fallar a los tests que corren despues.
 */
export async function limpiarBase(cliente: ClienteDb): Promise<void> {
  await cliente.db.execute(
    sql`truncate table ${esquema.usuarios}, ${esquema.sesiones}, ${esquema.cuentas}, ${esquema.verificaciones}, ${esquema.limitesPeticiones}, ${esquema.ajustesDeSaldo}, ${esquema.movimientos}, ${esquema.periodos}, ${esquema.presupuestos}, ${esquema.cuentasFinancieras}, ${esquema.categorias}, ${esquema.cotizaciones}, ${esquema.contactos}, ${esquema.etiquetasDeContactos}, ${esquema.recordatoriosDeContactos}, ${esquema.deudas}, ${esquema.pagosDeDeudas}, ${esquema.tareas}, ${esquema.tareasRepetitivas}, ${esquema.categoriasDeTareas}, ${esquema.eventosDeCalendario}, ${esquema.filtrosDelCalendario} restart identity cascade`,
  );
}

export async function registrar(
  app: App,
  datos: Partial<DatosUsuarioDePrueba> & { honeypot?: string } = {},
): Promise<{ respuesta: Response; datos: DatosUsuarioDePrueba }> {
  const completos = crearUsuarioDePrueba(datos);

  const respuesta = await app.request(`${RUTA_BASE_AUTH}/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: completos.email,
      password: completos.password,
      name: `${completos.nombre} ${completos.apellido}`,
      username: completos.usuario,
      nombre: completos.nombre,
      apellido: completos.apellido,
      ...(datos.honeypot === undefined ? {} : { honeypot: datos.honeypot }),
    }),
  });

  return { respuesta, datos: completos };
}

/** Inicia sesion con usuario (no con correo). */
export async function entrarConUsuario(
  app: App,
  usuario: string,
  password: string,
): Promise<Response> {
  return await app.request(`${RUTA_BASE_AUTH}/sign-in/username`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: usuario, password }),
  });
}

/** Inicia sesion con correo. */
export async function entrarConEmail(app: App, email: string, password: string): Promise<Response> {
  return await app.request(`${RUTA_BASE_AUTH}/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

/** Marca el correo como confirmado, como si la persona hubiera tocado el enlace. */
export async function verificarEmail(cliente: ClienteDb, email: string): Promise<void> {
  await cliente.db
    .update(esquema.usuarios)
    .set({ emailVerified: true })
    .where(eq(esquema.usuarios.email, email));
}

/** Cambia el estado de una cuenta directamente en la base, para preparar un caso. */
export async function ponerEstado(
  cliente: ClienteDb,
  email: string,
  estado: EstadoCuenta,
): Promise<void> {
  await cliente.db
    .update(esquema.usuarios)
    .set({ estado })
    .where(eq(esquema.usuarios.email, email));
}

/** Marca una cuenta para que tenga que cambiar la contraseña, como haria un reseteo. */
export async function ponerDebeCambiarPassword(cliente: ClienteDb, email: string): Promise<void> {
  await cliente.db
    .update(esquema.usuarios)
    .set({ debeCambiarPassword: true })
    .where(eq(esquema.usuarios.email, email));
}

/** Bloquea una cuenta, como haria el panel de admin. */
export async function bloquear(cliente: ClienteDb, email: string): Promise<void> {
  await cliente.db
    .update(esquema.usuarios)
    .set({ banned: true, banReason: "prueba" })
    .where(eq(esquema.usuarios.email, email));
}

/**
 * Registra una cuenta y la deja lista para entrar: correo confirmado y aprobada.
 *
 * Hacen falta las dos cosas; con una sola el login se rechaza. Los tests que
 * quieren probar cada requisito por separado usan las opciones.
 */
export async function registrarAprobado(
  app: App,
  cliente: ClienteDb,
  datos: Partial<DatosUsuarioDePrueba> & {
    honeypot?: string;
    estado?: EstadoCuenta;
    emailVerificado?: boolean;
  } = {},
): Promise<DatosUsuarioDePrueba> {
  const { estado = ESTADOS_CUENTA.aprobado, emailVerificado = true, ...restoDatos } = datos;

  const { datos: completos } = await registrar(app, restoDatos);
  await ponerEstado(cliente, completos.email, estado);

  if (emailVerificado) {
    await verificarEmail(cliente, completos.email);
  }

  return completos;
}

/** Extrae las cookies de una respuesta para reenviarlas en la siguiente peticion. */
export function cookiesDe(respuesta: Response): string {
  return respuesta.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}
