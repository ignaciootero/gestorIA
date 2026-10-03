// Rutas del panel de admin: solicitudes de registro, listado de cuentas,
// reseteo de contraseña y auditoría.
//
// Bloquear y desbloquear NO tienen ruta acá: son de Better Auth
// (`/api/auth/admin/ban-user`, `/api/auth/admin/unban-user`) y la web las llama
// directo con el cliente, igual que ya hace con `changePassword`
// (apps/api/src/auth/crear-auth.ts tiene el porqué). Lo que sí es propio de
// acá es lo que Better Auth no sabe: nuestro estado de aprobación y el
// reseteo con contraseña generada en el servidor.
//
// Todas requieren sesión de admin: `exigirSesion` y `exigirAdmin` van antes de
// cada handler (CLAUDE.md, Permisos verificados en el backend).

import type { ClienteDb } from "@gestoria/db";
import { ACCIONES_AUDITORIA, ESTADOS_CUENTA, type EstadoCuenta } from "@gestoria/shared";
import { APIError } from "better-auth/api";
import { Hono } from "hono";
import { z } from "zod";
import type { Auth } from "../auth/crear-auth.ts";
import { traducirErrorDeAuth } from "../auth/traducir-errores.ts";
import { errores } from "../errores/error-api.ts";
import { exigirAdmin, exigirSesion } from "../middlewares/sesion.ts";
import { listarAuditoria, registrarAuditoria } from "../servicios/usuarios/auditoria.ts";
import {
  buscarCuentaPorId,
  buscarPerfilDeCuenta,
  cambiarEstadoDeCuentaPorId,
  cerrarSesionesDe,
  generarPasswordTemporal,
  listarCuentas,
  listarCuentasPendientes,
  marcarPasswordPendienteDeCambio,
} from "../servicios/usuarios/cuentas.ts";
import type { EntornoHono } from "../tipos.ts";

const esquemaListado = z.object({
  busqueda: z.string().trim().max(254).optional(),
  estado: z.enum(ESTADOS_CUENTA).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const esquemaListadoAuditoria = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  accion: z.enum(ACCIONES_AUDITORIA).optional(),
  // Formato de <input type="date">: "AAAA-MM-DD".
  desde: z.iso.date().optional(),
  hasta: z.iso.date().optional(),
});

const esquemaHistorialDeCuenta = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

function parametroInvalido(problema: z.ZodError): never {
  throw errores.validacion(
    problema.issues.map((issue) => ({
      campo: issue.path.join(".") || "(raíz)",
      mensaje: issue.message,
    })),
  );
}

