// Tests de integración de los presupuestos, contra gestion_test.

import type { ClienteDb } from "@gestoria/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  cookiesDe,
  entrarConUsuario,
  limpiarBase,
  registrarAprobado,
} from "../../pruebas/auth-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../../pruebas/entorno-de-prueba.ts";
import { abrirPeriodo, cerrarPeriodo } from "../../pruebas/periodos-de-prueba.ts";
import { buscarCuenta } from "../usuarios/cuentas.ts";

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

async function entrarComoUsuario(): Promise<{ cookies: string; id: string }> {
  const datos = await registrarAprobado(app, cliente);
  const cuenta = await buscarCuenta(cliente, datos.usuario);
  const respuesta = await entrarConUsuario(app, datos.usuario, datos.password);
  return { cookies: cookiesDe(respuesta), id: cuenta?.id ?? "" };
}

type CategoriaJson = { id: number; nombre: string };
type CuentaJson = { id: string; nombre: string };

/** Entra y deja lista una categoría, una cuenta y dos períodos: Agosto (cerrado) y Setiembre (abierto). */
async function prepararEntorno(): Promise<{
  cookies: string;
  categoriaId: number;
  cuentaId: string;
  agostoId: number;
  setiembreId: number;
}> {
  const { cookies } = await entrarComoUsuario();
  const agosto = await abrirPeriodo(app, cookies, {
    nombre: "Agosto",
    aperturaEn: "2026-08-01T00:00:00.000Z",
  });
  await cerrarPeriodo(app, cookies, agosto.id, { cierreEn: "2026-09-01T00:00:00.000Z" });
  const setiembre = await abrirPeriodo(app, cookies, {
    nombre: "Setiembre",
    aperturaEn: "2026-09-01T00:00:00.000Z",
  });
  const categorias = await leerJson<{ categorias: CategoriaJson[] }>(
    await app.request("/api/finanzas/categorias", { headers: { cookie: cookies } }),
  );
  const cuentas = await leerJson<{ cuentas: CuentaJson[] }>(
    await app.request("/api/finanzas/cuentas", { headers: { cookie: cookies } }),
  );
  return {
    cookies,
    categoriaId: categorias.categorias[0]?.id ?? 0,
    cuentaId: cuentas.cuentas[0]?.id ?? "",
    agostoId: agosto.id,
    setiembreId: setiembre.id,
  };
}

describe("PUT /api/finanzas/presupuestos/:categoriaId", () => {
  it("responde 401 sin sesión", async () => {
    const respuesta = await app.request(
      "/api/finanzas/presupuestos/00000000-0000-0000-0000-000000000000",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ monto: 100 }),
      },
    );
    expect(respuesta.status).toBe(401);
  });

  it("fija un presupuesto nuevo", async () => {
    const entorno = await prepararEntorno();

    const respuesta = await app.request(`/api/finanzas/presupuestos/${entorno.categoriaId}`, {
      method: "PUT",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: JSON.stringify({ monto: 5000 }),
    });

    expect(respuesta.status).toBe(200);
  });

  it("volver a fijarlo actualiza el mismo, no crea uno nuevo", async () => {
    const entorno = await prepararEntorno();
    await app.request(`/api/finanzas/presupuestos/${entorno.categoriaId}`, {
      method: "PUT",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: JSON.stringify({ monto: 5000 }),
    });
    await app.request(`/api/finanzas/presupuestos/${entorno.categoriaId}`, {
      method: "PUT",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: JSON.stringify({ monto: 8000 }),
    });

    const cuerpo = await leerJson<{
      presupuestos: { categoriaId: number; presupuestadoCentavos: number }[];
    }>(
      await app.request(`/api/finanzas/presupuestos?periodoId=${entorno.setiembreId}`, {
        headers: { cookie: entorno.cookies },
      }),
    );

    expect(cuerpo.presupuestos).toHaveLength(1);
    expect(cuerpo.presupuestos[0]?.presupuestadoCentavos).toBe(800_000);
  });

  it("rechaza un monto negativo", async () => {
    const entorno = await prepararEntorno();

    const respuesta = await app.request(`/api/finanzas/presupuestos/${entorno.categoriaId}`, {
      method: "PUT",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: JSON.stringify({ monto: -1 }),
    });

    expect(respuesta.status).toBe(400);
  });

  it("responde 404 para una categoría que no existe o no es del usuario", async () => {
    const primero = await prepararEntorno();
    const segundo = await prepararEntorno();

    const respuesta = await app.request(`/api/finanzas/presupuestos/${segundo.categoriaId}`, {
      method: "PUT",
      headers: { cookie: primero.cookies, "content-type": "application/json" },
      body: JSON.stringify({ monto: 100 }),
    });

    expect(respuesta.status).toBe(404);
  });
});

