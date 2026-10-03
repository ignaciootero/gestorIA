// Tests de integración de los movimientos, contra la base gestion_test real.

import type { ClienteDb } from "@gestoria/db";
import type { RespuestaError } from "@gestoria/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  cookiesDe,
  entrarConUsuario,
  limpiarBase,
  registrarAprobado,
} from "../../pruebas/auth-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../../pruebas/entorno-de-prueba.ts";
import {
  abrirPeriodo,
  abrirPeriodoAmplio,
  cerrarPeriodo,
  type PeriodoJson,
} from "../../pruebas/periodos-de-prueba.ts";
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
type MovimientoJson = {
  id: string;
  tipo: string;
  importeCentavos: number;
  descripcion: string;
  fecha: string;
  periodoId: number;
  categoria: { id: number; nombre: string };
  cuentaFinanciera: { id: string; nombre: string };
};

/**
 * Entra, y deja lista una categoría y una cuenta para armar movimientos.
 * Por defecto también abre un período amplio (desde enero de 2026): casi todos
 * los tests necesitan que sus fechas fijas caigan en algún período. Los que
 * prueban períodos propios piden `{ conPeriodo: false }`.
 */
async function prepararEntorno({ conPeriodo = true }: { conPeriodo?: boolean } = {}): Promise<{
  cookies: string;
  userId: string;
  categoriaId: number;
  cuentaId: string;
  periodo: PeriodoJson | null;
}> {
  const { cookies, id: userId } = await entrarComoUsuario();
  const periodo = conPeriodo ? await abrirPeriodoAmplio(app, cookies) : null;
  const categorias = await leerJson<{ categorias: CategoriaJson[] }>(
    await app.request("/api/finanzas/categorias", { headers: { cookie: cookies } }),
  );
  const cuentas = await leerJson<{ cuentas: CuentaJson[] }>(
    await app.request("/api/finanzas/cuentas", { headers: { cookie: cookies } }),
  );
  return {
    cookies,
    userId,
    categoriaId: categorias.categorias[0]?.id ?? 0,
    cuentaId: cuentas.cuentas[0]?.id ?? "",
    periodo,
  };
}

function cuerpoMovimiento(
  entorno: { categoriaId: number; cuentaId: string },
  sobrescribir: Record<string, unknown> = {},
) {
  return JSON.stringify({
    tipo: "gasto",
    importe: 150.5,
    descripcion: "Supermercado",
    categoriaId: entorno.categoriaId,
    cuentaFinancieraId: entorno.cuentaId,
    fecha: "2026-09-15T12:00:00.000Z",
    ...sobrescribir,
  });
}

describe("permisos de /api/finanzas/movimientos", () => {
  it("responde 401 sin sesión", async () => {
    expect((await app.request("/api/finanzas/movimientos")).status).toBe(401);
  });
});

describe("POST /api/finanzas/movimientos", () => {
  it("crea un movimiento válido", async () => {
    const entorno = await prepararEntorno();

    const respuesta = await app.request("/api/finanzas/movimientos", {
      method: "POST",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: cuerpoMovimiento(entorno),
    });

    expect(respuesta.status).toBe(201);
    const movimiento = await leerJson<MovimientoJson>(respuesta);
    expect(movimiento.importeCentavos).toBe(15_050);
    expect(movimiento.categoria.id).toBe(entorno.categoriaId);
    expect(movimiento.cuentaFinanciera.id).toBe(entorno.cuentaId);
    expect(movimiento.fecha).toBe("2026-09-15T12:00:00.000Z");
    expect(movimiento.periodoId).toBe(entorno.periodo?.id);
  });

  it.each(["2026-09-15", "2026-09-15T12:00:00", "15/09/2026", ""])(
    "rechaza una fecha sin hora o sin zona: %j",
    async (fecha) => {
      const entorno = await prepararEntorno();

      const respuesta = await app.request("/api/finanzas/movimientos", {
        method: "POST",
        headers: { cookie: entorno.cookies, "content-type": "application/json" },
        body: cuerpoMovimiento(entorno, { fecha }),
      });

      expect(respuesta.status).toBe(400);
      const cuerpo = await leerJson<RespuestaError>(respuesta);
      expect(cuerpo.error.campos?.[0]?.campo).toBe("fecha");
    },
  );

  it.each([0, -10, Number.NaN])("rechaza un importe inválido: %s", async (importe) => {
    const entorno = await prepararEntorno();

    const respuesta = await app.request("/api/finanzas/movimientos", {
      method: "POST",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: cuerpoMovimiento(entorno, { importe }),
    });

    expect(respuesta.status).toBe(400);
  });

  it("rechaza una categoría que no es del usuario", async () => {
    const entorno = await prepararEntorno();
    const otro = await prepararEntorno();

    const respuesta = await app.request("/api/finanzas/movimientos", {
      method: "POST",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: cuerpoMovimiento(entorno, { categoriaId: otro.categoriaId }),
    });

    expect(respuesta.status).toBe(400);
    const cuerpo = await leerJson<RespuestaError>(respuesta);
    expect(cuerpo.error.campos?.[0]?.campo).toBe("categoriaId");
  });

  it("rechaza una categoría eliminada", async () => {
    const entorno = await prepararEntorno();
    await app.request(`/api/finanzas/categorias/${entorno.categoriaId}`, {
      method: "DELETE",
      headers: { cookie: entorno.cookies },
    });

    const respuesta = await app.request("/api/finanzas/movimientos", {
      method: "POST",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: cuerpoMovimiento(entorno),
    });

    expect(respuesta.status).toBe(400);
  });
});

