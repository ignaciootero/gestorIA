// Opciones de Better Auth, sin la parte de base de datos.
//
// Estan separadas para que las compartan la instancia que usa la API y la que
// lee el CLI de Better Auth al generar el esquema (better-auth.config.ts).
//
// Reglas que implementa, todas de CLAUDE.md y docs/guias/seguridad-y-datos.md:
// - registro publico pero con aprobacion manual, sin inicio de sesion automatico;
// - para entrar hacen falta DOS cosas: correo verificado y cuenta aprobada;
// - toda entrada del registro validada con Zod en el servidor;
// - honeypot anti-bots en el registro;
// - rate limiting en registro, login y reenvio de verificacion;
// - impersonacion desactivada;
// - nadie puede volverse admin por un endpoint.

import {
  CAMPOS_ADICIONALES_USUARIO,
  type CampoInvalido,
  CODIGOS_ERROR,
  esquemaRegistroServidor,
  LARGO_MAXIMO_PASSWORD,
  LARGO_MINIMO_PASSWORD,
  NOMBRE_APP,
  ROLES,
} from "@gestoria/shared";
import type { BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin, username } from "better-auth/plugins";
import type { Mensajero } from "../correo/enviar.ts";
import { correoDeVerificacion } from "../correo/plantillas.ts";

/** Ruta base donde se monta Better Auth dentro de la API. */
export const RUTA_BASE_AUTH = "/api/auth";

/** Cuánto vale el enlace de verificación. Suficiente para revisar el correo al día siguiente. */
export const HORAS_VALIDEZ_VERIFICACION = 24;

/** Pantalla de la web a la que vuelve la persona después de confirmar su correo. */
export const RUTA_CORREO_CONFIRMADO = "/correo-confirmado";

type OpcionesBase = {
  secreto: string;
  urlBase: string;
  urlWeb: string;
  origenesConfiables: string[];
  enProduccion: boolean;
  mensajero: Mensajero;
};

/**
 * Convierte los problemas de Zod al detalle por campo del formato de error.
 *
 * Se traducen los nombres que usa Better Auth a los del formulario, para que la
 * web pueda poner cada mensaje junto al campo correcto.
 */
function camposInvalidosDesdeZod(problemas: { path: PropertyKey[]; message: string }[]) {
  const equivalencias: Record<string, string> = { username: "usuario", name: "nombre" };

  return problemas.map<CampoInvalido>((problema) => {
    const campo = String(problema.path[0] ?? "");
    return { campo: equivalencias[campo] ?? campo, mensaje: problema.message };
  });
}

/**
 * Verificaciones propias antes de que Better Auth atienda la peticion.
 *
 * Es el punto donde se aplican las reglas que la libreria no conoce: el
 * honeypot, la validacion completa del registro y el bloqueo de la
 * impersonacion.
 */
const verificacionesDeEntrada = createAuthMiddleware(async (ctx) => {
  // Impersonacion desactivada de raiz. El plugin de admin la trae habilitada y
  // no tiene una opcion para apagarla, asi que bloqueamos la ruta: el admin
  // gestiona cuentas pero nunca ve datos ajenos (CLAUDE.md).
  if (ctx.path.startsWith("/admin/impersonate-user")) {
    throw new APIError("FORBIDDEN", { message: "La impersonación está desactivada." });
  }

  if (ctx.path !== "/sign-up/email") return;

  const cuerpo = ctx.body as Record<string, unknown> | undefined;

  // El honeypot va primero y con un mensaje deliberadamente generico: no le
  // contamos al bot cual fue el campo que lo delato.
  const honeypot = cuerpo?.["honeypot"];
  if (typeof honeypot === "string" && honeypot.trim().length > 0) {
    throw new APIError("BAD_REQUEST", { message: "No pudimos procesar el registro." });
  }

  // Validacion completa del registro en el servidor.
  //
  // Better Auth valida la contraseña, el formato del correo y el usuario, pero
  // no conoce los limites de nombre y apellido, que son reglas nuestras. Sin
  // esto, quien llamara al endpoint directamente (sin pasar por el formulario)
  // podria guardar un nombre de 5000 caracteres o vacio.
  const resultado = esquemaRegistroServidor.safeParse(cuerpo);

  if (!resultado.success) {
    throw new APIError("BAD_REQUEST", {
      code: CODIGOS_ERROR.VALIDACION_INVALIDA,
      message: "Revisá los datos ingresados.",
      campos: camposInvalidosDesdeZod(resultado.error.issues),
    });
  }
});

/**
 * El tipo de retorno se deja inferir a proposito (con `satisfies` en vez de una
 * anotacion). Better Auth deduce el tipo del usuario y de la sesion a partir del
 * objeto literal de opciones: si lo ensanchamos a BetterAuthOptions, `session.user`
 * pierde los campos de los plugins y los nuestros, y hay que castear en todos lados.
 */
