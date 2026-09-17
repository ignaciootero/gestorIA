// Tests del servicio de cuentas, contra gestion_test.
//
// Es la logica que usan hoy los scripts de linea de comandos y que mañana va a
// usar el panel de admin, asi que se prueba una sola vez, aca.

import type { ClienteDb } from "@gestoria/db";
import { ESTADOS_CUENTA, ROLES } from "@gestoria/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  cookiesDe,
  entrarConUsuario,
  limpiarBase,
  registrar,
  registrarAprobado,
} from "../../pruebas/auth-de-prueba.ts";
import { appDePrueba, clienteDePrueba } from "../../pruebas/entorno-de-prueba.ts";
import {
  ascenderAAdmin,
  buscarCuenta,
  cambiarEstadoDeCuenta,
  listarCuentasPendientes,
} from "./cuentas.ts";

let cliente: ClienteDb;
let app: ReturnType<typeof appDePrueba>;

beforeAll(() => {
  cliente = clienteDePrueba();
  app = appDePrueba(cliente);
});

beforeEach(async () => {
  await limpiarBase(cliente);
});

afterAll(async () => {
  await cliente.cerrar();
});

describe("buscarCuenta", () => {
  it("devuelve null si no existe", async () => {
    expect(await buscarCuenta(cliente, "nadie.existe")).toBeNull();
  });

  it("ignora espacios sobrantes alrededor del identificador", async () => {
    const { datos } = await registrar(app);

    expect(await buscarCuenta(cliente, `  ${datos.usuario}  `)).not.toBeNull();
  });
});

describe("listarCuentasPendientes", () => {
  it("devuelve una lista vacía cuando no hay solicitudes", async () => {
    await registrarAprobado(app, cliente);

    expect(await listarCuentasPendientes(cliente)).toHaveLength(0);
  });

  it("devuelve solo las pendientes, de la más vieja a la más nueva", async () => {
    const primera = await registrar(app);
    const segunda = await registrar(app);
    await registrarAprobado(app, cliente);

    const pendientes = await listarCuentasPendientes(cliente);

    expect(pendientes).toHaveLength(2);
    expect(pendientes.map((cuenta) => cuenta.usuario)).toEqual([
      primera.datos.usuario,
      segunda.datos.usuario,
    ]);
  });

  it("indica si cada solicitud ya confirmó su correo", async () => {
    // El admin necesita verlo para no aprobar a ciegas una cuenta cuyo correo
    // todavía no se confirmó.
    await registrar(app);

    const [pendiente] = await listarCuentasPendientes(cliente);
    expect(pendiente?.emailVerificado).toBe(false);
  });
});

describe("cambiarEstadoDeCuenta", () => {
  it("aprueba una cuenta pendiente", async () => {
    const { datos } = await registrar(app);

    const resultado = await cambiarEstadoDeCuenta(cliente, datos.usuario, ESTADOS_CUENTA.aprobado);

    expect(resultado.estadoAnterior).toBe(ESTADOS_CUENTA.pendiente);
    expect(resultado.cuenta.estado).toBe(ESTADOS_CUENTA.aprobado);
  });

  it("permite entrar después de aprobar", async () => {
    // El correo ya confirmado: lo único que falta es la aprobación.
    const datos = await registrarAprobado(app, cliente, { estado: ESTADOS_CUENTA.pendiente });

    const antes = await entrarConUsuario(app, datos.usuario, datos.password);
    expect(antes.status).toBe(403);

    await cambiarEstadoDeCuenta(cliente, datos.usuario, ESTADOS_CUENTA.aprobado);

    const despues = await entrarConUsuario(app, datos.usuario, datos.password);
    expect(despues.status).toBe(200);
  });

  it("funciona igual pasando el correo en vez del usuario", async () => {
    const { datos } = await registrar(app);

    const resultado = await cambiarEstadoDeCuenta(cliente, datos.email, ESTADOS_CUENTA.aprobado);

    expect(resultado.cuenta.estado).toBe(ESTADOS_CUENTA.aprobado);
  });

  it("no hace nada si la cuenta ya estaba en ese estado", async () => {
    const { datos } = await registrar(app);

    const resultado = await cambiarEstadoDeCuenta(cliente, datos.usuario, ESTADOS_CUENTA.pendiente);

    expect(resultado.estadoAnterior).toBe(ESTADOS_CUENTA.pendiente);
    expect(resultado.sesionesCerradas).toBe(0);
  });

  it("cierra las sesiones abiertas al rechazar una cuenta", async () => {
    const datos = await registrarAprobado(app, cliente);
    const entrada = await entrarConUsuario(app, datos.usuario, datos.password);
    const cookies = cookiesDe(entrada);

    expect((await app.request("/api/yo", { headers: { cookie: cookies } })).status).toBe(200);

    const resultado = await cambiarEstadoDeCuenta(cliente, datos.usuario, ESTADOS_CUENTA.rechazado);

    expect(resultado.sesionesCerradas).toBe(1);
    expect((await app.request("/api/yo", { headers: { cookie: cookies } })).status).toBe(401);
  });

  it("no cierra sesiones al aprobar", async () => {
    const { datos } = await registrar(app);

    const resultado = await cambiarEstadoDeCuenta(cliente, datos.usuario, ESTADOS_CUENTA.aprobado);

    expect(resultado.sesionesCerradas).toBe(0);
  });

  it("falla con un mensaje claro si la cuenta no existe", async () => {
    await expect(
      cambiarEstadoDeCuenta(cliente, "nadie.existe", ESTADOS_CUENTA.aprobado),
    ).rejects.toThrow(/No hay ninguna cuenta/);
  });
});

describe("ascenderAAdmin", () => {
  it("deja la cuenta como admin, aprobada y con el correo confirmado", async () => {
    const { datos } = await registrar(app);
    const cuenta = await buscarCuenta(cliente, datos.usuario);

    await ascenderAAdmin(cliente, cuenta?.id ?? "");

    const despues = await buscarCuenta(cliente, datos.usuario);
    expect(despues?.rol).toBe(ROLES.admin);
    expect(despues?.estado).toBe(ESTADOS_CUENTA.aprobado);
    expect(despues?.emailVerificado).toBe(true);
  });

  it("el primer admin puede entrar sin pasar por la verificación de correo", async () => {
    // No hay nadie que lo apruebe ni un correo que confirmar: la cuenta la crea
    // desde el servidor quien ya tiene acceso a la base.
    const { datos } = await registrar(app);
    const cuenta = await buscarCuenta(cliente, datos.usuario);

    await ascenderAAdmin(cliente, cuenta?.id ?? "");

    const entrada = await entrarConUsuario(app, datos.usuario, datos.password);
    expect(entrada.status).toBe(200);
  });

  it("desbloquea la cuenta si estaba bloqueada", async () => {
    const datos = await registrarAprobado(app, cliente);
    const cuenta = await buscarCuenta(cliente, datos.usuario);

    await ascenderAAdmin(cliente, cuenta?.id ?? "");

    const entrada = await entrarConUsuario(app, datos.usuario, datos.password);
    expect(entrada.status).toBe(200);
  });
});
