// Instancia de Better Auth conectada a la base del proyecto.
//
// Es una fabrica y no un singleton por la misma razon que crearApp y
// crearClienteDb: los tests necesitan una instancia apuntando a gestion_test.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import {
  ACCIONES_AUDITORIA,
  type AccionAuditoria,
  ESTADOS_CUENTA,
  type EstadoCuenta,
} from "@gestoria/shared";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import type { Mensajero } from "../correo/enviar.ts";
import { registrarAuditoria } from "../servicios/usuarios/auditoria.ts";
import { marcarPasswordCambiada } from "../servicios/usuarios/cuentas.ts";
import { opcionesAuthBase, verificacionesDeEntrada } from "./opciones.ts";

/** Que accion de auditoria corresponde a cada ruta de admin de Better Auth. */
const ACCION_DE_ADMIN_POR_RUTA: Partial<Record<string, AccionAuditoria>> = {
  "/admin/ban-user": ACCIONES_AUDITORIA.cuentaBloqueada,
  "/admin/unban-user": ACCIONES_AUDITORIA.cuentaDesbloqueada,
};

export type DependenciasAuth = {
  cliente: ClienteDb;
  secreto: string;
  urlBase: string;
  urlWeb: string;
  origenesConfiables: string[];
  enProduccion: boolean;
  mensajero: Mensajero;
};

export type Auth = ReturnType<typeof crearAuth>;

/**
 * Motivo por el que una cuenta no puede iniciar sesion, o null si puede.
 *
 * Los mensajes le dicen a la persona que pasa y que hacer, sin revelar nada que
 * sirva para enumerar cuentas: quien no tiene la contraseña correcta nunca llega
 * hasta aca, porque Better Auth valida las credenciales primero.
 */
function motivoDeRechazo(usuario: {
  estado: EstadoCuenta;
  banned: boolean | null;
}): { codigo: string; mensaje: string } | null {
  if (usuario.banned) {
    return {
      codigo: "CUENTA_BLOQUEADA",
      mensaje: "Tu cuenta está bloqueada. Escribinos si creés que es un error.",
    };
  }

  if (usuario.estado === ESTADOS_CUENTA.pendiente) {
    return {
      codigo: "CUENTA_PENDIENTE",
      mensaje: "Tu cuenta todavía está esperando aprobación. Te avisamos cuando esté lista.",
    };
  }

  if (usuario.estado === ESTADOS_CUENTA.rechazado) {
    return {
      codigo: "CUENTA_RECHAZADA",
      mensaje: "Tu solicitud de cuenta fue rechazada.",
    };
  }

  return null;
}

export function crearAuth(dependencias: DependenciasAuth) {
  const { cliente } = dependencias;

  /**
   * Efectos propios sobre rutas de Better Auth: apagar `debeCambiarPassword`
   * despues de un `/change-password` exitoso, y auditar bloquear/desbloquear
   * del panel de admin (`/admin/ban-user`, `/admin/unban-user`).
   *
   * Van como hook y no como endpoints propios porque esas rutas son de Better
   * Auth: la regla del proyecto es pasarle sus rutas crudas, nunca
   * reimplementarlas (apps/api/src/rutas/auth.ts). El reseteo de contraseña
   * del panel es la excepcion: tiene ruta propia porque necesita generar la
   * contraseña temporal en el servidor (apps/api/src/rutas/admin.ts).
   *
   * El hook `after` corre siempre, tambien cuando el endpoint fallo (por
   * ejemplo con la contraseña actual equivocada, o sin permiso de admin): la
   * sesion ya esta cargada en `ctx.context.session` antes de que el handler
   * valide nada. Por eso hace falta descartar el caso de error mirando
   * `ctx.context.returned`, que Better Auth deja en una instancia de
   * `APIError` cuando el endpoint tiro.
   */
  const despuesDeAutenticar = createAuthMiddleware(async (ctx) => {
    if (ctx.context.returned instanceof APIError) return;

    if (ctx.path === "/change-password") {
      const usuarioId = ctx.context.session?.user.id;
      if (usuarioId) {
        await marcarPasswordCambiada(cliente, usuarioId);
      }
      return;
    }

    const accion = ACCION_DE_ADMIN_POR_RUTA[ctx.path];
    if (!accion) return;

    const adminId = ctx.context.session?.user.id;
    const objetivoId = (ctx.body as { userId?: string } | undefined)?.userId;
    if (!adminId || !objetivoId) return;

    await registrarAuditoria(cliente, {
      adminId,
      accion,
      objetivoId,
      detalle:
        accion === ACCIONES_AUDITORIA.cuentaBloqueada
          ? ((ctx.body as { banReason?: string }).banReason ?? null)
          : null,
    });
  });

  return betterAuth({
    ...opcionesAuthBase({
      secreto: dependencias.secreto,
      urlBase: dependencias.urlBase,
      urlWeb: dependencias.urlWeb,
      origenesConfiables: dependencias.origenesConfiables,
      enProduccion: dependencias.enProduccion,
      mensajero: dependencias.mensajero,
    }),

    database: drizzleAdapter(cliente.db, {
      provider: "pg",
      schema: esquema,
    }),

    // Reemplaza el `hooks` de opcionesAuthBase (el spread no hace merge
    // profundo) para sumar el `after`, que necesita `cliente` y por eso no
    // puede vivir en opciones.ts (ver el comentario ahi arriba).
    hooks: {
      before: verificacionesDeEntrada,
      after: despuesDeAutenticar,
    },

    databaseHooks: {
      session: {
        create: {
          /**
           * Ultimo control antes de crear la sesion.
           *
           * Es el punto correcto para bloquear el login porque corre despues de
           * validar las credenciales y para *cualquier* forma de iniciar sesion
           * (usuario o correo), sin tener que acordarse de repetirlo en cada
           * endpoint. El middleware de la web vuelve a verificar el estado, pero
           * quien manda es este control del servidor.
           */
          before: async (sesion) => {
            const usuario = await cliente.db.query.usuarios.findFirst({
              where: (tabla, { eq }) => eq(tabla.id, sesion.userId),
              columns: { estado: true, banned: true },
            });

            if (!usuario) {
              throw new APIError("UNAUTHORIZED", {
                code: "CREDENCIALES_INVALIDAS",
                message: "Usuario o contraseña incorrectos.",
              });
            }

            const rechazo = motivoDeRechazo({
              estado: usuario.estado as EstadoCuenta,
              banned: usuario.banned,
            });

            if (rechazo) {
              throw new APIError("FORBIDDEN", {
                code: rechazo.codigo,
                message: rechazo.mensaje,
              });
            }

            return { data: sesion };
          },
        },
      },
    },
  });
}

/** Sesion y usuario tal como los devuelve Better Auth, con nuestros campos propios. */
export type Sesion = Auth["$Infer"]["Session"];