describe("GET /api/finanzas/movimientos", () => {
  it("lista del más reciente al más viejo", async () => {
    const entorno = await prepararEntorno();
    await app.request("/api/finanzas/movimientos", {
      method: "POST",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: cuerpoMovimiento(entorno, { descripcion: "Viejo", fecha: "2026-09-01T12:00:00.000Z" }),
    });
    await app.request("/api/finanzas/movimientos", {
      method: "POST",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: cuerpoMovimiento(entorno, { descripcion: "Nuevo", fecha: "2026-09-20T12:00:00.000Z" }),
    });

    const cuerpo = await leerJson<{ movimientos: MovimientoJson[]; total: number }>(
      await app.request("/api/finanzas/movimientos", { headers: { cookie: entorno.cookies } }),
    );

    expect(cuerpo.total).toBe(2);
    expect(cuerpo.movimientos.map((m) => m.descripcion)).toEqual(["Nuevo", "Viejo"]);
  });

  it("ordena por hora cuando dos movimientos comparten día", async () => {
    const entorno = await prepararEntorno();
    await app.request("/api/finanzas/movimientos", {
      method: "POST",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: cuerpoMovimiento(entorno, {
        descripcion: "Mañana",
        fecha: "2026-09-10T11:00:00.000Z",
      }),
    });
    await app.request("/api/finanzas/movimientos", {
      method: "POST",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: cuerpoMovimiento(entorno, {
        descripcion: "Tarde",
        fecha: "2026-09-10T20:30:00.000Z",
      }),
    });

    const cuerpo = await leerJson<{ movimientos: MovimientoJson[] }>(
      await app.request("/api/finanzas/movimientos", { headers: { cookie: entorno.cookies } }),
    );

    expect(cuerpo.movimientos.map((m) => m.descripcion)).toEqual(["Tarde", "Mañana"]);
  });

  it("filtra por período", async () => {
    const entorno = await prepararEntorno({ conPeriodo: false });
    const agosto = await abrirPeriodo(app, entorno.cookies, {
      aperturaEn: "2026-08-01T00:00:00.000Z",
    });
    await cerrarPeriodo(app, entorno.cookies, agosto.id, { cierreEn: "2026-09-01T00:00:00.000Z" });
    const septiembre = await abrirPeriodo(app, entorno.cookies, {
      aperturaEn: "2026-09-01T00:00:00.000Z",
    });
    await app.request("/api/finanzas/movimientos", {
      method: "POST",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: cuerpoMovimiento(entorno, {
        descripcion: "De agosto",
        fecha: "2026-08-31T23:59:59.000Z",
      }),
    });
    await app.request("/api/finanzas/movimientos", {
      method: "POST",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: cuerpoMovimiento(entorno, {
        descripcion: "De septiembre",
        fecha: "2026-09-01T00:00:00.000Z",
      }),
    });

    const deAgosto = await leerJson<{ movimientos: MovimientoJson[]; total: number }>(
      await app.request(`/api/finanzas/movimientos?periodoId=${agosto.id}`, {
        headers: { cookie: entorno.cookies },
      }),
    );
    const deSeptiembre = await leerJson<{ movimientos: MovimientoJson[] }>(
      await app.request(`/api/finanzas/movimientos?periodoId=${septiembre.id}`, {
        headers: { cookie: entorno.cookies },
      }),
    );
    const todos = await leerJson<{ total: number }>(
      await app.request("/api/finanzas/movimientos", { headers: { cookie: entorno.cookies } }),
    );

    expect(deAgosto.movimientos.map((m) => m.descripcion)).toEqual(["De agosto"]);
    expect(deAgosto.total).toBe(1);
    expect(deSeptiembre.movimientos.map((m) => m.descripcion)).toEqual(["De septiembre"]);
    expect(todos.total).toBe(2);
  });

  it("filtrar por el período de otra persona no devuelve nada", async () => {
    const primero = await prepararEntorno();
    const segundo = await prepararEntorno();
    await app.request("/api/finanzas/movimientos", {
      method: "POST",
      headers: { cookie: primero.cookies, "content-type": "application/json" },
      body: cuerpoMovimiento(primero),
    });

    const cuerpo = await leerJson<{ movimientos: MovimientoJson[] }>(
      await app.request(`/api/finanzas/movimientos?periodoId=${primero.periodo?.id}`, {
        headers: { cookie: segundo.cookies },
      }),
    );

    expect(cuerpo.movimientos).toHaveLength(0);
  });

  it("rechaza un periodoId que no es un número positivo", async () => {
    const entorno = await prepararEntorno();

    for (const valor of ["abc", "0", "-3", "1.5"]) {
      const respuesta = await app.request(`/api/finanzas/movimientos?periodoId=${valor}`, {
        headers: { cookie: entorno.cookies },
      });
      expect(respuesta.status).toBe(400);
    }
  });

  it("filtra por tipo y busca por descripción", async () => {
    const entorno = await prepararEntorno();
    await app.request("/api/finanzas/movimientos", {
      method: "POST",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: cuerpoMovimiento(entorno, { tipo: "ingreso", descripcion: "Sueldo" }),
    });
    await app.request("/api/finanzas/movimientos", {
      method: "POST",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: cuerpoMovimiento(entorno, { tipo: "gasto", descripcion: "Supermercado" }),
    });

    const soloIngresos = await leerJson<{ movimientos: MovimientoJson[] }>(
      await app.request("/api/finanzas/movimientos?tipo=ingreso", {
        headers: { cookie: entorno.cookies },
      }),
    );
    expect(soloIngresos.movimientos).toHaveLength(1);
    expect(soloIngresos.movimientos[0]?.tipo).toBe("ingreso");

    const busqueda = await leerJson<{ movimientos: MovimientoJson[] }>(
      await app.request("/api/finanzas/movimientos?busqueda=super", {
        headers: { cookie: entorno.cookies },
      }),
    );
    expect(busqueda.movimientos).toHaveLength(1);
    expect(busqueda.movimientos[0]?.descripcion).toBe("Supermercado");
  });

  it("no ve los movimientos de otro usuario", async () => {
    const primero = await prepararEntorno();
    const segundo = await prepararEntorno();
    await app.request("/api/finanzas/movimientos", {
      method: "POST",
      headers: { cookie: primero.cookies, "content-type": "application/json" },
      body: cuerpoMovimiento(primero),
    });

    const cuerpo = await leerJson<{ movimientos: MovimientoJson[] }>(
      await app.request("/api/finanzas/movimientos", { headers: { cookie: segundo.cookies } }),
    );
    expect(cuerpo.movimientos).toHaveLength(0);
  });
});