export function opcionesAuthBase(config: OpcionesBase) {
  return {
    appName: NOMBRE_APP,
    secret: config.secreto,
    baseURL: config.urlBase,
    basePath: RUTA_BASE_AUTH,
    trustedOrigins: config.origenesConfiables,

    emailAndPassword: {
      enabled: true,
      minPasswordLength: LARGO_MINIMO_PASSWORD,
      maxPasswordLength: LARGO_MAXIMO_PASSWORD,
      // Clave: registrarse NO inicia sesion. La cuenta queda pendiente hasta que
      // un admin la apruebe (CLAUDE.md, Autenticacion y administracion).
      autoSignIn: false,
      // Primero de los dos requisitos para entrar: el correo tiene que estar
      // verificado. El segundo (cuenta aprobada) lo controla el hook de sesion
      // en crear-auth.ts. Hacen falta los dos.
      requireEmailVerification: true,
    },

    emailVerification: {
      // El correo sale solo al registrarse, sin que nadie tenga que pedirlo.
      sendOnSignUp: true,
      // Verificar el correo NO inicia sesion: todavia falta que un admin
      // apruebe la cuenta. Iniciar sesion acá dejaría a la persona adentro sin
      // haber pasado el segundo control.
      autoSignInAfterVerification: false,
      expiresIn: HORAS_VALIDEZ_VERIFICACION * 60 * 60,

      sendVerificationEmail: async ({ user, url }) => {
        // `url` ya viene armada por Better Auth, con el token firmado. Lo único
        // que cambiamos es a dónde vuelve después de verificar: por defecto
        // manda a la raíz, y queremos la pantalla que explica que todavía falta
        // la aprobación del admin.
        const enlace = new URL(url);
        enlace.searchParams.set("callbackURL", `${config.urlWeb}${RUTA_CORREO_CONFIRMADO}`);

        await config.mensajero.enviar(
          correoDeVerificacion({
            para: user.email,
            nombre: (user as { nombre?: string }).nombre ?? user.name,
            enlace: enlace.toString(),
            horasDeValidez: HORAS_VALIDEZ_VERIFICACION,
          }),
        );
      },
    },

    // Los modelos de Better Auth se mapean a tablas en español, para que la base
    // se lea igual que el resto del dominio (gastos, contactos…) y no quede una
    // tabla "user" suelta entre todas las demas (docs/guias/convenciones.md).
    // Los *campos* que impone Better Auth (name, email, role, banned) se dejan
    // como estan: son parte de su API, no de nuestro dominio.
    user: {
      modelName: "usuarios",
      additionalFields: CAMPOS_ADICIONALES_USUARIO,
      // Cambiar el correo abre la puerta a suplantaciones; se habilitara con su
      // propio flujo de verificacion de la direccion nueva.
      changeEmail: { enabled: false },
    },

    session: {
      modelName: "sesiones",
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      // Caché de sesión en cookie DESACTIVADO a propósito.
      //
      // Con la caché activada, Better Auth confía en una cookie firmada durante
      // unos minutos y no consulta la base. Eso significa que bloquear una
      // cuenta, rechazarla o cerrarle las sesiones tras un reseteo de contraseña
      // no tendría efecto hasta que la caché venza: alguien a quien acabás de
      // bloquear seguiría navegando.
      //
      // El costo es una consulta por petición, resuelta por el índice único del
      // token. Ante el conflicto, manda la seguridad (CLAUDE.md, Prioridades).
      cookieCache: { enabled: false },
    },

    account: { modelName: "cuentas" },
    verification: { modelName: "verificaciones" },

    advanced: {
      cookiePrefix: "gestion",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: config.enProduccion,
      },
      // En produccion la web y la API viven en subdominios del mismo dominio.
      ...(config.enProduccion ? { crossSubDomainCookies: { enabled: true } } : {}),
    },

    rateLimit: {
      // Better Auth lo apaga en desarrollo; lo queremos siempre, para que el
      // comportamiento que probamos sea el que corre en produccion.
      enabled: true,
      window: 60,
      max: 100,
      storage: "database",
      // Es la clave con la que se exporta la tabla en packages/db, no su nombre SQL.
      modelName: "limitesPeticiones",
      customRules: {
        "/sign-in/email": { window: 300, max: 10 },
        "/sign-in/username": { window: 300, max: 10 },
        "/sign-up/email": { window: 3600, max: 5 },
        // Reenviar la verificacion manda un correo de verdad: sin limite,
        // alguien podria usarlo para inundar la casilla de otra persona.
        "/send-verification-email": { window: 3600, max: 5 },
      },
    },

    hooks: {
      before: verificacionesDeEntrada,
    },

    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 30,
        // Acepta mayúsculas a propósito: Better Auth normaliza a minúsculas para
        // guardar y comparar, así que quien escribe "IOtero" al entrar encuentra
        // su cuenta igual (docs/guias/usabilidad.md). Este validador también
        // corre al iniciar sesión, no solo al registrarse.
        usernameValidator: (valor) => /^[a-zA-Z0-9._-]+$/.test(valor),
      }),
      admin({
        adminRoles: [ROLES.admin],
        defaultRole: ROLES.usuario,
      }),
    ],
  } satisfies BetterAuthOptions;
}