describe("GET /api/finanzas/presupuestos", () => {
  it("solo lista las categorías con presupuesto fijado", async () => {
    const entorno = await prepararEntorno();

    const cuerpo = await leerJson<{ presupuestos: unknown[] }>(
      await app.request(`/api/finanzas/presupuestos?periodoId=${entorno.setiembreId}`, {
        headers: { cookie: entorno.cookies },
      }),
    );

    expect(cuerpo.presupuestos).toHaveLength(0);
  });

  it("calcula lo gastado del período y lo que resta, y detecta cuando se supera", async () => {
    const entorno = await prepararEntorno();
    await app.request(`/api/finanzas/presupuestos/${entorno.categoriaId}`, {
      method: "PUT",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: JSON.stringify({ monto: 100 }),
    });
    await app.request("/api/finanzas/movimientos", {
      method: "POST",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: JSON.stringify({
        tipo: "gasto",
        importe: 150,
        descripcion: "Me pasé",
        categoriaId: entorno.categoriaId,
        cuentaFinancieraId: entorno.cuentaId,
        fecha: "2026-09-10T12:00:00.000Z",
      }),
    });
    // Del período anterior: no debe contar para el gasto de Setiembre.
    await app.request("/api/finanzas/movimientos", {
      method: "POST",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: JSON.stringify({
        tipo: "gasto",
        importe: 999,
        descripcion: "Mes pasado",
        categoriaId: entorno.categoriaId,
        cuentaFinancieraId: entorno.cuentaId,
        fecha: "2026-08-15T12:00:00.000Z",
      }),
    });

    const cuerpo = await leerJson<{
      presupuestos: {
        presupuestadoCentavos: number;
        gastadoCentavos: number;
        restanteCentavos: number;
      }[];
    }>(
      await app.request(`/api/finanzas/presupuestos?periodoId=${entorno.setiembreId}`, {
        headers: { cookie: entorno.cookies },
      }),
    );

    const presupuesto = cuerpo.presupuestos[0];
    expect(presupuesto?.presupuestadoCentavos).toBe(10_000);
    expect(presupuesto?.gastadoCentavos).toBe(15_000);
    expect(presupuesto?.restanteCentavos).toBe(-5_000);
  });

  it("el mismo límite vale para cada período y lo gastado se calcula en el que se mira", async () => {
    const entorno = await prepararEntorno();
    await app.request(`/api/finanzas/presupuestos/${entorno.categoriaId}`, {
      method: "PUT",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: JSON.stringify({ monto: 1000 }),
    });
    for (const [importe, fecha] of [
      [100, "2026-08-15T12:00:00.000Z"],
      [250, "2026-09-15T12:00:00.000Z"],
    ] as const) {
      await app.request("/api/finanzas/movimientos", {
        method: "POST",
        headers: { cookie: entorno.cookies, "content-type": "application/json" },
        body: JSON.stringify({
          tipo: "gasto",
          importe,
          descripcion: "Gasto",
          categoriaId: entorno.categoriaId,
          cuentaFinancieraId: entorno.cuentaId,
          fecha,
        }),
      });
    }

    type Respuesta = {
      presupuestos: { presupuestadoCentavos: number; gastadoCentavos: number }[];
    };
    const deAgosto = await leerJson<Respuesta>(
      await app.request(`/api/finanzas/presupuestos?periodoId=${entorno.agostoId}`, {
        headers: { cookie: entorno.cookies },
      }),
    );
    const deSetiembre = await leerJson<Respuesta>(
      await app.request(`/api/finanzas/presupuestos?periodoId=${entorno.setiembreId}`, {
        headers: { cookie: entorno.cookies },
      }),
    );

    expect(deAgosto.presupuestos[0]).toMatchObject({
      presupuestadoCentavos: 100_000,
      gastadoCentavos: 10_000,
    });
    expect(deSetiembre.presupuestos[0]).toMatchObject({
      presupuestadoCentavos: 100_000,
      gastadoCentavos: 25_000,
    });
  });

  it("no cuenta como gasto del presupuesto un ingreso de la misma categoría", async () => {
    const entorno = await prepararEntorno();
    await app.request(`/api/finanzas/presupuestos/${entorno.categoriaId}`, {
      method: "PUT",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: JSON.stringify({ monto: 100 }),
    });
    await app.request("/api/finanzas/movimientos", {
      method: "POST",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: JSON.stringify({
        tipo: "ingreso",
        importe: 500,
        descripcion: "Reintegro",
        categoriaId: entorno.categoriaId,
        cuentaFinancieraId: entorno.cuentaId,
        fecha: "2026-09-10T12:00:00.000Z",
      }),
    });

    const cuerpo = await leerJson<{ presupuestos: { gastadoCentavos: number }[] }>(
      await app.request(`/api/finanzas/presupuestos?periodoId=${entorno.setiembreId}`, {
        headers: { cookie: entorno.cookies },
      }),
    );

    expect(cuerpo.presupuestos[0]?.gastadoCentavos).toBe(0);
  });

  it("rechaza un periodoId ausente o inválido y responde 404 con uno inexistente o ajeno", async () => {
    const dueno = await prepararEntorno();
    const intruso = await prepararEntorno();

    const pedir = (cookies: string, consulta: string) =>
      app.request(`/api/finanzas/presupuestos${consulta}`, { headers: { cookie: cookies } });

    expect((await pedir(dueno.cookies, "")).status).toBe(400);
    expect((await pedir(dueno.cookies, "?periodoId=abc")).status).toBe(400);
    expect((await pedir(dueno.cookies, "?periodoId=999999")).status).toBe(404);
    expect((await pedir(intruso.cookies, `?periodoId=${dueno.setiembreId}`)).status).toBe(404);
  });

  it("no ve los presupuestos de otro usuario", async () => {
    const primero = await prepararEntorno();
    const segundo = await prepararEntorno();
    await app.request(`/api/finanzas/presupuestos/${primero.categoriaId}`, {
      method: "PUT",
      headers: { cookie: primero.cookies, "content-type": "application/json" },
      body: JSON.stringify({ monto: 100 }),
    });

    const cuerpo = await leerJson<{ presupuestos: unknown[] }>(
      await app.request(`/api/finanzas/presupuestos?periodoId=${segundo.setiembreId}`, {
        headers: { cookie: segundo.cookies },
      }),
    );
    expect(cuerpo.presupuestos).toHaveLength(0);
  });
});