describe("PATCH y DELETE /api/finanzas/movimientos/:id", () => {
  it("edita un movimiento propio", async () => {
    const entorno = await prepararEntorno();
    const creado = await leerJson<MovimientoJson>(
      await app.request("/api/finanzas/movimientos", {
        method: "POST",
        headers: { cookie: entorno.cookies, "content-type": "application/json" },
        body: cuerpoMovimiento(entorno),
      }),
    );

    const respuesta = await app.request(`/api/finanzas/movimientos/${creado.id}`, {
      method: "PATCH",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: cuerpoMovimiento(entorno, { descripcion: "Editado", importe: 200 }),
    });

    expect(respuesta.status).toBe(200);
    const editado = await leerJson<MovimientoJson>(respuesta);
    expect(editado.descripcion).toBe("Editado");
    expect(editado.importeCentavos).toBe(20_000);
  });

  it("responde 404 al intentar editar o borrar el movimiento de otra persona", async () => {
    const primero = await prepararEntorno();
    const segundo = await prepararEntorno();
    const creado = await leerJson<MovimientoJson>(
      await app.request("/api/finanzas/movimientos", {
        method: "POST",
        headers: { cookie: primero.cookies, "content-type": "application/json" },
        body: cuerpoMovimiento(primero),
      }),
    );

    const respuestaEditar = await app.request(`/api/finanzas/movimientos/${creado.id}`, {
      method: "PATCH",
      headers: { cookie: segundo.cookies, "content-type": "application/json" },
      body: cuerpoMovimiento(segundo, { descripcion: "Robado" }),
    });
    expect(respuestaEditar.status).toBe(404);

    const respuestaBorrar = await app.request(`/api/finanzas/movimientos/${creado.id}`, {
      method: "DELETE",
      headers: { cookie: segundo.cookies },
    });
    expect(respuestaBorrar.status).toBe(404);
  });

  it("borra lógicamente: desaparece del listado", async () => {
    const entorno = await prepararEntorno();
    const creado = await leerJson<MovimientoJson>(
      await app.request("/api/finanzas/movimientos", {
        method: "POST",
        headers: { cookie: entorno.cookies, "content-type": "application/json" },
        body: cuerpoMovimiento(entorno),
      }),
    );

    const borrado = await app.request(`/api/finanzas/movimientos/${creado.id}`, {
      method: "DELETE",
      headers: { cookie: entorno.cookies },
    });
    expect(borrado.status).toBe(200);

    const segundoBorrado = await app.request(`/api/finanzas/movimientos/${creado.id}`, {
      method: "DELETE",
      headers: { cookie: entorno.cookies },
    });
    expect(segundoBorrado.status).toBe(404);

    const cuerpo = await leerJson<{ movimientos: MovimientoJson[] }>(
      await app.request("/api/finanzas/movimientos", { headers: { cookie: entorno.cookies } }),
    );
    expect(cuerpo.movimientos).toHaveLength(0);
  });
});

