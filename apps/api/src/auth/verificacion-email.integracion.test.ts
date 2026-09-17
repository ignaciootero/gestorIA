// Tests de integracion de la verificacion de correo, contra gestion_test.
//
// La regla central: para entrar hacen falta DOS cosas, correo confirmado y
// cuenta aprobada. Con una sola no alcanza, en ninguno de los dos ordenes.

import type { ClienteDb } from "@gestoria/db";
import { ESTADOS_CUENTA, type RespuestaError } from "@gestoria/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  cookiesDe,
  entrarConEmail,
  entrarConUsuario,
  limpiarBase,
  ponerEstado,
  registrar,
  registrarAprobado,
  verificarEmail,
} from "../pruebas/auth-de-prueba.ts";
import {
  appDePrueba,
  clienteDePrueba,
  crearMensajeroDePrueba,
  leerJson,
  URL_API,
} from "../pruebas/entorno-de-prueba.ts";
import { RUTA_BASE_AUTH, RUTA_CORREO_CONFIRMADO } from "./opciones.ts";

const buzon = crearMensajeroDePrueba();

let cliente: ClienteDb;
let app: ReturnType<typeof appDePrueba>;

beforeAll(() => {
  cliente = clienteDePrueba();
  // El mensajero de prueba guarda los correos en memoria en vez de mandarlos,
  // así se puede verificar qué se envió y seguir el enlace.
  app = appDePrueba(cliente, buzon.mensajero);
});

beforeEach(async () => {
  await limpiarBase(cliente);
  buzon.limpiar();
});

afterAll(async () => {
  await cliente.cerrar();
});

describe("al registrarse", () => {
  it("deja el correo sin confirmar", async () => {
    const { datos } = await registrar(app);

    const fila = await cliente.db.query.usuarios.findFirst({
      where: (tabla, { eq }) => eq(tabla.email, datos.email),
    });

    expect(fila?.emailVerified).toBe(false);
  });

  it("manda un correo de verificación a la dirección que se registró", async () => {
    const { datos } = await registrar(app);

    expect(buzon.enviados).toHaveLength(1);
    expect(buzon.ultimo()?.para).toBe(datos.email);
    expect(buzon.ultimo()?.asunto).toMatch(/confirmá tu correo/i);
  });

  it("el correo trae un enlace que vuelve a la pantalla de confirmación", async () => {
    await registrar(app);

    const enlace = buzon.ultimoEnlace();
    expect(enlace).toBeDefined();

    const url = new URL(enlace as string);
    expect(url.pathname).toContain("verify-email");
    expect(url.searchParams.get("token")).toBeTruthy();
    expect(url.searchParams.get("callbackURL")).toContain(RUTA_CORREO_CONFIRMADO);
  });

  it("el correo avisa que además hace falta la aprobación de un admin", async () => {
    // Si solo dijera "confirmá tu correo", la persona lo confirmaría, intentaría
    // entrar y se encontraría con otro rechazo sin entender por qué.
    await registrar(app);

    expect(buzon.ultimo()?.texto).toMatch(/administrador/i);
  });

  it("no incluye la contraseña en el correo", async () => {
    const { datos } = await registrar(app);

    expect(buzon.ultimo()?.texto).not.toContain(datos.password);
    expect(buzon.ultimo()?.html).not.toContain(datos.password);
  });
});

describe("al tocar el enlace del correo", () => {
  it("confirma el correo y redirige a la pantalla de confirmación", async () => {
    const { datos } = await registrar(app);
    const enlace = buzon.ultimoEnlace() as string;

    const respuesta = await app.request(enlace.replace(URL_API, ""), { redirect: "manual" });

    expect(respuesta.status).toBeGreaterThanOrEqual(300);
    expect(respuesta.status).toBeLessThan(400);
    expect(respuesta.headers.get("location")).toContain(RUTA_CORREO_CONFIRMADO);

    const fila = await cliente.db.query.usuarios.findFirst({
      where: (tabla, { eq }) => eq(tabla.email, datos.email),
    });
    expect(fila?.emailVerified).toBe(true);
  });

  it("no deja entrar todavía: falta la aprobación", async () => {
    const { datos } = await registrar(app);
    const enlace = buzon.ultimoEnlace() as string;
    await app.request(enlace.replace(URL_API, ""), { redirect: "manual" });

    const respuesta = await entrarConUsuario(app, datos.usuario, datos.password);

    expect(respuesta.status).toBe(403);
    const cuerpo = await leerJson<RespuestaError>(respuesta);
    expect(cuerpo.error.codigo).toBe("CUENTA_PENDIENTE");
  });

  it("rechaza un token inventado sin confirmar nada", async () => {
    const { datos } = await registrar(app);

    await app.request(`${RUTA_BASE_AUTH}/verify-email?token=inventado-no-vale`, {
      redirect: "manual",
    });

    const fila = await cliente.db.query.usuarios.findFirst({
      where: (tabla, { eq }) => eq(tabla.email, datos.email),
    });
    expect(fila?.emailVerified).toBe(false);
  });
});

