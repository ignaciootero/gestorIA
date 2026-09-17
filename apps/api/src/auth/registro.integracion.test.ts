// Tests de integracion del registro, contra la base gestion_test real.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import { ESTADOS_CUENTA, type RespuestaError, ROLES } from "@gestoria/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { limpiarBase, registrar } from "../pruebas/auth-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../pruebas/entorno-de-prueba.ts";
import { buscarCuenta } from "../servicios/usuarios/cuentas.ts";
import { RUTA_BASE_AUTH } from "./opciones.ts";

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

describe("registro de una cuenta nueva", () => {
  it("crea la cuenta como pendiente y con rol de usuario común", async () => {
    const { respuesta, datos } = await registrar(app);

    expect(respuesta.status).toBe(200);

    const cuenta = await buscarCuenta(cliente, datos.usuario);
    expect(cuenta?.estado).toBe(ESTADOS_CUENTA.pendiente);
    expect(cuenta?.rol).toBe(ROLES.usuario);
    expect(cuenta?.nombre).toBe(datos.nombre);
    expect(cuenta?.apellido).toBe(datos.apellido);
  });

  it("no inicia sesión: registrarse no da acceso", async () => {
    const { respuesta } = await registrar(app);

    const cookies = respuesta.headers.getSetCookie().join(";");
    expect(cookies).not.toMatch(/session/i);
  });

  it("aplica la zona horaria y la moneda por defecto", async () => {
    const { datos } = await registrar(app);

    const fila = await cliente.db.query.usuarios.findFirst({
      where: (tabla, { eq }) => eq(tabla.username, datos.usuario),
    });

    expect(fila?.zonaHoraria).toBe("America/Montevideo");
    expect(fila?.monedaPorDefecto).toBe("UYU");
    expect(fila?.debeCambiarPassword).toBe(false);
  });

  it("encuentra la cuenta tanto por usuario como por correo", async () => {
    const { datos } = await registrar(app);

    const porUsuario = await buscarCuenta(cliente, datos.usuario);
    const porEmail = await buscarCuenta(cliente, datos.email);

    expect(porUsuario?.id).toBe(porEmail?.id);
  });

  it("encuentra la cuenta aunque se escriba con mayúsculas", async () => {
    const { datos } = await registrar(app);

    const cuenta = await buscarCuenta(cliente, datos.email.toUpperCase());
    expect(cuenta?.email).toBe(datos.email);
  });
});

describe("registro con datos que ya existen", () => {
  it("rechaza un usuario ya ocupado con el código USUARIO_EN_USO", async () => {
    const { datos } = await registrar(app);
    const { respuesta } = await registrar(app, { usuario: datos.usuario });

    expect(respuesta.status).toBeGreaterThanOrEqual(400);
    const cuerpo = await leerJson<RespuestaError>(respuesta);
    expect(cuerpo.error.codigo).toBe("USUARIO_EN_USO");
  });

  it("no crea una segunda cuenta si el correo ya está registrado", async () => {
    const { datos } = await registrar(app);
    await registrar(app, { email: datos.email });

    const cuentas = await cliente.db.select().from(esquema.usuarios);
    expect(cuentas).toHaveLength(1);
  });

  it("no revela que un correo ya está registrado", async () => {
    // Better Auth responde igual que ante un registro nuevo, a propósito: si
    // contestara "ese correo ya existe", cualquiera podría averiguar qué correos
    // tienen cuenta probándolos de a uno. La privacidad está por encima de la
    // comodidad (CLAUDE.md, Prioridades ante conflictos).
    const { datos } = await registrar(app);
    const otra = await registrar(app);
    const repetida = await registrar(app, { email: datos.email });

    expect(repetida.respuesta.status).toBe(otra.respuesta.status);

    const texto = await repetida.respuesta.text();
    expect(texto).not.toMatch(/ya existe|already exists|en uso/i);
  });
});

describe("registro con datos inválidos", () => {
  it("rechaza una contraseña demasiado corta", async () => {
    const { respuesta } = await registrar(app, { password: "corta" });

    expect(respuesta.status).toBeGreaterThanOrEqual(400);
  });

  it("rechaza un correo mal formado", async () => {
    const { respuesta } = await registrar(app, { email: "esto-no-es-un-correo" });

    expect(respuesta.status).toBeGreaterThanOrEqual(400);
  });

  it("rechaza un usuario con caracteres no permitidos", async () => {
    const { respuesta } = await registrar(app, { usuario: "con espacios y ñ" });

    expect(respuesta.status).toBeGreaterThanOrEqual(400);
  });

  it("responde los errores con el formato único de la API", async () => {
    const { respuesta } = await registrar(app, { email: "no-es-un-correo" });
    const cuerpo = await leerJson<RespuestaError>(respuesta);

    expect(typeof cuerpo.error.codigo).toBe("string");
    expect(typeof cuerpo.error.mensaje).toBe("string");
    expect(cuerpo.error.idPeticion).toBe(respuesta.headers.get("x-request-id"));
  });

  it("no filtra detalles técnicos en los errores de registro", async () => {
    const { respuesta } = await registrar(app, { email: "no-es-un-correo" });
    const texto = await respuesta.text();

    expect(texto).not.toMatch(/stack|node_modules/i);
    expect(texto).not.toMatch(/insert into|drizzle/i);
  });
});

describe("protecciones del registro", () => {
  it("rechaza el registro si vino completo el campo honeypot", async () => {
    const { respuesta, datos } = await registrar(app, { honeypot: "soy-un-bot" });

    expect(respuesta.status).toBeGreaterThanOrEqual(400);
    expect(await buscarCuenta(cliente, datos.usuario)).toBeNull();
  });

  it("acepta el registro si el honeypot viene vacío, como lo manda el navegador", async () => {
    const { respuesta, datos } = await registrar(app, { honeypot: "" });

    expect(respuesta.status).toBe(200);
    expect(await buscarCuenta(cliente, datos.usuario)).not.toBeNull();
  });

  it("rechaza un registro que intente asignarse rol o estado", async () => {
    const respuesta = await app.request(`${RUTA_BASE_AUTH}/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "intruso@ejemplo.test",
        password: "contrasena-de-prueba-123",
        name: "In Truso",
        username: "intruso",
        nombre: "In",
        apellido: "Truso",
        // Lo que probaría mandar un atacante. Están declarados como input:false,
        // así que mandarlos no se ignora en silencio: se rechaza la petición.
        role: ROLES.admin,
        estado: ESTADOS_CUENTA.aprobado,
      }),
    });

    expect(respuesta.status).toBe(400);
    expect(await buscarCuenta(cliente, "intruso")).toBeNull();
  });

  it("no deja ninguna cuenta admin ni aprobada tras registros normales", async () => {
    await registrar(app);
    await registrar(app);

    const cuentas = await cliente.db.select().from(esquema.usuarios);
    expect(cuentas).toHaveLength(2);
    for (const cuenta of cuentas) {
      expect(cuenta.role).toBe(ROLES.usuario);
      expect(cuenta.estado).toBe(ESTADOS_CUENTA.pendiente);
      expect(cuenta.banned).toBe(false);
    }
  });
});