describe("período de un movimiento", () => {
  async function cargar(
    entorno: { cookies: string; categoriaId: number; cuentaId: string },
    sobrescribir: Record<string, unknown> = {},
  ) {
    return app.request("/api/finanzas/movimientos", {
      method: "POST",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: cuerpoMovimiento(entorno, sobrescribir),
    });
  }

  /** Dos períodos seguidos (marzo y abril) con un hueco de abril a mayo y uno abierto desde mayo. */
  async function prepararConVariosPeriodos() {
    const entorno = await prepararEntorno({ conPeriodo: false });
    const marzo = await abrirPeriodo(app, entorno.cookies, {
      aperturaEn: "2026-03-01T00:00:00.000Z",
    });
    await cerrarPeriodo(app, entorno.cookies, marzo.id, { cierreEn: "2026-04-01T00:00:00.000Z" });
    const abril = await abrirPeriodo(app, entorno.cookies, {
      aperturaEn: "2026-04-01T00:00:00.000Z",
    });
    await cerrarPeriodo(app, entorno.cookies, abril.id, { cierreEn: "2026-04-30T00:00:00.000Z" });
    const junio = await abrirPeriodo(app, entorno.cookies, {
      aperturaEn: "2026-06-01T00:00:00.000Z",
    });
    return { ...entorno, marzo, abril, junio };
  }

  it("se asocia al período que contiene su fecha, aunque no sea el abierto", async () => {
    const entorno = await prepararConVariosPeriodos();

    const enMarzo = await leerJson<MovimientoJson>(
      await cargar(entorno, { fecha: "2026-03-15T12:00:00.000Z" }),
    );
    const enJunio = await leerJson<MovimientoJson>(
      await cargar(entorno, { fecha: "2026-06-15T12:00:00.000Z" }),
    );

    expect(enMarzo.periodoId).toBe(entorno.marzo.id);
    expect(enJunio.periodoId).toBe(entorno.junio.id);
  });

  it("la apertura pertenece al período y el cierre al siguiente: un movimiento no cae en dos", async () => {
    const entorno = await prepararConVariosPeriodos();

    const enApertura = await leerJson<MovimientoJson>(
      await cargar(entorno, { fecha: "2026-03-01T00:00:00.000Z" }),
    );
    const justoAntesDelCierre = await leerJson<MovimientoJson>(
      await cargar(entorno, { fecha: "2026-03-31T23:59:59.999Z" }),
    );
    const enElCierre = await leerJson<MovimientoJson>(
      await cargar(entorno, { fecha: "2026-04-01T00:00:00.000Z" }),
    );

    expect(enApertura.periodoId).toBe(entorno.marzo.id);
    expect(justoAntesDelCierre.periodoId).toBe(entorno.marzo.id);
    expect(enElCierre.periodoId).toBe(entorno.abril.id);
  });

  it("el período abierto acepta cualquier fecha posterior a su apertura, también futura", async () => {
    const entorno = await prepararConVariosPeriodos();

    const respuesta = await cargar(entorno, { fecha: "2031-01-01T12:00:00.000Z" });

    expect(respuesta.status).toBe(201);
    expect((await leerJson<MovimientoJson>(respuesta)).periodoId).toBe(entorno.junio.id);
  });

  it("rechaza una fecha en un hueco entre períodos, con el error en el campo fecha", async () => {
    const entorno = await prepararConVariosPeriodos();

    const respuesta = await cargar(entorno, { fecha: "2026-05-15T12:00:00.000Z" });

    expect(respuesta.status).toBe(400);
    const cuerpo = await leerJson<RespuestaError>(respuesta);
    expect(cuerpo.error.campos?.[0]?.campo).toBe("fecha");
    expect(cuerpo.error.mensaje).toContain("ninguno de tus períodos");
    const listado = await leerJson<{ total: number }>(
      await app.request("/api/finanzas/movimientos", { headers: { cookie: entorno.cookies } }),
    );
    expect(listado.total).toBe(0);
  });

  it("rechaza una fecha anterior al primer período", async () => {
    const entorno = await prepararConVariosPeriodos();

    const respuesta = await cargar(entorno, { fecha: "2026-02-28T23:59:59.999Z" });

    expect(respuesta.status).toBe(400);
  });

  it("sin ningún período abierto avisa que hay que abrir uno", async () => {
    const entorno = await prepararEntorno({ conPeriodo: false });

    const respuesta = await cargar(entorno);

    expect(respuesta.status).toBe(400);
    const cuerpo = await leerJson<RespuestaError>(respuesta);
    expect(cuerpo.error.campos?.[0]?.campo).toBe("fecha");
    expect(cuerpo.error.mensaje).toContain("Abrí uno");
  });

  it("después de cerrar el último período ya no se puede cargar con fecha posterior", async () => {
    const entorno = await prepararEntorno();
    await cerrarPeriodo(app, entorno.cookies, entorno.periodo?.id ?? 0, {
      cierreEn: "2026-09-20T00:00:00.000Z",
    });

    const dentro = await cargar(entorno, { fecha: "2026-09-19T12:00:00.000Z" });
    const despues = await cargar(entorno, { fecha: "2026-09-20T12:00:00.000Z" });

    expect(dentro.status).toBe(201);
    expect(despues.status).toBe(400);
    expect((await leerJson<RespuestaError>(despues)).error.mensaje).toContain("Abrí uno");
  });

  it("no usa los períodos de otra persona", async () => {
    const primero = await prepararEntorno({ conPeriodo: false });
    const segundo = await prepararEntorno();

    // Tiene período abierto, pero es del segundo: el primero sigue sin ninguno.
    expect((await cargar(primero)).status).toBe(400);
    expect((await cargar(segundo)).status).toBe(201);
  });

  it("al editar la fecha hacia otro período, el movimiento cambia de período", async () => {
    const entorno = await prepararConVariosPeriodos();
    const creado = await leerJson<MovimientoJson>(
      await cargar(entorno, { fecha: "2026-03-15T12:00:00.000Z" }),
    );

    const respuesta = await app.request(`/api/finanzas/movimientos/${creado.id}`, {
      method: "PATCH",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: cuerpoMovimiento(entorno, { fecha: "2026-06-10T12:00:00.000Z" }),
    });

    expect(respuesta.status).toBe(200);
    expect((await leerJson<MovimientoJson>(respuesta)).periodoId).toBe(entorno.junio.id);
  });

  it("al editar la fecha hacia un hueco se rechaza y el movimiento queda como estaba", async () => {
    const entorno = await prepararConVariosPeriodos();
    const creado = await leerJson<MovimientoJson>(
      await cargar(entorno, { fecha: "2026-03-15T12:00:00.000Z", descripcion: "Original" }),
    );

    const respuesta = await app.request(`/api/finanzas/movimientos/${creado.id}`, {
      method: "PATCH",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: cuerpoMovimiento(entorno, {
        fecha: "2026-05-15T12:00:00.000Z",
        descripcion: "Cambiado",
      }),
    });

    expect(respuesta.status).toBe(400);
    const listado = await leerJson<{ movimientos: MovimientoJson[] }>(
      await app.request("/api/finanzas/movimientos", { headers: { cookie: entorno.cookies } }),
    );
    expect(listado.movimientos[0]).toMatchObject({
      descripcion: "Original",
      fecha: "2026-03-15T12:00:00.000Z",
      periodoId: entorno.marzo.id,
    });
  });

  it("editar un movimiento de un período cerrado sin cambiar la fecha lo deja en su período", async () => {
    const entorno = await prepararConVariosPeriodos();
    const creado = await leerJson<MovimientoJson>(
      await cargar(entorno, { fecha: "2026-03-15T12:00:00.000Z" }),
    );

    const respuesta = await app.request(`/api/finanzas/movimientos/${creado.id}`, {
      method: "PATCH",
      headers: { cookie: entorno.cookies, "content-type": "application/json" },
      body: cuerpoMovimiento(entorno, {
        fecha: "2026-03-15T12:00:00.000Z",
        descripcion: "Corregido",
      }),
    });

    expect(respuesta.status).toBe(200);
    expect(await leerJson<MovimientoJson>(respuesta)).toMatchObject({
      descripcion: "Corregido",
      periodoId: entorno.marzo.id,
    });
  });

  it("duplicar sin período abierto se rechaza", async () => {
    const entorno = await prepararEntorno();
    const creado = await leerJson<MovimientoJson>(await cargar(entorno));
    await cerrarPeriodo(app, entorno.cookies, entorno.periodo?.id ?? 0, {
      cierreEn: "2026-09-20T00:00:00.000Z",
    });

    const respuesta = await app.request(`/api/finanzas/movimientos/${creado.id}/duplicar`, {
      method: "POST",
      headers: { cookie: entorno.cookies },
    });

    expect(respuesta.status).toBe(400);
    expect((await leerJson<RespuestaError>(respuesta)).error.mensaje).toContain("Abrí uno");
  });
});

