// Tests de integración del resumen y las estadísticas por período, contra gestion_test.

import type { ClienteDb } from "@gestoria/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  cookiesDe,
  entrarConUsuario,
  limpiarBase,
  registrarAprobado,
} from "../../pruebas/auth-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../../pruebas/entorno-de-prueba.ts";
import { abrirPeriodo, cerrarPeriodo, type PeriodoJson } from "../../pruebas/periodos-de-prueba.ts";

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

async function entrarComoUsuario(): Promise<string> {
  const datos = await registrarAprobado(app, cliente);
  return cookiesDe(await entrarConUsuario(app, datos.usuario, datos.password));
}

type CategoriaJson = { id: number; nombre: string };
type CuentaJson = { id: string; nombre: string };

/** Entra y deja lista una categoría y una cuenta. Todavía sin ningún período. */
async function prepararEntorno(): Promise<{
  cookies: string;
  categoriaId: number;
  otraCategoriaId: number;
  cuentaId: string;
}> {
  const cookies = await entrarComoUsuario();
  const categorias = await leerJson<{ categorias: CategoriaJson[] }>(
    await app.request("/api/finanzas/categorias", { headers: { cookie: cookies } }),
  );
  const cuentas = await leerJson<{ cuentas: CuentaJson[] }>(
    await app.request("/api/finanzas/cuentas", { headers: { cookie: cookies } }),
  );
  return {
    cookies,
    categoriaId: categorias.categorias[0]?.id ?? 0,
    otraCategoriaId: categorias.categorias[1]?.id ?? 0,
    cuentaId: cuentas.cuentas[0]?.id ?? "",
  };
}

async function crearMovimiento(
  cookies: string,
  entorno: { categoriaId: number; cuentaId: string },
  datos: {
    tipo: "ingreso" | "gasto";
    importe: number;
    fecha: string;
    descripcion?: string;
    categoriaId?: number;
  },
): Promise<void> {
  const respuesta = await app.request("/api/finanzas/movimientos", {
    method: "POST",
    headers: { cookie: cookies, "content-type": "application/json" },
    body: JSON.stringify({
      descripcion: "Movimiento",
      cuentaFinancieraId: entorno.cuentaId,
      ...datos,
      categoriaId: datos.categoriaId ?? entorno.categoriaId,
    }),
  });
  if (respuesta.status !== 201) {
    throw new Error(
      `No se pudo crear el movimiento (${respuesta.status}): ${await respuesta.text()}`,
    );
  }
}

/** Agosto cerrado (1/8 a 1/9) y Setiembre abierto desde el 1/9: el caso típico "mes a mes". */
async function prepararAgostoYSetiembre(): Promise<{
  cookies: string;
  categoriaId: number;
  otraCategoriaId: number;
  cuentaId: string;
  agosto: PeriodoJson;
  setiembre: PeriodoJson;
}> {
  const entorno = await prepararEntorno();
  const agosto = await abrirPeriodo(app, entorno.cookies, {
    nombre: "Agosto",
    aperturaEn: "2026-08-01T00:00:00.000Z",
  });
  await cerrarPeriodo(app, entorno.cookies, agosto.id, { cierreEn: "2026-09-01T00:00:00.000Z" });
  const setiembre = await abrirPeriodo(app, entorno.cookies, {
    nombre: "Setiembre",
    aperturaEn: "2026-09-01T00:00:00.000Z",
  });
  return { ...entorno, agosto, setiembre };
}

async function pedir(cookies: string, ruta: string): Promise<Response> {
  return app.request(ruta, { headers: { cookie: cookies } });
}

