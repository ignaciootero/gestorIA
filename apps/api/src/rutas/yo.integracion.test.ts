// Tests de integracion de la sesion y de los permisos, contra gestion_test.

import type { ClienteDb } from "@gestoria/db";
import { ESTADOS_CUENTA, type RespuestaError, ROLES } from "@gestoria/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RUTA_BASE_AUTH } from "../auth/opciones.ts";
import {
  cookiesDe,
  entrarConUsuario,
  limpiarBase,
  registrar,
  registrarAprobado,
} from "../pruebas/auth-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../pruebas/entorno-de-prueba.ts";
import { ascenderAAdmin, buscarCuenta } from "../servicios/usuarios/cuentas.ts";

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

/** Registra, aprueba, entra y devuelve las cookies listas para reusar. */
async function entrar(): Promise<{ cookies: string; usuario: string; email: string }> {
  const datos = await registrarAprobado(app, cliente);
  const respuesta = await entrarConUsuario(app, datos.usuario, datos.password);
  return { cookies: cookiesDe(respuesta), usuario: datos.usuario, email: datos.email };
}

describe("GET /api/yo sin sesión", () => {
  it("responde 401 con el código NO_AUTENTICADO", async () => {
    const respuesta = await app.request("/api/yo");

    expect(respuesta.status).toBe(401);
    const cuerpo = await leerJson<RespuestaError>(respuesta);
    expect(cuerpo.error.codigo).toBe("NO_AUTENTICADO");
  });

  it("responde 401 con una cookie de sesión inventada", async () => {
    const respuesta = await app.request("/api/yo", {
      headers: { cookie: "gestion.session_token=inventado-no-existe" },
    });

    expect(respuesta.status).toBe(401);
  });
});

describe("GET /api/yo con sesión", () => {
  it("devuelve los datos de la persona que tiene la sesión", async () => {
    const { cookies, usuario, email } = await entrar();

    const respuesta = await app.request("/api/yo", { headers: { cookie: cookies } });

    expect(respuesta.status).toBe(200);
    const cuerpo = await leerJson<Record<string, unknown>>(respuesta);
    expect(cuerpo["usuario"]).toBe(usuario);
    expect(cuerpo["email"]).toBe(email);
    expect(cuerpo["rol"]).toBe(ROLES.usuario);
    expect(cuerpo["estado"]).toBe(ESTADOS_CUENTA.aprobado);
  });

  it("no expone campos internos de la librería de autenticación", async () => {
    const { cookies } = await entrar();

    const respuesta = await app.request("/api/yo", { headers: { cookie: cookies } });
    const cuerpo = await leerJson<Record<string, unknown>>(respuesta);

    for (const campo of ["password", "banReason", "banExpires", "emailVerified", "image"]) {
      expect(cuerpo).not.toHaveProperty(campo);
    }
  });

  it("deja de funcionar después de cerrar sesión", async () => {
    const { cookies } = await entrar();

    const salida = await app.request(`${RUTA_BASE_AUTH}/sign-out`, {
      method: "POST",
      headers: { cookie: cookies, "content-type": "application/json" },
      body: "{}",
    });
    expect(salida.status).toBe(200);

    const despues = await app.request("/api/yo", { headers: { cookie: cookies } });
    expect(despues.status).toBe(401);
  });

  it("deja de funcionar si se cierran las sesiones desde el servidor", async () => {
    // Es lo que pasa al bloquear una cuenta o al resetear una contraseña: la
    // cookie que la persona ya tenía no puede seguir sirviendo.
    const { cookies, usuario } = await entrar();

    const cuenta = await buscarCuenta(cliente, usuario);
    const { cerrarSesionesDe } = await import("../servicios/usuarios/cuentas.ts");
    await cerrarSesionesDe(cliente, cuenta?.id ?? "");

    const respuesta = await app.request("/api/yo", { headers: { cookie: cookies } });
    expect(respuesta.status).toBe(401);
  });
});

describe("permisos de administración", () => {
  it("un usuario común no puede listar usuarios", async () => {
    const { cookies } = await entrar();

    const respuesta = await app.request(`${RUTA_BASE_AUTH}/admin/list-users?limit=10`, {
      headers: { cookie: cookies },
    });

    expect(respuesta.status).toBeGreaterThanOrEqual(400);
    expect(respuesta.status).toBeLessThan(500);
  });

  it("nadie puede impersonar a otra persona, ni siquiera un admin", async () => {
    const datos = await registrarAprobado(app, cliente);
    const cuenta = await buscarCuenta(cliente, datos.usuario);
    await ascenderAAdmin(cliente, cuenta?.id ?? "");

    const entrada = await entrarConUsuario(app, datos.usuario, datos.password);
    const cookies = cookiesDe(entrada);

    const otra = await registrar(app);
    const objetivo = await buscarCuenta(cliente, otra.datos.usuario);

    const respuesta = await app.request(`${RUTA_BASE_AUTH}/admin/impersonate-user`, {
      method: "POST",
      headers: { cookie: cookies, "content-type": "application/json" },
      body: JSON.stringify({ userId: objetivo?.id }),
    });

    expect(respuesta.status).toBe(403);
    const cuerpo = await leerJson<RespuestaError>(respuesta);
    expect(cuerpo.error.codigo).toBe("SIN_PERMISO");

    const sesionesDelObjetivo = await cliente.db.query.sesiones.findMany({
      where: (tabla, { eq }) => eq(tabla.userId, objetivo?.id ?? ""),
    });
    expect(sesionesDelObjetivo).toHaveLength(0);
  });
});

