// Aprueba, rechaza o vuelve a dejar pendiente una cuenta.
//
// Hasta que exista el panel de admin (paso 5 de la hoja de ruta) esta es la
// unica forma de aprobar una cuenta que se registro y quedo pendiente.
//
// Uso:
//   pnpm usuario:aprobar --listar
//   pnpm usuario:aprobar <usuario-o-correo>
//   pnpm usuario:aprobar <usuario-o-correo> --rechazar

import { crearClienteDb, leerConfigBaseDatos } from "@gestoria/db";
import { ESTADOS_CUENTA, type EstadoCuenta } from "@gestoria/shared";
import { cambiarEstadoDeCuenta, listarCuentasPendientes } from "../servicios/usuarios/cuentas.ts";

function estadoPedido(): EstadoCuenta {
  if (process.argv.includes("--rechazar")) return ESTADOS_CUENTA.rechazado;
  if (process.argv.includes("--pendiente")) return ESTADOS_CUENTA.pendiente;
  return ESTADOS_CUENTA.aprobado;
}

async function principal(): Promise<void> {
  const cliente = crearClienteDb(leerConfigBaseDatos(process.argv.includes("--test")));

  try {
    if (process.argv.includes("--listar")) {
      const pendientes = await listarCuentasPendientes(cliente);

      if (pendientes.length === 0) {
        console.log("No hay solicitudes pendientes.");
        return;
      }

      console.log(`Solicitudes pendientes (${pendientes.length}):\n`);
      for (const persona of pendientes) {
        console.log(
          `  ${persona.usuario ?? "(sin usuario)"} — ${persona.nombre} ${persona.apellido}`,
        );
        console.log(`    ${persona.email}`);
        console.log(`    correo ${persona.emailVerificado ? "confirmado" : "SIN confirmar"}`);
        console.log(`    solicitó el ${persona.creadaEn.toLocaleDateString("es-UY")}\n`);
      }
      console.log("Para aprobar: pnpm usuario:aprobar <usuario>");
      return;
    }

    const identificador = process.argv[2]?.trim();

    if (!identificador || identificador.startsWith("--")) {
      throw new Error(
        "Indicá el usuario o el correo de la cuenta.\n" +
          "  pnpm usuario:aprobar iotero\n" +
          "  pnpm usuario:aprobar --listar",
      );
    }

    const resultado = await cambiarEstadoDeCuenta(cliente, identificador, estadoPedido());
    const nombre = resultado.cuenta.usuario ?? resultado.cuenta.email;

    if (resultado.estadoAnterior === resultado.cuenta.estado) {
      console.log(`La cuenta ${nombre} ya estaba "${resultado.cuenta.estado}".`);
      return;
    }

    console.log(`${nombre}: "${resultado.estadoAnterior}" → "${resultado.cuenta.estado}"`);

    if (resultado.sesionesCerradas > 0) {
      console.log(`Se cerraron ${resultado.sesionesCerradas} sesión(es) abiertas.`);
    }
  } finally {
    await cliente.cerrar();
  }
}

principal().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
