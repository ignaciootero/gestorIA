// Carga los datos de prueba: tres cuentas para entrar y mirar, más las que pueblan el panel de admin
// (ver cuentas-de-prueba.ts).
//
//   iotero / iotero            el admin: datos en todos los módulos, solicitudes pendientes, cuentas
//                              en cada estado y un año de auditoría
//   dpaolillo1 / dpaolillo1    un año de uso: finanzas, contactos (cumpleaños, aniversarios), tareas
//                              y calendario
//   dpaolillo2 / dpaolillo2    recién aprobada y vacía
//   (las del panel)            contraseña "prueba1234"
//
// Pasa por los mismos servicios que usa la API, así los datos salen con las mismas reglas que los que
// carga la interfaz. Todas las cuentas quedan con el correo confirmado (salvo una solicitud pendiente
// que, a propósito, no lo tiene).
//
// No pisa nada: una cuenta que ya existe (por usuario o correo) se deja como está, con sus datos. Para
// volver a empezar, --borrar-todo vacía antes las cuentas (y, en cascada, todos sus datos).
//
// Uso:
//   pnpm usuario:sembrar                  carga lo que falte
//   pnpm usuario:sembrar --borrar-todo    antes, borra todas las cuentas y sus datos (pide confirmar)
//   pnpm usuario:sembrar --test           contra gestion_test en vez de gestion
//   --forzar                              no pide confirmación (para correrlo sin terminal)
//   --si-esta-vacia                       solo carga si la base no tiene ninguna cuenta (lo usa el
//                                         arranque del ambiente de prueba en Render, ver
//                                         scripts/ambiente-de-prueba/iniciar.ts)

import { createInterface } from "node:readline/promises";
import {
  type ClienteDb,
  crearClienteDb,
  describirConexion,
  esquema,
  leerConfigBaseDatos,
} from "@gestoria/db";
import { count, sql } from "drizzle-orm";
import { crearAuth } from "../auth/crear-auth.ts";
import { leerEntornoApi } from "../config/entorno.ts";
import {
  CUENTA_ADMIN,
  CUENTA_CON_UN_ANIO,
  CUENTA_VACIA,
  PASSWORD_DE_LAS_OTRAS_CUENTAS,
  sembrarCuentasDePrueba,
} from "./cuentas-de-prueba.ts";

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

/** Mismas tablas que limpiarBase/limpiarBaseDePruebas: la cascada arrastra los datos de cada cuenta. */
async function borrarTodo(cliente: ClienteDb): Promise<void> {
  await cliente.db.execute(
    sql`truncate table ${esquema.usuarios}, ${esquema.sesiones}, ${esquema.cuentas}, ${esquema.verificaciones}, ${esquema.limitesPeticiones} restart identity cascade`,
  );
}

async function principal(): Promise<void> {
  const entorno = leerEntornoApi();
  const configBase = leerConfigBaseDatos(process.argv.includes("--test"));
  const cliente = crearClienteDb(configBase);

  console.log(`Base: ${describirConexion(configBase)}`);

  try {
    // Con una sola cuenta ya se considera cargada: así no se vuelve a sembrar en cada arranque ni se
    // mezclan los datos de prueba con cuentas que alguien haya creado a mano.
    if (process.argv.includes("--si-esta-vacia")) {
      const [fila] = await cliente.db.select({ cantidad: count() }).from(esquema.usuarios);
      if ((fila?.cantidad ?? 0) > 0) {
        console.log("La base ya tiene cuentas: no se carga nada.");
        return;
      }
      console.log("La base no tiene cuentas: se cargan los datos de prueba.");
    }

    if (process.argv.includes("--borrar-todo")) {
      const sigue = await confirmar(
        `Esto borra TODAS las cuentas de "${describirConexion(configBase)}", con todos sus datos.`,
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
      // Nunca por SMTP, aunque el .env lo tenga: registrar cada cuenta manda el correo de verificación,
      // y son direcciones inventadas (@ejemplo.test) que rebotan y gastan el cupo diario del servidor
      // de correo. Se descartan: las cuentas quedan con el correo ya confirmado.
      mensajero: { enviaDeVerdad: false, enviar: async () => {} },
    });

    await sembrarCuentasDePrueba({ cliente, auth, ahora: new Date() });

    console.log("\nListo. Para entrar:");
    for (const cuenta of [CUENTA_ADMIN, CUENTA_CON_UN_ANIO, CUENTA_VACIA]) {
      console.log(`  ${cuenta.usuario} / ${cuenta.password}`);
    }
    console.log(`  (las demás cuentas, "${PASSWORD_DE_LAS_OTRAS_CUENTAS}")`);
  } finally {
    await cliente.cerrar();
  }
}

principal().catch((error: unknown) => {
  console.error("No se pudieron sembrar los datos de prueba.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