describe("los dos requisitos para entrar", () => {
  it("rechaza si el correo no está confirmado, aunque la cuenta esté aprobada", async () => {
    const datos = await registrarAprobado(app, cliente, { emailVerificado: false });

    const respuesta = await entrarConUsuario(app, datos.usuario, datos.password);

    expect(respuesta.status).toBeGreaterThanOrEqual(400);
    const cuerpo = await leerJson<RespuestaError>(respuesta);
    expect(cuerpo.error.codigo).toBe("EMAIL_NO_VERIFICADO");
  });

  it("rechaza si la cuenta no está aprobada, aunque el correo esté confirmado", async () => {
    const datos = await registrarAprobado(app, cliente, {
      estado: ESTADOS_CUENTA.pendiente,
      emailVerificado: true,
    });

    const respuesta = await entrarConUsuario(app, datos.usuario, datos.password);

    expect(respuesta.status).toBe(403);
    const cuerpo = await leerJson<RespuestaError>(respuesta);
    expect(cuerpo.error.codigo).toBe("CUENTA_PENDIENTE");
  });

  it("deja entrar solo cuando se cumplen las dos", async () => {
    const datos = await registrarAprobado(app, cliente, {
      estado: ESTADOS_CUENTA.pendiente,
      emailVerificado: false,
    });

    // Falta todo.
    expect((await entrarConUsuario(app, datos.usuario, datos.password)).status).toBeGreaterThan(
      399,
    );

    // Solo el correo confirmado: sigue sin poder.
    await verificarEmail(cliente, datos.email);
    expect((await entrarConUsuario(app, datos.usuario, datos.password)).status).toBe(403);

    // Ahora sí, con la aprobación.
    await ponerEstado(cliente, datos.email, ESTADOS_CUENTA.aprobado);
    const final = await entrarConUsuario(app, datos.usuario, datos.password);

    expect(final.status).toBe(200);
    expect(cookiesDe(final)).toMatch(/session/i);
  });

  it("no crea ninguna sesión mientras falte confirmar el correo", async () => {
    const datos = await registrarAprobado(app, cliente, { emailVerificado: false });

    await entrarConUsuario(app, datos.usuario, datos.password);

    const sesiones = await cliente.db.query.sesiones.findMany();
    expect(sesiones).toHaveLength(0);
  });

  it("aplica lo mismo entrando por correo que por usuario", async () => {
    const datos = await registrarAprobado(app, cliente, { emailVerificado: false });

    const respuesta = await entrarConEmail(app, datos.email, datos.password);
    const cuerpo = await leerJson<RespuestaError>(respuesta);

    expect(cuerpo.error.codigo).toBe("EMAIL_NO_VERIFICADO");
  });

  it("confirmar el correo no inicia sesión por sí solo", async () => {
    // Verificar es solo el primer requisito. Si iniciara sesión acá, la persona
    // entraría sin haber pasado el segundo control.
    const { datos } = await registrar(app);
    await verificarEmail(cliente, datos.email);

    const sesiones = await cliente.db.query.sesiones.findMany();
    expect(sesiones).toHaveLength(0);
  });
});

describe("reenvío del correo de verificación", () => {
  it("se puede pedir de nuevo", async () => {
    const { datos } = await registrar(app);

    const respuesta = await app.request(`${RUTA_BASE_AUTH}/send-verification-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: datos.email, callbackURL: "/correo-confirmado" }),
    });

    expect(respuesta.status).toBe(200);
  });

  it("no revela si el correo existe", async () => {
    // Si respondiera distinto para un correo inexistente, este endpoint sería
    // una forma de averiguar qué direcciones tienen cuenta.
    const { datos } = await registrar(app);

    const existente = await app.request(`${RUTA_BASE_AUTH}/send-verification-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: datos.email, callbackURL: "/correo-confirmado" }),
    });
    const inexistente = await app.request(`${RUTA_BASE_AUTH}/send-verification-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "no.existe@ejemplo.test", callbackURL: "/correo-confirmado" }),
    });

    expect(inexistente.status).toBe(existente.status);
  });
});
