// Carga cuentas de prueba pasando por el flujo real (registro, aprobación o
// rechazo, bloqueo, reseteo de contraseña), para tener algo creíble que mirar
// en el panel de admin sin tener que armarlo a mano cuenta por cuenta.
//
// Cada escenario es una combinación de estado con sentido: no solo "una
// cuenta aprobada", sino cómo llegó ahí (¿la bloquearon después de
// aprobarla? ¿le resetearon la contraseña?), para que el historial de
// auditoría tenga algo que contar.
//
// Todas las cuentas quedan con el correo confirmado, admin incluido: la
// verificación de correo no es parte de ningún escenario a propósito, para
// no pisar la prueba manual de crear una cuenta y confirmarla de verdad.
//
// Uso:
//   pnpm usuario:sembrar                       siembra todos los escenarios
//   pnpm usuario:sembrar --listar               los lista, sin tocar la base
//   pnpm usuario:sembrar --solo aprobada,bloqueada
//   pnpm usuario:sembrar --solo finanzas        solo los datos de finanzas del admin
//   pnpm usuario:sembrar --reiniciar-finanzas   borra las finanzas del admin y las vuelve a sembrar
//   pnpm usuario:sembrar --borrar-todo          antes de sembrar, vacía usuarios/sesiones/auditoría
//   pnpm usuario:sembrar --test                 contra gestion_test en vez de gestion
//
// Todas las cuentas comparten la contraseña "prueba1234", para poder entrar
// con cualquiera de ellas si hace falta revisar algo desde su lado.
//
// El admin que aprueba, rechaza, bloquea y resetea es siempre el mismo: la
// identidad de ADMIN_USUARIO/ADMIN_NOMBRE/ADMIN_APELLIDO/ADMIN_EMAIL del
// .env, la misma que usa pnpm usuario:admin. Si esa cuenta ya existe (de
// correrlo antes, o de un pnpm usuario:admin de verdad) se reusa tal cual,
// sin tocarle la contraseña; si no, se crea acá mismo con la contraseña fija
// "adminadmin" (nunca con la de un admin real, que se pide por consola y no
// se guarda en ningún archivo — ver crear-admin.ts).

import { createInterface } from "node:readline/promises";
import {
  type ClienteDb,
  crearClienteDb,
  describirConexion,
  esquema,
  leerConfigBaseDatos,
} from "@gestoria/db";
import { ACCIONES_AUDITORIA, ESTADOS_CUENTA } from "@gestoria/shared";
import { APIError } from "better-auth/api";
import { eq, sql } from "drizzle-orm";
import { type Auth, crearAuth } from "../auth/crear-auth.ts";
import { leerConfigSmtp, leerEntornoApi } from "../config/entorno.ts";
import { crearMensajero } from "../correo/enviar.ts";
import { crearLogger } from "../logger.ts";
import { registrarAuditoria } from "../servicios/usuarios/auditoria.ts";
import {
  ascenderAAdmin,
  buscarCuenta,
  cambiarEstadoDeCuentaPorId,
  cerrarSesionesDe,
  marcarPasswordPendienteDeCambio,
} from "../servicios/usuarios/cuentas.ts";
import { leerDatosAdmin } from "./datos-admin.ts";
import { borrarFinanzasDe, sembrarFinanzasDe, tieneFinanzas } from "./sembrar-finanzas.ts";

const PASSWORD_DE_PRUEBA = "prueba1234";
const PASSWORD_ADMIN_DE_PRUEBA = "adminadmin";

type DatosDeCuenta = {
  usuario: string;
  nombre: string;
  apellido: string;
  email: string;
};

type Contexto = {
  cliente: ClienteDb;
  auth: Auth;
  adminId: string;
};

/**
 * Se asegura de que exista el admin del `.env` y devuelve su id, para
 * atribuirle todas las acciones sembradas. No le toca la contraseña si ya
 * existía: podría ser la cuenta real de un `pnpm usuario:admin` anterior.
 */
