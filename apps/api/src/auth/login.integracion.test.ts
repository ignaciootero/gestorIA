// Tests de integracion del inicio de sesion, contra la base gestion_test real.
//
// Lo que mas importa aca es que una cuenta que no esta aprobada NO pueda entrar,
// por ninguna de las dos vias (usuario o correo).

import type { ClienteDb } from "@gestoria/db";
import { ESTADOS_CUENTA, type RespuestaError } from "@gestoria/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  bloquear,
  cookiesDe,
  entrarConEmail,
  entrarConUsuario,
  limpiarBase,
  registrarAprobado,
} from "../pruebas/auth-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../pruebas/entorno-de-prueba.ts";

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

describe("login de una cuenta aprobada", () => {
  it("entra con el usuario", async () => {
    const datos = await registrarAprobado(app, cliente);

    const respuesta = await entrarConUsuario(app, datos.usuario, datos.password);

    expect(respuesta.status).toBe(200);
    expect(cookiesDe(respuesta)).toMatch(/session/i);
  });

  it("entra con el correo", async () => {
    const datos = await registrarAprobado(app, cliente);

    const respuesta = await entrarConEmail(app, datos.email, datos.password);

    expect(respuesta.status).toBe(200);
    expect(cookiesDe(respuesta)).toMatch(/session/i);
  });

  it("entra aunque el usuario se escriba con mayúsculas", async () => {
    const datos = await registrarAprobado(app, cliente);

    const respuesta = await entrarConUsuario(app, datos.usuario.toUpperCase(), datos.password);

    expect(respuesta.status).toBe(200);
  });

  it("deja la sesión registrada en la base", async () => {
    const datos = await registrarAprobado(app, cliente);
    await entrarConUsuario(app, datos.usuario, datos.password);

    const sesiones = await cliente.db.query.sesiones.findMany();
    expect(sesiones).toHaveLength(1);
  });

  it("nunca devuelve la contraseña ni su hash", async () => {
    const datos = await registrarAprobado(app, cliente);

    const respuesta = await entrarConUsuario(app, datos.usuario, datos.password);
    const texto = await respuesta.text();

    expect(texto).not.toContain(datos.password);
    // Ni el hash en claro ni el campo que lo guarda. El `token` de sesión sí
    // viaja en el cuerpo: es de quien inició sesión y va sobre HTTPS.
    expect(texto).not.toMatch(/"password"/i);
    expect(texto).not.toMatch(/\$2[aby]\$|scrypt|pbkdf2/i);
  });
});

describe("login de una cuenta que no puede entrar", () => {
  it("rechaza una cuenta pendiente con el código CUENTA_PENDIENTE", async () => {
    // Con el correo ya confirmado: así el rechazo que se prueba es el del estado
    // y no el de la verificación, que llega antes.
    const datos = await registrarAprobado(app, cliente, { estado: ESTADOS_CUENTA.pendiente });

    const respuesta = await entrarConUsuario(app, datos.usuario, datos.password);

    expect(respuesta.status).toBe(403);
    const cuerpo = await leerJson<RespuestaError>(respuesta);
    expect(cuerpo.error.codigo).toBe("CUENTA_PENDIENTE");
    expect(cuerpo.error.mensaje).toMatch(/aprobación/i);
  });

  it("rechaza una cuenta pendiente también entrando por correo", async () => {
    const datos = await registrarAprobado(app, cliente, { estado: ESTADOS_CUENTA.pendiente });

    const respuesta = await entrarConEmail(app, datos.email, datos.password);

    expect(respuesta.status).toBe(403);
    const cuerpo = await leerJson<RespuestaError>(respuesta);
    expect(cuerpo.error.codigo).toBe("CUENTA_PENDIENTE");
  });

  it("rechaza una cuenta rechazada con el código CUENTA_RECHAZADA", async () => {
    const datos = await registrarAprobado(app, cliente, { estado: ESTADOS_CUENTA.rechazado });

    const respuesta = await entrarConUsuario(app, datos.usuario, datos.password);

    expect(respuesta.status).toBe(403);
    const cuerpo = await leerJson<RespuestaError>(respuesta);
    expect(cuerpo.error.codigo).toBe("CUENTA_RECHAZADA");
  });

  it("rechaza una cuenta bloqueada con el código CUENTA_BLOQUEADA", async () => {
    const datos = await registrarAprobado(app, cliente);
    await bloquear(cliente, datos.email);

    const respuesta = await entrarConUsuario(app, datos.usuario, datos.password);

    expect(respuesta.status).toBe(403);
    const cuerpo = await leerJson<RespuestaError>(respuesta);
    expect(cuerpo.error.codigo).toBe("CUENTA_BLOQUEADA");
  });

  it("no crea ninguna sesión cuando rechaza el login", async () => {
    const datos = await registrarAprobado(app, cliente, { estado: ESTADOS_CUENTA.pendiente });

    const respuesta = await entrarConUsuario(app, datos.usuario, datos.password);

    expect(cookiesDe(respuesta)).not.toMatch(/session=\S/i);
    const sesiones = await cliente.db.query.sesiones.findMany();
    expect(sesiones).toHaveLength(0);
  });
});

describe("login con credenciales incorrectas", () => {
  it("rechaza una contraseña equivocada", async () => {
    const datos = await registrarAprobado(app, cliente);

    const respuesta = await entrarConUsuario(app, datos.usuario, "contrasena-equivocada-123");

    expect(respuesta.status).toBeGreaterThanOrEqual(400);
    const cuerpo = await leerJson<RespuestaError>(respuesta);
    expect(cuerpo.error.codigo).toBe("CREDENCIALES_INVALIDAS");
  });

  it("da el mismo mensaje para un usuario que no existe que para una contraseña mala", async () => {
    // Si los mensajes fueran distintos, cualquiera podría averiguar qué usuarios
    // existen probándolos de a uno.
    const datos = await registrarAprobado(app, cliente);

    const passwordMala = await entrarConUsuario(app, datos.usuario, "contrasena-equivocada-123");
    const usuarioInexistente = await entrarConUsuario(app, "nadie.existe", datos.password);

    const cuerpoA = await leerJson<RespuestaError>(passwordMala);
    const cuerpoB = await leerJson<RespuestaError>(usuarioInexistente);

    expect(cuerpoA.error.codigo).toBe(cuerpoB.error.codigo);
    expect(cuerpoA.error.mensaje).toBe(cuerpoB.error.mensaje);
    expect(passwordMala.status).toBe(usuarioInexistente.status);
  });

  it("no distingue entre cuenta inexistente y cuenta pendiente por la contraseña", async () => {
    // Una cuenta pendiente con la contraseña mal tiene que verse igual que
    // cualquier otro intento fallido: recién con la contraseña correcta se
    // informa que la cuenta está esperando aprobación.
    const datos = await registrarAprobado(app, cliente, { estado: ESTADOS_CUENTA.pendiente });

    const respuesta = await entrarConUsuario(app, datos.usuario, "contrasena-equivocada-123");
    const cuerpo = await leerJson<RespuestaError>(respuesta);

    expect(cuerpo.error.codigo).toBe("CREDENCIALES_INVALIDAS");
  });

  it("no filtra detalles técnicos al rechazar el login", async () => {
    const datos = await registrarAprobado(app, cliente);

    const respuesta = await entrarConUsuario(app, datos.usuario, "contrasena-equivocada-123");
    const texto = await respuesta.text();

    expect(texto).not.toMatch(/stack|node_modules/i);
    expect(texto).not.toMatch(/select |drizzle|usuarios/i);
  });
});