describe("rutas inexistentes bajo la API", () => {
  it("responde 404 con el formato único de error", async () => {
    const respuesta = await app.request("/api/no-existe");

    expect(respuesta.status).toBe(404);
    const cuerpo = await leerJson<RespuestaError>(respuesta);
    expect(cuerpo.error.codigo).toBe("NO_ENCONTRADO");
  });
});

describe("colores de acento", () => {
  async function guardar(cookies: string, cuerpo: unknown): Promise<Response> {
    return app.request("/api/yo/colores", {
      method: "PUT",
      headers: { cookie: cookies, "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
  }

  async function colores(cookies: string): Promise<unknown> {
    const respuesta = await app.request("/api/yo", { headers: { cookie: cookies } });
    return (await leerJson<Record<string, unknown>>(respuesta))["coloresDeAcento"];
  }

  it("una cuenta nueva usa los de la app (null en los dos modos)", async () => {
    const { cookies } = await entrar();
    expect(await colores(cookies)).toEqual({ claro: null, oscuro: null });
  });

  it("guarda un color por modo, en minúsculas, y GET /api/yo los devuelve", async () => {
    const { cookies } = await entrar();

    const respuesta = await guardar(cookies, { claro: "#7C3AED", oscuro: "#fde047" });
    expect(respuesta.status).toBe(200);
    expect(await leerJson(respuesta)).toEqual({ claro: "#7c3aed", oscuro: "#fde047" });
    expect(await colores(cookies)).toEqual({ claro: "#7c3aed", oscuro: "#fde047" });
  });

  it("con null vuelve al color de la app, en un modo sin tocar el otro", async () => {
    const { cookies } = await entrar();
    await guardar(cookies, { claro: "#7c3aed", oscuro: "#fde047" });

    await guardar(cookies, { claro: null, oscuro: "#fde047" });
    expect(await colores(cookies)).toEqual({ claro: null, oscuro: "#fde047" });

    await guardar(cookies, { claro: null, oscuro: null });
    expect(await colores(cookies)).toEqual({ claro: null, oscuro: null });
  });

  it.each([
    ["un color sin #", { claro: "7c3aed", oscuro: null }],
    ["un color corto", { claro: "#fff", oscuro: null }],
    ["un nombre de color", { claro: "teal", oscuro: null }],
    ["un modo de menos", { claro: "#7c3aed" }],
    ["un campo de más", { claro: null, oscuro: null, otro: "#000000" }],
    ["algo que no es un objeto", "#7c3aed"],
  ])("rechaza %s con 400 y no cambia nada", async (_caso, cuerpo) => {
    const { cookies } = await entrar();
    await guardar(cookies, { claro: "#123456", oscuro: null });

    const respuesta = await guardar(cookies, cuerpo);
    expect(respuesta.status).toBe(400);
    const error = await leerJson<RespuestaError>(respuesta);
    expect(error.error.codigo).toBe("VALIDACION_INVALIDA");
    expect(await colores(cookies)).toEqual({ claro: "#123456", oscuro: null });
  });

  it("sin sesión responde 401", async () => {
    const respuesta = await app.request("/api/yo/colores", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ claro: null, oscuro: null }),
    });
    expect(respuesta.status).toBe(401);
  });

  it("cada persona cambia solo los suyos", async () => {
    const una = await entrar();
    const otra = await entrar();

    await guardar(una.cookies, { claro: "#7c3aed", oscuro: "#7c3aed" });
    expect(await colores(otra.cookies)).toEqual({ claro: null, oscuro: null });
  });

  it("no se pueden cambiar por las rutas de Better Auth (update-user)", async () => {
    const { cookies } = await entrar();

    await app.request(`${RUTA_BASE_AUTH}/update-user`, {
      method: "POST",
      headers: { cookie: cookies, "content-type": "application/json" },
      body: JSON.stringify({ colorDeAcentoClaro: "#ff0000" }),
    });
    expect(await colores(cookies)).toEqual({ claro: null, oscuro: null });
  });
});