async function asegurarAdmin(
  cliente: ClienteDb,
  auth: Auth,
  datos: ReturnType<typeof leerDatosAdmin>,
): Promise<string> {
  const existente =
    (await buscarCuenta(cliente, datos.ADMIN_USUARIO)) ??
    (await buscarCuenta(cliente, datos.ADMIN_EMAIL));

  if (existente) {
    await ascenderAAdmin(cliente, existente.id);
    return existente.id;
  }

  const creado = await auth.api.signUpEmail({
    body: {
      email: datos.ADMIN_EMAIL,
      password: PASSWORD_ADMIN_DE_PRUEBA,
      name: `${datos.ADMIN_NOMBRE} ${datos.ADMIN_APELLIDO}`,
      username: datos.ADMIN_USUARIO,
      nombre: datos.ADMIN_NOMBRE,
      apellido: datos.ADMIN_APELLIDO,
    },
  });
  await ascenderAAdmin(cliente, creado.user.id);
  return creado.user.id;
}

type Escenario = {
  nombre: string;
  descripcion: string;
  /** Devuelve "salteado" si no hizo nada porque los datos ya estaban. */
  ejecutar: (contexto: Contexto) => Promise<unknown>;
};

/** Registra una cuenta pasando por Better Auth, para que la contraseña quede hasheada de verdad. */
async function registrar(auth: Auth, datos: DatosDeCuenta): Promise<{ id: string }> {
  const creado = await auth.api.signUpEmail({
    body: {
      email: datos.email,
      password: PASSWORD_DE_PRUEBA,
      name: `${datos.nombre} ${datos.apellido}`,
      username: datos.usuario,
      nombre: datos.nombre,
      apellido: datos.apellido,
    },
  });
  return creado.user;
}

async function confirmarCorreo(cliente: ClienteDb, id: string): Promise<void> {
  await cliente.db
    .update(esquema.usuarios)
    .set({ emailVerified: true })
    .where(eq(esquema.usuarios.id, id));
}