describe("GET /api/finanzas/resumen", () => {
  it("responde 401 sin sesión", async () => {
    expect((await app.request("/api/finanzas/resumen?periodoId=1")).status).toBe(401);
  });

  it.each(["", "?periodoId=abc", "?periodoId=0", "?periodoId=-1", "?periodoId=1.5"])(
    "rechaza un periodoId inválido o ausente: %j",
    async (consulta) => {
      const entorno = await prepararEntorno();

      const respuesta = await pedir(entorno.cookies, `/api/finanzas/resumen${consulta}`);

      expect(respuesta.status).toBe(400);
    },
  );

  it("responde 404 si el período no existe", async () => {
    const entorno = await prepararEntorno();

    expect((await pedir(entorno.cookies, "/api/finanzas/resumen?periodoId=999999")).status).toBe(
      404,
    );
  });

  it("responde 404 con el período de otra persona, sin mostrar nada de él", async () => {
    const dueno = await prepararEntorno();
    const intruso = await prepararEntorno();
    const periodo = await abrirPeriodo(app, dueno.cookies, {
      aperturaEn: "2026-01-01T00:00:00.000Z",
    });
    await crearMovimiento(dueno.cookies, dueno, {
      tipo: "ingreso",
      importe: 1000,
      fecha: "2026-03-01T12:00:00.000Z",
    });

    const respuesta = await pedir(intruso.cookies, `/api/finanzas/resumen?periodoId=${periodo.id}`);

    expect(respuesta.status).toBe(404);
  });

  it("calcula ingresos, gastos y balance del período y los compara con el anterior", async () => {
    const entorno = await prepararAgostoYSetiembre();
    await crearMovimiento(entorno.cookies, entorno, {
      tipo: "ingreso",
      importe: 1000,
      fecha: "2026-09-05T12:00:00.000Z",
    });
    await crearMovimiento(entorno.cookies, entorno, {
      tipo: "gasto",
      importe: 300,
      fecha: "2026-09-10T12:00:00.000Z",
    });
    // Del período anterior: no debe mezclarse con el actual.
    await crearMovimiento(entorno.cookies, entorno, {
      tipo: "ingreso",
      importe: 500,
      fecha: "2026-08-01T12:00:00.000Z",
    });

    const resumen = await leerJson<{
      periodo: PeriodoJson;
      ingresosCentavos: number;
      gastosCentavos: number;
      balanceCentavos: number;
      periodoAnterior: { nombre: string; ingresosCentavos: number; gastosCentavos: number } | null;
    }>(await pedir(entorno.cookies, `/api/finanzas/resumen?periodoId=${entorno.setiembre.id}`));

    expect(resumen.periodo).toMatchObject({
      id: entorno.setiembre.id,
      nombre: "Setiembre",
      abierto: true,
    });
    expect(resumen.ingresosCentavos).toBe(100_000);
    expect(resumen.gastosCentavos).toBe(30_000);
    expect(resumen.balanceCentavos).toBe(70_000);
    expect(resumen.periodoAnterior).toEqual({
      nombre: "Agosto",
      ingresosCentavos: 50_000,
      gastosCentavos: 0,
    });
  });

  it("el primer período no tiene anterior", async () => {
    const entorno = await prepararAgostoYSetiembre();

    const resumen = await leerJson<{ periodoAnterior: unknown }>(
      await pedir(entorno.cookies, `/api/finanzas/resumen?periodoId=${entorno.agosto.id}`),
    );

    expect(resumen.periodoAnterior).toBeNull();
  });

  it("el anterior es el inmediato por apertura, aunque haya un hueco entre los dos", async () => {
    const entorno = await prepararAgostoYSetiembre();
    await cerrarPeriodo(app, entorno.cookies, entorno.setiembre.id, {
      cierreEn: "2026-09-10T00:00:00.000Z",
    });
    const octubre = await abrirPeriodo(app, entorno.cookies, {
      nombre: "Octubre",
      aperturaEn: "2026-09-25T00:00:00.000Z",
    });

    const resumen = await leerJson<{ periodoAnterior: { nombre: string } | null }>(
      await pedir(entorno.cookies, `/api/finanzas/resumen?periodoId=${octubre.id}`),
    );

    expect(resumen.periodoAnterior?.nombre).toBe("Setiembre");
  });

  it("un período que no coincide con un mes suma todo lo suyo, venga del mes que venga", async () => {
    const entorno = await prepararEntorno();
    const periodo = await abrirPeriodo(app, entorno.cookies, {
      nombre: "Del 10 al 20",
      aperturaEn: "2026-03-10T00:00:00.000Z",
    });
    await cerrarPeriodo(app, entorno.cookies, periodo.id, { cierreEn: "2026-04-20T00:00:00.000Z" });
    await abrirPeriodo(app, entorno.cookies, {
      nombre: "Siguiente",
      aperturaEn: "2026-04-20T00:00:00.000Z",
    });
    for (const fecha of [
      "2026-03-10T00:00:00.000Z", // primer instante
      "2026-03-31T12:00:00.000Z", // fin de marzo
      "2026-04-01T12:00:00.000Z", // comienzo de abril
      "2026-04-19T23:59:59.000Z", // último instante
    ]) {
      await crearMovimiento(entorno.cookies, entorno, { tipo: "gasto", importe: 10, fecha });
    }
    // Ya del siguiente período.
    await crearMovimiento(entorno.cookies, entorno, {
      tipo: "gasto",
      importe: 999,
      fecha: "2026-04-20T00:00:00.000Z",
    });

    const resumen = await leerJson<{ gastosCentavos: number }>(
      await pedir(entorno.cookies, `/api/finanzas/resumen?periodoId=${periodo.id}`),
    );

    expect(resumen.gastosCentavos).toBe(4_000);
  });

  it("no cuenta los movimientos eliminados", async () => {
    const entorno = await prepararAgostoYSetiembre();
    await crearMovimiento(entorno.cookies, entorno, {
      tipo: "gasto",
      importe: 100,
      fecha: "2026-09-05T12:00:00.000Z",
    });
    const listado = await leerJson<{ movimientos: { id: string }[] }>(
      await pedir(entorno.cookies, "/api/finanzas/movimientos"),
    );
    await app.request(`/api/finanzas/movimientos/${listado.movimientos[0]?.id}`, {
      method: "DELETE",
      headers: { cookie: entorno.cookies },
    });

    const resumen = await leerJson<{ gastosCentavos: number }>(
      await pedir(entorno.cookies, `/api/finanzas/resumen?periodoId=${entorno.setiembre.id}`),
    );

    expect(resumen.gastosCentavos).toBe(0);
  });

  it("el período vacío da todo en cero", async () => {
    const entorno = await prepararAgostoYSetiembre();

    const resumen = await leerJson<{
      ingresosCentavos: number;
      gastosCentavos: number;
      balanceCentavos: number;
    }>(await pedir(entorno.cookies, `/api/finanzas/resumen?periodoId=${entorno.setiembre.id}`));

    expect(resumen).toMatchObject({ ingresosCentavos: 0, gastosCentavos: 0, balanceCentavos: 0 });
  });

  it("el disponible es la suma de los saldos de las cuentas, no el balance del período", async () => {
    const entorno = await prepararAgostoYSetiembre();
    await crearMovimiento(entorno.cookies, entorno, {
      tipo: "ingreso",
      importe: 1000,
      fecha: "2026-08-10T12:00:00.000Z",
    });

    const resumen = await leerJson<{ disponibleCentavos: number; balanceCentavos: number }>(
      await pedir(entorno.cookies, `/api/finanzas/resumen?periodoId=${entorno.setiembre.id}`),
    );

    // El ingreso fue en agosto: no aporta al balance de setiembre, pero sigue
    // estando disponible en la cuenta.
    expect(resumen.balanceCentavos).toBe(0);
    expect(resumen.disponibleCentavos).toBe(100_000);
  });

  it("trae solo los últimos movimientos del período pedido, no los de otros", async () => {
    const entorno = await prepararAgostoYSetiembre();
    await crearMovimiento(entorno.cookies, entorno, {
      tipo: "gasto",
      importe: 10,
      fecha: "2026-08-02T12:00:00.000Z",
      descripcion: "De agosto",
    });

    const resumen = await leerJson<{ ultimosMovimientos: { descripcion: string }[] }>(
      await pedir(entorno.cookies, `/api/finanzas/resumen?periodoId=${entorno.setiembre.id}`),
    );

    // El movimiento es de agosto: el resumen de setiembre no lo muestra.
    expect(resumen.ultimosMovimientos).toEqual([]);

    const deAgosto = await leerJson<{ ultimosMovimientos: { descripcion: string }[] }>(
      await pedir(entorno.cookies, `/api/finanzas/resumen?periodoId=${entorno.agosto.id}`),
    );
    expect(deAgosto.ultimosMovimientos.map((m) => m.descripcion)).toEqual(["De agosto"]);
  });
});