describe("DELETE /api/finanzas/presupuestos/:categoriaId", () => {
  it("borra el presupuesto", async () => {
    const entorno = await prepararEntorno();
    await app.request(`/api/finanzas/presupuestos/${entorno.categoriaId}`, {
      method: "PUT",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: JSON.stringify({ monto: 100 }),
    });

    const respuesta = await app.request(`/api/finanzas/presupuestos/${entorno.categoriaId}`, {
      method: "DELETE",
      headers: { cookie: entorno.cookies },
    });
    expect(respuesta.status).toBe(200);

    const cuerpo = await leerJson<{ presupuestos: unknown[] }>(
      await app.request(`/api/finanzas/presupuestos?periodoId=${entorno.setiembreId}`, {
        headers: { cookie: entorno.cookies },
      }),
    );
    expect(cuerpo.presupuestos).toHaveLength(0);
  });

  it("responde 404 si no había presupuesto", async () => {
    const entorno = await prepararEntorno();

    const respuesta = await app.request(`/api/finanzas/presupuestos/${entorno.categoriaId}`, {
      method: "DELETE",
      headers: { cookie: entorno.cookies },
    });

    expect(respuesta.status).toBe(404);
  });

  it("al borrar la categoría, su presupuesto desaparece con ella", async () => {
    const entorno = await prepararEntorno();
    await app.request(`/api/finanzas/presupuestos/${entorno.categoriaId}`, {
      method: "PUT",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: JSON.stringify({ monto: 100 }),
    });

    await app.request(`/api/finanzas/categorias/${entorno.categoriaId}`, {
      method: "DELETE",
      headers: { cookie: entorno.cookies },
    });

    const cuerpo = await leerJson<{ presupuestos: unknown[] }>(
      await app.request(`/api/finanzas/presupuestos?periodoId=${entorno.setiembreId}`, {
        headers: { cookie: entorno.cookies },
      }),
    );
    expect(cuerpo.presupuestos).toHaveLength(0);
  });
});