const ESCENARIOS: Escenario[] = [
  {
    nombre: "pendiente",
    descripcion: "Registrada y con el correo confirmado; sigue esperando que la resuelvan.",
    async ejecutar({ auth, cliente }) {
      const usuario = await registrar(auth, {
        usuario: "bruno.confirmado",
        nombre: "Bruno",
        apellido: "Confirmado",
        email: "bruno.confirmado@ejemplo.test",
      });
      await confirmarCorreo(cliente, usuario.id);
    },
  },
  {
    nombre: "aprobada",
    descripcion: "Confirmó el correo y un admin la aprobó: puede entrar.",
    async ejecutar({ auth, cliente, adminId }) {
      const usuario = await registrar(auth, {
        usuario: "carla.aprobada",
        nombre: "Carla",
        apellido: "Aprobada",
        email: "carla.aprobada@ejemplo.test",
      });
      await confirmarCorreo(cliente, usuario.id);
      await cambiarEstadoDeCuentaPorId(cliente, usuario.id, ESTADOS_CUENTA.aprobado);
      await registrarAuditoria(cliente, {
        adminId,
        accion: ACCIONES_AUDITORIA.cuentaAprobada,
        objetivoId: usuario.id,
      });
    },
  },
  {
    nombre: "rechazada",
    descripcion: "Confirmó el correo, pero un admin rechazó la solicitud.",
    async ejecutar({ auth, cliente, adminId }) {
      const usuario = await registrar(auth, {
        usuario: "elena.rechazada",
        nombre: "Elena",
        apellido: "Rechazada",
        email: "elena.rechazada@ejemplo.test",
      });
      await confirmarCorreo(cliente, usuario.id);
      await cambiarEstadoDeCuentaPorId(cliente, usuario.id, ESTADOS_CUENTA.rechazado);
      await registrarAuditoria(cliente, {
        adminId,
        accion: ACCIONES_AUDITORIA.cuentaRechazada,
        objetivoId: usuario.id,
      });
    },
  },
  {
    nombre: "bloqueada",
    descripcion: "Aprobada y, más tarde, bloqueada por un admin: dos pasos en su historial.",
    async ejecutar({ auth, cliente, adminId }) {
      const usuario = await registrar(auth, {
        usuario: "franco.bloqueado",
        nombre: "Franco",
        apellido: "Bloqueado",
        email: "franco.bloqueado@ejemplo.test",
      });
      await confirmarCorreo(cliente, usuario.id);
      await cambiarEstadoDeCuentaPorId(cliente, usuario.id, ESTADOS_CUENTA.aprobado);
      await registrarAuditoria(cliente, {
        adminId,
        accion: ACCIONES_AUDITORIA.cuentaAprobada,
        objetivoId: usuario.id,
      });

      // Directo a la fila, como haría el plugin de admin de Better Auth: no
      // hay sesión real que pasarle a auth.api.banUser (ver docs/decisiones.md).
      await cliente.db
        .update(esquema.usuarios)
        .set({
          banned: true,
          banReason: "Motivo de prueba: reporte de otra cuenta",
          updatedAt: new Date(),
        })
        .where(eq(esquema.usuarios.id, usuario.id));
      await cerrarSesionesDe(cliente, usuario.id);
      await registrarAuditoria(cliente, {
        adminId,
        accion: ACCIONES_AUDITORIA.cuentaBloqueada,
        objetivoId: usuario.id,
        detalle: "Motivo de prueba: reporte de otra cuenta",
      });
    },
  },
  {
    nombre: "password-reseteada",
    descripcion: "Aprobada y, más tarde, con la contraseña reseteada por un admin.",
    async ejecutar({ auth, cliente, adminId }) {
      const usuario = await registrar(auth, {
        usuario: "gabriela.reseteada",
        nombre: "Gabriela",
        apellido: "Reseteada",
        email: "gabriela.reseteada@ejemplo.test",
      });
      await confirmarCorreo(cliente, usuario.id);
      await cambiarEstadoDeCuentaPorId(cliente, usuario.id, ESTADOS_CUENTA.aprobado);
      await registrarAuditoria(cliente, {
        adminId,
        accion: ACCIONES_AUDITORIA.cuentaAprobada,
        objetivoId: usuario.id,
      });

      // No hace falta una contraseña temporal de verdad para esta cuenta de
      // prueba: lo que importa demostrar es debeCambiarPassword, no el hash.
      await marcarPasswordPendienteDeCambio(cliente, usuario.id);
      await cerrarSesionesDe(cliente, usuario.id);
      await registrarAuditoria(cliente, {
        adminId,
        accion: ACCIONES_AUDITORIA.passwordReseteada,
        objetivoId: usuario.id,
      });
    },
  },
  {
    nombre: "finanzas",
    descripcion:
      "Varios meses de finanzas realistas para el admin: cuentas, categorías, períodos, movimientos, transferencias, presupuestos y correcciones.",
    async ejecutar({ cliente, adminId }) {
      if (process.argv.includes("--reiniciar-finanzas")) {
        const sigue = await confirmar(
          "Esto borra TODAS las finanzas del admin (cuentas, categorías, períodos y movimientos).",
        );
        if (!sigue) return "salteado";
        await borrarFinanzasDe(cliente, adminId);
      } else if (await tieneFinanzas(cliente, adminId)) {
        console.log(
          "  El admin ya tiene finanzas cargadas; no se toca nada. Usá --reiniciar-finanzas para sembrarlas de nuevo.",
        );
        return "salteado";
      }
      const resumen = await sembrarFinanzasDe({ cliente, userId: adminId, ahora: new Date() });
      console.log(
        `  Se cargaron ${resumen.periodos} períodos, ${resumen.movimientos} movimientos y ${resumen.cuentas} cuentas para el admin.`,
      );
    },
  },
];

function listarEscenarios(): void {
  console.log("Escenarios disponibles:\n");
  for (const escenario of ESCENARIOS) {
    console.log(`  ${escenario.nombre}`);
    console.log(`    ${escenario.descripcion}\n`);
  }
}

