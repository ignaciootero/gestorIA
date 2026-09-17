// Crea (o repara) la cuenta del primer administrador.
//
// Es la unica forma de que exista un admin: ningun endpoint permite ascender a
// nadie (CLAUDE.md, Autenticacion y administracion). Los datos salen de
// variables de entorno. La contraseña NO: se pide por consola al momento, para
// que no quede guardada en ningun archivo ni en el historial del shell.
//
// Uso:  pnpm usuario:admin
//
// Es idempotente: si la cuenta ya existe, no la duplica ni le pisa la
// contraseña; solo se asegura de que quede aprobada y con rol admin.

import { crearClienteDb, describirConexion, leerConfigBaseDatos } from "@gestoria/db";
import {
  ESTADOS_CUENTA,
  esquemaEmail,
  esquemaPassword,
  esquemaUsuario,
  ROLES,
} from "@gestoria/shared";
import { z } from "zod";
import { crearAuth } from "../auth/crear-auth.ts";
import { leerConfigSmtp, leerEntornoApi } from "../config/entorno.ts";
import { crearMensajero } from "../correo/enviar.ts";
import { crearLogger } from "../logger.ts";
import { ascenderAAdmin, buscarCuenta } from "../servicios/usuarios/cuentas.ts";
import { pedirPasswordOculta } from "./pedir-password.ts";

const esquemaDatosAdmin = z.object({
  ADMIN_USUARIO: esquemaUsuario,
  ADMIN_NOMBRE: z.string().trim().min(1, "Completá ADMIN_NOMBRE."),
  ADMIN_APELLIDO: z.string().trim().min(1, "Completá ADMIN_APELLIDO."),
  ADMIN_EMAIL: esquemaEmail,
});

function leerDatosAdmin() {
  const resultado = esquemaDatosAdmin.safeParse(process.env);

  if (!resultado.success) {
    const detalle = resultado.error.issues
      .map((problema) => `  - ${problema.path.join(".")}: ${problema.message}`)
      .join("\n");
    throw new Error(
      `Faltan datos del admin en el .env o son inválidos:\n${detalle}\n` +
        "Están documentados en .env.example.",
    );
  }

  return resultado.data;
}

/**
 * Obtiene la contraseña: de la consola si hay terminal, o de ADMIN_PASSWORD si
 * viene definida (para el seed automático en el VPS, donde no hay terminal).
 */
async function obtenerPassword(): Promise<string> {
  const deEntorno = process.env["ADMIN_PASSWORD"];
  const cruda = deEntorno ?? (await pedirPasswordOculta("Contraseña para el admin: "));

  const resultado = esquemaPassword.safeParse(cruda);
  if (!resultado.success) {
    throw new Error(resultado.error.issues[0]?.message ?? "Contraseña inválida.");
  }

  return resultado.data;
}

async function principal(): Promise<void> {
  const datos = leerDatosAdmin();
  const entorno = leerEntornoApi();
  const configBase = leerConfigBaseDatos(process.argv.includes("--test"));
  const cliente = crearClienteDb(configBase);

  const auth = crearAuth({
    cliente,
    secreto: entorno.BETTER_AUTH_SECRET,
    urlBase: entorno.BETTER_AUTH_URL,
    urlWeb: entorno.URL_WEB,
    origenesConfiables: entorno.ORIGENES_PERMITIDOS,
    enProduccion: entorno.NODE_ENV === "production",
    mensajero: crearMensajero(crearLogger(entorno), leerConfigSmtp(entorno)),
  });

  console.log(`Base: ${describirConexion(configBase)}`);

  try {
    const existentePorUsuario = await buscarCuenta(cliente, datos.ADMIN_USUARIO);
    const existente = existentePorUsuario ?? (await buscarCuenta(cliente, datos.ADMIN_EMAIL));

    if (existente) {
      console.log(`La cuenta ya existía: ${existente.usuario ?? existente.email}`);

      // Se comprueban las tres condiciones que necesita para entrar, no solo el
      // rol: una cuenta admin aprobada pero con el correo sin confirmar seguiría
      // sin poder iniciar sesión.
      const yaEstaLista =
        existente.rol === ROLES.admin &&
        existente.estado === ESTADOS_CUENTA.aprobado &&
        existente.emailVerificado;

      if (yaEstaLista) {
        console.log("Ya es admin, está aprobada y tiene el correo confirmado.");
        return;
      }

      // No se toca la contraseña: si la cuenta existe, su dueño ya la eligió.
      await ascenderAAdmin(cliente, existente.id);
      console.log("Actualizada: ahora es admin y está aprobada.");
      return;
    }

    const password = await obtenerPassword();

    // El alta pasa por Better Auth y no por un INSERT directo, para que la
    // contraseña quede con el mismo hash que después va a verificar el login.
    const creado = await auth.api.signUpEmail({
      body: {
        email: datos.ADMIN_EMAIL,
        password,
        name: `${datos.ADMIN_NOMBRE} ${datos.ADMIN_APELLIDO}`,
        username: datos.ADMIN_USUARIO,
        nombre: datos.ADMIN_NOMBRE,
        apellido: datos.ADMIN_APELLIDO,
      },
    });

    // El registro deja toda cuenta como "pendiente" y con rol "usuario": esos
    // campos son `input: false` justamente para que nadie los mande desde
    // afuera. El ascenso se hace acá, del lado del servidor.
    await ascenderAAdmin(cliente, creado.user.id);

    console.log(`Admin creado: ${datos.ADMIN_USUARIO} (${datos.ADMIN_EMAIL})`);
    console.log("Ya podés entrar con ese usuario o con ese correo.");
  } finally {
    await cliente.cerrar();
  }
}

principal().catch((error: unknown) => {
  console.error("No se pudo crear el admin.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
