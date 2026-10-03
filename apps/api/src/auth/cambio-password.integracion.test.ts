// Tests de integracion del cambio de contraseña, contra la base gestion_test real.
//
// `/change-password` es de Better Auth: no se reimplementa, solo se verifica el
// hook que apaga `debeCambiarPassword` despues de un cambio exitoso
// (apps/api/src/auth/crear-auth.ts).

import type { ClienteDb } from "@gestoria/db";
import type { RespuestaError } from "@gestoria/shared";
import type { DatosUsuarioDePrueba } from "@gestoria/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  cookiesDe,
  entrarConUsuario,
  limpiarBase,
  ponerDebeCambiarPassword,
  registrarAprobado,
} from "../pruebas/auth-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../pruebas/entorno-de-prueba.ts";
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

/** Registra, aprueba y entra. Devuelve las cookies y los datos de la cuenta. */
async function entrar(): Promise<{ cookies: string; datos: DatosUsuarioDePrueba }> {
  const datos = await registrarAprobado(app, cliente);
  const respuesta = await entrarConUsuario(app, datos.usuario, datos.password);
  return { cookies: cookiesDe(respuesta), datos };
}

describe("POST /api/auth/change-password", () => {
  it("cambia la contraseña y permite entrar con la nueva", async () => {
    const { cookies, datos } = await entrar();

    const cambio = await app.request(`${RUTA_BASE_AUTH}/change-password`, {
      method: "POST",
      headers: { cookie: cookies, "content-type": "application/json" },
      body: JSON.stringify({
        currentPassword: datos.password,
        newPassword: "otra-contraseña-nueva",
        revokeOtherSessions: true,
      }),
    });

    expect(cambio.status).toBe(200);

    const conVieja = await entrarConUsuario(app, datos.usuario, datos.password);
    expect(conVieja.status).toBeGreaterThanOrEqual(400);

    const conNueva = await entrarConUsuario(app, datos.usuario, "otra-contraseña-nueva");
    expect(conNueva.status).toBe(200);
  });

  it("apaga debeCambiarPassword al cambiarla con éxito", async () => {
    const { cookies, datos } = await entrar();
    await ponerDebeCambiarPassword(cliente, datos.email);

    // buscarCuenta no expone debeCambiarPassword (no es un dato de UI), asi
    // que se lee directo de la base.
    const filaAntes = await cliente.db.query.usuarios.findFirst({
      where: (tabla, { eq }) => eq(tabla.email, datos.email),
    });
    expect(filaAntes?.debeCambiarPassword).toBe(true);

    const cambio = await app.request(`${RUTA_BASE_AUTH}/change-password`, {
      method: "POST",
      headers: { cookie: cookies, "content-type": "application/json" },
      body: JSON.stringify({
        currentPassword: datos.password,
        newPassword: "otra-contraseña-nueva",
        revokeOtherSessions: true,
      }),
    });
    expect(cambio.status).toBe(200);

    const filaDespues = await cliente.db.query.usuarios.findFirst({
      where: (tabla, { eq }) => eq(tabla.email, datos.email),
    });
    expect(filaDespues?.debeCambiarPassword).toBe(false);
  });

  it("no toca debeCambiarPassword si el cambio falla por contraseña actual incorrecta", async () => {
    const { cookies, datos } = await entrar();
    await ponerDebeCambiarPassword(cliente, datos.email);

    const cambio = await app.request(`${RUTA_BASE_AUTH}/change-password`, {
      method: "POST",
      headers: { cookie: cookies, "content-type": "application/json" },
      body: JSON.stringify({
        currentPassword: "no-es-la-contraseña",
        newPassword: "otra-contraseña-nueva",
      }),
    });

    expect(cambio.status).toBeGreaterThanOrEqual(400);
    const cuerpo = await leerJson<RespuestaError>(cambio);
    // Mismo código que credenciales invalidas de login: no hay que revelar si
    // el problema fue la contraseña actual o cualquier otra cosa.
    expect(cuerpo.error.codigo).toBe("CREDENCIALES_INVALIDAS");

    const fila = await cliente.db.query.usuarios.findFirst({
      where: (tabla, { eq }) => eq(tabla.email, datos.email),
    });
    expect(fila?.debeCambiarPassword).toBe(true);
  });

  it("responde 401 sin sesión", async () => {
    const respuesta = await app.request(`${RUTA_BASE_AUTH}/change-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: "x", newPassword: "otra-contraseña-nueva" }),
    });

    expect(respuesta.status).toBe(401);
  });
});