function elegirEscenarios(): Escenario[] {
  const indiceSolo = process.argv.indexOf("--solo");
  if (indiceSolo === -1) return ESCENARIOS;

  const pedidos = (process.argv[indiceSolo + 1] ?? "").split(",").map((n) => n.trim());
  const porNombre = new Map(ESCENARIOS.map((e) => [e.nombre, e]));

  const elegidos: Escenario[] = [];
  for (const nombre of pedidos) {
    const escenario = porNombre.get(nombre);
    if (!escenario) {
      throw new Error(`No existe el escenario "${nombre}". Usá --listar para ver los disponibles.`);
    }
    elegidos.push(escenario);
  }
  return elegidos;
}

async function confirmar(mensaje: string): Promise<boolean> {
  if (process.argv.includes("--forzar")) return true;
  if (!process.stdin.isTTY) {
    throw new Error("No hay terminal interactiva para confirmar. Agregá --forzar si estás seguro.");
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const respuesta = await rl.question(`${mensaje} Escribí "si" para confirmar: `);
    return respuesta.trim().toLowerCase() === "si";
  } finally {
    rl.close();
  }
}

/** Mismas tablas que limpiarBase/limpiarBaseDePruebas: la cascada arrastra también auditoria. */
async function borrarTodo(cliente: ClienteDb): Promise<void> {
  await cliente.db.execute(
    sql`truncate table ${esquema.usuarios}, ${esquema.sesiones}, ${esquema.cuentas}, ${esquema.verificaciones}, ${esquema.limitesPeticiones} restart identity cascade`,
  );
}

async function principal(): Promise<void> {
  if (process.argv.includes("--listar")) {
    listarEscenarios();
    return;
  }

  const escenarios = elegirEscenarios();
  const entorno = leerEntornoApi();
  const configBase = leerConfigBaseDatos(process.argv.includes("--test"));
  const cliente = crearClienteDb(configBase);

  console.log(`Base: ${describirConexion(configBase)}`);

  try {
    if (process.argv.includes("--borrar-todo")) {
      const sigue = await confirmar(
        `Esto borra TODOS los usuarios, sesiones y auditoría de "${describirConexion(configBase)}".`,
      );
      if (!sigue) {
        console.log("Cancelado.");
        return;
      }
      await borrarTodo(cliente);
      console.log("Base vaciada.\n");
    }

    const auth = crearAuth({
      cliente,
      secreto: entorno.BETTER_AUTH_SECRET,
      urlBase: entorno.BETTER_AUTH_URL,
      urlWeb: entorno.URL_WEB,
      origenesConfiables: entorno.ORIGENES_PERMITIDOS,
      enProduccion: entorno.NODE_ENV === "production",
      mensajero: crearMensajero(crearLogger(entorno), leerConfigSmtp(entorno)),
    });

    const datosAdmin = leerDatosAdmin();
    const adminId = await asegurarAdmin(cliente, auth, datosAdmin);
    console.log(`Las acciones quedan atribuidas a ${datosAdmin.ADMIN_USUARIO}.\n`);

    for (const escenario of escenarios) {
      try {
        const resultado = await escenario.ejecutar({ cliente, auth, adminId });
        console.log(
          resultado === "salteado" ? `- ${escenario.nombre}: salteado.` : `✓ ${escenario.nombre}`,
        );
      } catch (error) {
        const codigo = error instanceof APIError ? error.body?.["code"] : undefined;
        const yaExiste =
          typeof codigo === "string" &&
          (codigo.includes("ALREADY_EXISTS") || codigo.includes("ALREADY_TAKEN"));

        if (yaExiste) {
          console.log(`- ${escenario.nombre}: ya existía, salteado.`);
          continue;
        }
        throw error;
      }
    }

    console.log(`\nListo. Las cuentas de prueba usan la contraseña "${PASSWORD_DE_PRUEBA}".`);
    console.log(
      `Admin: ${datosAdmin.ADMIN_USUARIO} / "${PASSWORD_ADMIN_DE_PRUEBA}" (si ya existía, sigue con la suya).`,
    );
  } finally {
    await cliente.cerrar();
  }
}

principal().catch((error: unknown) => {
  console.error("No se pudieron sembrar los datos de prueba.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
