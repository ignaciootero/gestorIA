// Tests del rate limiting de autenticacion, contra gestion_test.
//
// Corren aislados del resto porque consumen deliberadamente el limite: cada
// test parte de la tabla de contadores vacia.

import type { ClienteDb } from "@gestoria/db";
import type { RespuestaError } from "@gestoria/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  entrarConUsuario,
  limpiarBase,
  registrar,
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

describe("rate limiting del login", () => {
  it("corta después de varios intentos fallidos seguidos", async () => {
    const datos = await registrarAprobado(app, cliente);

    // El límite configurado es 10 intentos cada 5 minutos.
    const estados: number[] = [];
    for (let intento = 0; intento < 14; intento += 1) {
      const respuesta = await entrarConUsuario(app, datos.usuario, "contrasena-equivocada-123");
      estados.push(respuesta.status);
    }

    expect(estados).toContain(429);
  });

  it("responde el corte con el código DEMASIADOS_INTENTOS", async () => {
    const datos = await registrarAprobado(app, cliente);

    let cortada: Response | undefined;
    for (let intento = 0; intento < 14 && !cortada; intento += 1) {
      const respuesta = await entrarConUsuario(app, datos.usuario, "contrasena-equivocada-123");
      if (respuesta.status === 429) cortada = respuesta;
    }

    expect(cortada).toBeDefined();
    const cuerpo = await leerJson<RespuestaError>(cortada as Response);
    expect(cuerpo.error.codigo).toBe("DEMASIADOS_INTENTOS");
    expect(cuerpo.error.mensaje).toMatch(/minutos|intentos/i);
  });

  it("guarda los contadores en la base y no en memoria", async () => {
    // En la base sobreviven a un reinicio y sirven aunque mañana haya más de un
    // proceso de la API.
    const datos = await registrarAprobado(app, cliente);
    await entrarConUsuario(app, datos.usuario, "contrasena-equivocada-123");

    const contadores = await cliente.db.query.limitesPeticiones.findMany();
    expect(contadores.length).toBeGreaterThan(0);
  });
});

describe("rate limiting del registro", () => {
  it("corta después de varios registros seguidos desde el mismo origen", async () => {
    // El límite configurado es 5 registros por hora.
    const estados: number[] = [];
    for (let intento = 0; intento < 9; intento += 1) {
      const { respuesta } = await registrar(app);
      estados.push(respuesta.status);
    }

    expect(estados).toContain(429);
  });
});