describe("POST /api/finanzas/movimientos/:id/duplicar", () => {
  it("crea una copia con la fecha y hora de ahora, en el período que corresponde", async () => {
    const entorno = await prepararEntorno();
    const creado = await leerJson<MovimientoJson>(
      await app.request("/api/finanzas/movimientos", {
        method: "POST",
        headers: { cookie: entorno.cookies, "content-type": "application/json" },
        body: cuerpoMovimiento(entorno, { fecha: "2026-02-01T12:00:00.000Z" }),
      }),
    );

    const respuesta = await app.request(`/api/finanzas/movimientos/${creado.id}/duplicar`, {
      method: "POST",
      headers: { cookie: entorno.cookies },
    });

    expect(respuesta.status).toBe(201);
    const duplicado = await leerJson<MovimientoJson>(respuesta);
    expect(duplicado.id).not.toBe(creado.id);
    expect(duplicado.importeCentavos).toBe(creado.importeCentavos);
    expect(Math.abs(new Date(duplicado.fecha).getTime() - Date.now())).toBeLessThan(10_000);
    expect(duplicado.periodoId).toBe(entorno.periodo?.id);

    const cuerpo = await leerJson<{ total: number }>(
      await app.request("/api/finanzas/movimientos", { headers: { cookie: entorno.cookies } }),
    );
    expect(cuerpo.total).toBe(2);
  });

  it("responde 404 al duplicar un movimiento inexistente", async () => {
    const entorno = await prepararEntorno();

    const respuesta = await app.request(
      "/api/finanzas/movimientos/00000000-0000-0000-0000-000000000000/duplicar",
      { method: "POST", headers: { cookie: entorno.cookies } },
    );

    expect(respuesta.status).toBe(404);
  });
});
