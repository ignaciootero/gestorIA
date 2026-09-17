// Instancia de Better Auth conectada a la base del proyecto.
//
// Es una fabrica y no un singleton por la misma razon que crearApp y
// crearClienteDb: los tests necesitan una instancia apuntando a gestion_test.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import { ESTADOS_CUENTA, type EstadoCuenta } from "@gestoria/shared";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import type { Mensajero } from "../correo/enviar.ts";
import { opcionesAuthBase } from "./opciones.ts";

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