describe("GET /api/finanzas/estadisticas", () => {
  it("responde 401 sin sesión y 404 con un período ajeno o inexistente", async () => {
    const dueno = await prepararEntorno();
    const intruso = await prepararEntorno();
    const periodo = await abrirPeriodo(app, dueno.cookies);

    expect((await app.request(`/api/finanzas/estadisticas?periodoId=${periodo.id}`)).status).toBe(
      401,
    );
    expect(
      (await pedir(intruso.cookies, `/api/finanzas/estadisticas?periodoId=${periodo.id}`)).status,
    ).toBe(404);
    expect((await pedir(dueno.cookies, "/api/finanzas/estadisticas?periodoId=999999")).status).toBe(
      404,
    );
    expect((await pedir(dueno.cookies, "/api/finanzas/estadisticas")).status).toBe(400);
  });

  it("agrupa los gastos por categoría, de mayor a menor", async () => {
    const entorno = await prepararAgostoYSetiembre();
    await crearMovimiento(entorno.cookies, entorno, {
      tipo: "gasto",
      importe: 100,
      fecha: "2026-09-01T12:00:00.000Z",
    });
    await crearMovimiento(entorno.cookies, entorno, {
      tipo: "gasto",
      importe: 500,
      fecha: "2026-09-02T12:00:00.000Z",
      categoriaId: entorno.otraCategoriaId,
    });

    const cuerpo = await leerJson<{
      gastosPorCategoria: { categoriaId: number; totalCentavos: number }[];
    }>(
      await pedir(entorno.cookies, `/api/finanzas/estadisticas?periodoId=${entorno.setiembre.id}`),
    );

    expect(cuerpo.gastosPorCategoria[0]?.categoriaId).toBe(entorno.otraCategoriaId);
    expect(cuerpo.gastosPorCategoria[0]?.totalCentavos).toBe(50_000);
    expect(cuerpo.gastosPorCategoria[1]?.totalCentavos).toBe(10_000);
  });

  it("solo cuenta los gastos del período pedido", async () => {
    const entorno = await prepararAgostoYSetiembre();
    await crearMovimiento(entorno.cookies, entorno, {
      tipo: "gasto",
      importe: 100,
      fecha: "2026-08-15T12:00:00.000Z",
    });

    const cuerpo = await leerJson<{ gastosPorCategoria: unknown[] }>(
      await pedir(entorno.cookies, `/api/finanzas/estadisticas?periodoId=${entorno.setiembre.id}`),
    );

    expect(cuerpo.gastosPorCategoria).toHaveLength(0);
  });

  it("no incluye los ingresos en los gastos por categoría", async () => {
    const entorno = await prepararAgostoYSetiembre();
    await crearMovimiento(entorno.cookies, entorno, {
      tipo: "ingreso",
      importe: 1000,
      fecha: "2026-09-01T12:00:00.000Z",
    });

    const cuerpo = await leerJson<{ gastosPorCategoria: unknown[] }>(
      await pedir(entorno.cookies, `/api/finanzas/estadisticas?periodoId=${entorno.setiembre.id}`),
    );

    expect(cuerpo.gastosPorCategoria).toHaveLength(0);
  });

  /** Abre y cierra `cantidad` períodos de 10 días seguidos; el último queda abierto. */
  async function abrirPeriodosSeguidos(cookies: string, cantidad: number): Promise<PeriodoJson[]> {
    const periodos: PeriodoJson[] = [];
    for (let i = 0; i < cantidad; i += 1) {
      const apertura = new Date(Date.UTC(2026, 0, 1 + i * 10)).toISOString();
      const periodo = await abrirPeriodo(app, cookies, {
        nombre: `P${i + 1}`,
        aperturaEn: apertura,
      });
      periodos.push(periodo);
      if (i < cantidad - 1) {
        await cerrarPeriodo(app, cookies, periodo.id, {
          cierreEn: new Date(Date.UTC(2026, 0, 1 + (i + 1) * 10)).toISOString(),
        });
      }
    }
    return periodos;
  }

  it("trae la evolución de los últimos 6 períodos terminando en el pedido, del más viejo al más nuevo", async () => {
    const entorno = await prepararEntorno();
    const periodos = await abrirPeriodosSeguidos(entorno.cookies, 8);
    await crearMovimiento(entorno.cookies, entorno, {
      tipo: "ingreso",
      importe: 1000,
      fecha: "2026-03-05T12:00:00.000Z", // cae en P7 (Mar 2 a Mar 12... el séptimo arranca el 2/3)
    });

    const septimo = periodos[6];
    const cuerpo = await leerJson<{
      evolucionPorPeriodo: { periodoId: number; nombre: string; ingresosCentavos: number }[];
    }>(await pedir(entorno.cookies, `/api/finanzas/estadisticas?periodoId=${septimo?.id}`));

    expect(cuerpo.evolucionPorPeriodo.map((p) => p.nombre)).toEqual([
      "P2",
      "P3",
      "P4",
      "P5",
      "P6",
      "P7",
    ]);
    expect(cuerpo.evolucionPorPeriodo.at(-1)?.periodoId).toBe(septimo?.id);
    expect(cuerpo.evolucionPorPeriodo.at(-1)?.ingresosCentavos).toBe(100_000);
  });

  it("con menos de 6 períodos trae solo los que hay hasta el pedido", async () => {
    const entorno = await prepararEntorno();
    const periodos = await abrirPeriodosSeguidos(entorno.cookies, 4);

    const cuerpo = await leerJson<{ evolucionPorPeriodo: { nombre: string }[] }>(
      await pedir(entorno.cookies, `/api/finanzas/estadisticas?periodoId=${periodos[1]?.id}`),
    );

    expect(cuerpo.evolucionPorPeriodo.map((p) => p.nombre)).toEqual(["P1", "P2"]);
  });

  it("incluye los períodos sin movimientos, con ceros", async () => {
    const entorno = await prepararAgostoYSetiembre();

    const cuerpo = await leerJson<{
      evolucionPorPeriodo: { nombre: string; ingresosCentavos: number; gastosCentavos: number }[];
    }>(
      await pedir(entorno.cookies, `/api/finanzas/estadisticas?periodoId=${entorno.setiembre.id}`),
    );

    expect(cuerpo.evolucionPorPeriodo).toEqual([
      expect.objectContaining({ nombre: "Agosto", ingresosCentavos: 0, gastosCentavos: 0 }),
      expect.objectContaining({ nombre: "Setiembre", ingresosCentavos: 0, gastosCentavos: 0 }),
    ]);
  });

  it("no mezcla los períodos de otra persona en la evolución", async () => {
    const primero = await prepararAgostoYSetiembre();
    const segundo = await prepararEntorno();
    await abrirPeriodo(app, segundo.cookies, {
      nombre: "Ajeno",
      aperturaEn: "2026-08-15T00:00:00.000Z",
    });

    const cuerpo = await leerJson<{ evolucionPorPeriodo: { nombre: string }[] }>(
      await pedir(primero.cookies, `/api/finanzas/estadisticas?periodoId=${primero.setiembre.id}`),
    );

    expect(cuerpo.evolucionPorPeriodo.map((p) => p.nombre)).toEqual(["Agosto", "Setiembre"]);
  });
});