export function rutasDeAdmin(cliente: ClienteDb, auth: Auth): Hono<EntornoHono> {
  const rutas = new Hono<EntornoHono>();

  rutas.use("/api/admin/*", exigirSesion, exigirAdmin);

  rutas.get("/api/admin/pendientes", async (c) => {
    const pendientes = await listarCuentasPendientes(cliente);
    return c.json({ cuentas: pendientes });
  });

  rutas.get("/api/admin/cuentas", async (c) => {
    const resultado = esquemaListado.safeParse(c.req.query());
    if (!resultado.success) parametroInvalido(resultado.error);

    const { cuentas, total } = await listarCuentas(cliente, resultado.data);
    return c.json({ cuentas, total });
  });

  rutas.get("/api/admin/cuentas/:id", async (c) => {
    const perfil = await buscarPerfilDeCuenta(cliente, c.req.param("id"));
    if (!perfil) throw errores.noEncontrado("No encontramos esa cuenta.");

    return c.json(perfil);
  });

  rutas.get("/api/admin/cuentas/:id/auditoria", async (c) => {
    const resultado = esquemaHistorialDeCuenta.safeParse(c.req.query());
    if (!resultado.success) parametroInvalido(resultado.error);

    const id = c.req.param("id");
    const cuenta = await buscarCuentaPorId(cliente, id);
    if (!cuenta) throw errores.noEncontrado("No encontramos esa cuenta.");

    const { entradas, total } = await listarAuditoria(cliente, {
      ...resultado.data,
      objetivoId: id,
    });
    return c.json({ entradas, total });
  });

  async function cambiarEstado(id: string, nuevoEstado: EstadoCuenta, adminId: string) {
    const cuenta = await buscarCuentaPorId(cliente, id);
    if (!cuenta) throw errores.noEncontrado("No encontramos esa cuenta.");

    const resultado = await cambiarEstadoDeCuentaPorId(cliente, id, nuevoEstado);

    if (resultado.estadoAnterior !== resultado.cuenta.estado) {
      await registrarAuditoria(cliente, {
        adminId,
        accion:
          nuevoEstado === ESTADOS_CUENTA.aprobado
            ? ACCIONES_AUDITORIA.cuentaAprobada
            : ACCIONES_AUDITORIA.cuentaRechazada,
        objetivoId: id,
      });
    }

    return resultado;
  }

  rutas.post("/api/admin/cuentas/:id/aprobar", async (c) => {
    const sesion = c.get("sesion");
    if (!sesion) throw errores.noAutenticado();

    const resultado = await cambiarEstado(
      c.req.param("id"),
      ESTADOS_CUENTA.aprobado,
      sesion.user.id,
    );
    return c.json(resultado);
  });

  rutas.post("/api/admin/cuentas/:id/rechazar", async (c) => {
    const sesion = c.get("sesion");
    if (!sesion) throw errores.noAutenticado();

    const resultado = await cambiarEstado(
      c.req.param("id"),
      ESTADOS_CUENTA.rechazado,
      sesion.user.id,
    );
    return c.json(resultado);
  });

  rutas.post("/api/admin/cuentas/:id/resetear-password", async (c) => {
    const sesion = c.get("sesion");
    if (!sesion) throw errores.noAutenticado();

    const id = c.req.param("id");

    if (id === sesion.user.id) {
      throw errores.validacion([], "No podés resetear tu propia contraseña desde acá.");
    }

    const cuenta = await buscarCuentaPorId(cliente, id);
    if (!cuenta) throw errores.noEncontrado("No encontramos esa cuenta.");

    const passwordTemporal = generarPasswordTemporal();

    try {
      await auth.api.setUserPassword({
        body: { userId: id, newPassword: passwordTemporal },
        headers: c.req.raw.headers,
      });
    } catch (error) {
      if (error instanceof APIError) {
        const traducido = traducirErrorDeAuth(
          error.statusCode,
          error.body,
          c.get("requestId") ?? "desconocido",
        );
        throw errores.validacion([], traducido.error.mensaje);
      }
      throw error;
    }

    // Better Auth no sabe de estas dos reglas propias: cambio obligatorio en el
    // próximo login y cierre de las sesiones que ya tenía abiertas.
    await marcarPasswordPendienteDeCambio(cliente, id);
    await cerrarSesionesDe(cliente, id);

    await registrarAuditoria(cliente, {
      adminId: sesion.user.id,
      accion: ACCIONES_AUDITORIA.passwordReseteada,
      objetivoId: id,
    });

    // Única vez que esta contraseña existe en texto plano fuera de su hash: no
    // se guarda en ningún lado, ni se loguea (docs/guias/seguridad-y-datos.md).
    return c.json({ passwordTemporal });
  });

  rutas.get("/api/admin/auditoria", async (c) => {
    const resultado = esquemaListadoAuditoria.safeParse(c.req.query());
    if (!resultado.success) parametroInvalido(resultado.error);

    const { desde, hasta, ...resto } = resultado.data;
    const { entradas, total } = await listarAuditoria(cliente, {
      ...resto,
      desde: desde ? new Date(`${desde}T00:00:00.000Z`) : undefined,
      hasta: hasta ? new Date(`${hasta}T23:59:59.999Z`) : undefined,
    });
    return c.json({ entradas, total });
  });

  return rutas;
}
